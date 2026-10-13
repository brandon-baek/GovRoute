import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from pipeline.locations import ROOT, add_census, dataset, load_manifest
from pipeline.processes import load_processes


class ProcessPublicationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "database/registry/001_registry.sql").read_text())
        dataset(self.db, "fixture", "https://www.census.gov", "Census", "fixture")
        self.db.execute("INSERT INTO places(id,name,search_name,kind,name_status,government_status,dataset_id) VALUES('country:US','United States','united states','country','official','active','fixture')")
        self.state = add_census(self.db, {"GEOID": "06", "NAME": "California", "STUSAB": "CA", "STATE": "06", "FUNCSTAT": "A"}, "state", "fixture", 80)
        self.tx = add_census(self.db, {"GEOID":"48","NAME":"Texas","STUSAB":"TX","STATE":"48","FUNCSTAT":"A"}, "state", "fixture", 80)
        self.ny = add_census(self.db, {"GEOID":"36","NAME":"New York","STUSAB":"NY","STATE":"36","FUNCSTAT":"A"}, "state", "fixture", 80)
        self.sf = add_census(self.db, {"GEOID":"0667000","NAME":"San Francisco city","STUSAB":"CA","STATE":"06","FUNCSTAT":"A"}, "municipality", "fixture", 28)
        self.la = add_census(self.db, {"GEOID":"06037","NAME":"Los Angeles County","STUSAB":"CA","STATE":"06","FUNCSTAT":"A"}, "county", "fixture", 82)
        self.nd = add_census(self.db, {"GEOID":"38","NAME":"North Dakota","STUSAB":"ND","STATE":"38","FUNCSTAT":"A"}, "state", "fixture", 80)
        self.wa = add_census(self.db, {"GEOID":"53","NAME":"Washington","STUSAB":"WA","STATE":"53","FUNCSTAT":"A"}, "state", "fixture", 80)
        self.king = add_census(self.db, {"GEOID":"53033","NAME":"King County","STUSAB":"WA","STATE":"53","FUNCSTAT":"A"}, "county", "fixture", 82)
        load_manifest(self.db, ROOT / "data/registry/sources.json")
        self.db.commit()
        self.manifest = json.loads((ROOT / "data/registry/processes.json").read_text())

    def tearDown(self):
        self.db.close()

    def publish(self, manifest=None):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "processes.json"
            file.write_text(json.dumps(manifest or self.manifest))
            with self.db:
                return load_processes(self.db, file)

    def test_publishes_sourced_steps_with_explicit_state_and_federal_scopes(self):
        self.assertEqual(self.publish(), 16)
        scopes = dict(self.db.execute("SELECT process_id,territory_id FROM process_publications").fetchall())
        self.assertEqual(scopes, {
            "journey-ca-new-resident": self.state, "journey-passport-apply": "country:US",
            "journey-tx-license-transfer": self.tx, "journey-ny-plate-surrender": self.ny,
            "journey-sf-damaged-public-property": self.sf,
            **{item["journey"]["id"]: self.la for item in self.manifest["processes"] if item["territory"] == {"geoid":"06037","kind":"county"}},
            **{item["journey"]["id"]: self.king for item in self.manifest["processes"] if item["territory"] == {"geoid":"53033","kind":"county"}},
            "journey-voter-registration-start":"country:US", "journey-birth-certificate-start":"country:US", "journey-irs-ein":"country:US", "journey-driver-license-start":"country:US", "journey-nd-voting-start":self.nd,
        })
        self.assertEqual(self.db.execute("SELECT count(*) FROM process_steps").fetchone()[0], sum(len(item["journey"]["steps"]) for item in self.manifest["processes"]))
        document = json.loads(self.db.execute("SELECT document_json FROM process_publications WHERE process_id='journey-passport-apply'").fetchone()[0])
        self.assertEqual(document["steps"][1]["dependsOn"], ["choose"])
        self.assertTrue(document["steps"][2]["fees"])
        self.assertFalse(self.db.execute("SELECT 1 FROM legal_snapshots").fetchone(), "Authored publications must not invent crawler snapshots")
        self.assertFalse(self.db.execute("PRAGMA foreign_key_check").fetchall())

    def test_missing_topic_scope_prevents_publication_and_rolls_back_all_processes(self):
        with self.db:
            self.db.execute("DELETE FROM authority_scopes WHERE authority_id='authority:ca-dmv'")
        with self.assertRaisesRegex(ValueError, "scope"):
            self.publish()
        self.assertEqual(self.db.execute("SELECT count(*) FROM process_definitions").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM process_step_sources").fetchone()[0], 0)

    def test_unreviewed_or_wrong_authority_source_cannot_support_a_step(self):
        with self.db:
            self.db.execute("UPDATE legal_sources SET authority_id='authority:ca-dmv' WHERE id='passport-mail'")
        with self.assertRaisesRegex(ValueError, "authority and topic"):
            self.publish()

    def test_missing_source_and_future_dependency_are_rejected(self):
        for field, value, message in [("sourceIds", ["not-declared"], "cite"), ("dependsOn", ["timing"], "earlier")]:
            bad = copy.deepcopy(self.manifest)
            bad["processes"][0]["journey"]["steps"][0][field] = value
            with self.assertRaisesRegex(ValueError, message):
                self.publish(bad)
            self.assertEqual(self.db.execute("SELECT count(*) FROM process_publications").fetchone()[0], 0)

    def test_statistical_or_wrong_state_selector_cannot_publish_a_state_process(self):
        bad = copy.deepcopy(self.manifest)
        bad["processes"][1]["territory"] = {"id": "country:US"}
        with self.assertRaisesRegex(ValueError, "conflicting territory"):
            self.publish(bad)

    def test_duplicate_ids_or_steps_cannot_publish(self):
        for level in ("process", "step"):
            bad = copy.deepcopy(self.manifest)
            if level == "process":
                bad["processes"].append(bad["processes"][0])
            else:
                bad["processes"][0]["journey"]["steps"].append(bad["processes"][0]["journey"]["steps"][0])
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                self.publish(bad)

    def test_review_date_mismatch_is_rejected(self):
        bad = copy.deepcopy(self.manifest)
        bad["processes"][0]["journey"]["sources"][0]["lastChecked"] = "2020-01-01"
        with self.assertRaisesRegex(ValueError, "date"):
            self.publish(bad)


    def scoped_fixture(self, kind):
        tx=self.tx
        town=add_census(self.db,{"GEOID":"4812345","NAME":"Fixture city","STUSAB":"TX","STATE":"48","FUNCSTAT":"A"},"municipality","fixture",28)
        self.db.execute("INSERT INTO authorities VALUES('fixture-office',NULL,'Fixture office','state','https://fixture.gov','reviewed')")
        self.db.execute("INSERT INTO legal_sources(id,authority_id,topic,title,url,source_kind,reviewed_at) VALUES('fixture-source','fixture-office','test_service','Fixture service','https://fixture.gov/service','procedure','2026-10-09')")
        for territory in (tx,town):
            self.db.execute("INSERT INTO authority_scopes VALUES('fixture-office',?,'test_service','service_provider','https://fixture.gov/service','2026-10-09')",(territory,))
        self.db.commit()
        guide={"id":"fixture-process","slug":"fixture-process","title":"Fixture service","summary":"Fixture service instructions","category":"Fixture","jurisdiction":kind,"state":"TX","audience":[],"aliases":[],"reviewStatus":"verified","reviewedAt":"2026-10-09",
            "steps":[{"id":"apply","title":"Apply","detail":"Follow the official instructions.","sourceIds":["fixture-source"]}],
            "sources":[{"id":"fixture-source","title":"Fixture service","url":"https://fixture.gov/service","publisher":"Fixture office","lastChecked":"2026-10-09"}]}
        selector={"state_code":"TX"} if kind=="state" else {"geoid":"4812345","kind":"municipality"}
        return {"processes":[{"authority_id":"fixture-office","topic":"test_service","territory":selector,"journey":guide}]},tx,town

    def assert_scoped_publication(self, kind):
        manifest, tx, town = self.scoped_fixture(kind)
        self.assertEqual(self.publish(manifest), 1)
        document = json.loads(self.db.execute(
            "SELECT document_json FROM process_publications WHERE process_id='fixture-process'"
        ).fetchone()[0])
        self.assertEqual(document["territoryIds"], [tx if kind == "state" else town])
        self.assertFalse(self.db.execute("PRAGMA foreign_key_check").fetchall())

    def test_generic_state_publication_keeps_exact_territory_id(self):
        self.assert_scoped_publication("state")

    def test_local_publication_keeps_exact_territory_id(self):
        self.assert_scoped_publication("local")

    def test_generic_state_rejects_wrong_state_and_local_territories(self):
        manifest, tx, town = self.scoped_fixture("state")
        bad = copy.deepcopy(manifest)
        bad["processes"][0]["journey"]["state"] = "CA"
        with self.assertRaisesRegex(ValueError, "territory"):
            self.publish(bad)
        for selector in ({"id": "country:US"}, {"id": town}):
            bad = copy.deepcopy(manifest)
            bad["processes"][0]["territory"] = selector
            with self.assertRaisesRegex(ValueError, "territory"):
                self.publish(bad)

    def test_wrong_state_or_local_country_scope_cannot_publish(self):
        manifest,tx,town=self.scoped_fixture("local")
        for modify in (lambda guide:guide.update(state="CA"),lambda guide:guide.update(territoryIds=["country:US"])):
            bad=copy.deepcopy(manifest);modify(bad["processes"][0]["journey"])
            with self.assertRaisesRegex(ValueError,"territory"): self.publish(bad)
        bad=copy.deepcopy(manifest);bad["processes"][0]["territory"]={"id":"country:US"}
        with self.assertRaisesRegex(ValueError,"territory"): self.publish(bad)

if __name__ == "__main__":
    unittest.main()
