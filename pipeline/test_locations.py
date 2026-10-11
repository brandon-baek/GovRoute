import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from pipeline.locations import ROOT, add_census, census_rows, dataset, import_gnis, point, government_status, staged_products
from pipeline.legal_sources import store_snapshot


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript((ROOT / "database/registry/001_registry.sql").read_text())
        dataset(self.db, "census", "https://www.census.gov", "Census", "test fixture")
        self.state = add_census(self.db, {"GEOID": "06", "NAME": "California", "STUSAB": "CA", "STATE": "06", "FUNCSTAT": "A"}, "state", "census", 80)
        self.county = add_census(self.db, {"GEOID": "06001", "NAME": "Fixture County", "STATE": "06", "FUNCSTAT": "A"}, "county", "census", 82)

    def tearDown(self):
        self.db.close()

    def test_statistical_place_never_creates_a_government(self):
        key = add_census(self.db, {"GEOID": "0612345", "NAME": "Fixture CDP", "STATE": "06", "FUNCSTAT": "A"}, "cdp", "census", 30)
        self.assertEqual(self.db.execute("SELECT government_status FROM places WHERE id=?", (key,)).fetchone()[0], "none")
        self.assertFalse(self.db.execute("SELECT 1 FROM authorities WHERE place_id=?", (key,)).fetchone())

    def test_nonfunctioning_county_is_not_a_governing_authority(self):
        key = add_census(self.db, {"GEOID": "09001", "NAME": "Statistical County Equivalent", "STATE": "09", "FUNCSTAT": "S"}, "county", "census", 82)
        self.assertFalse(self.db.execute("SELECT 1 FROM authorities WHERE place_id=?", (key,)).fetchone())
        self.assertEqual(government_status("I"), "inactive")
        self.assertEqual(government_status("T"), "unknown")

    def gnis(self, rows, names=None):
        with tempfile.TemporaryDirectory() as directory:
            populated = Path(directory) / "populated.txt"
            populated.write_text("feature_id|feature_name|feature_class|state_numeric|county_numeric|prim_lat_dec|prim_long_dec\n" + rows)
            namepath = Path(directory) / "names.txt"
            if names:
                namepath.write_text("FEATURE_ID|FEATURE_NAME\n" + names)
            import_gnis(self.db, populated, namepath if names else None, minimum=1)

    def test_same_name_is_not_an_identity_match(self):
        add_census(self.db, {"GEOID": "0612345", "NAME": "Springfield", "STATE": "06", "FUNCSTAT": "A", "PLACENS": "00111111"}, "municipality", "census", 28)
        self.gnis("222222|Springfield|Populated Place|6|1|0|0\n", "222222|Springfield\n222222|Old Springfield\n999999|River name\n")
        self.assertEqual(self.db.execute("SELECT count(*) FROM places WHERE name='Springfield'").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT status FROM place_names WHERE name='Old Springfield'").fetchone()[0], "unofficial")
        self.assertEqual(self.db.execute("SELECT name_status,government_status,latitude FROM places WHERE id='gnis:222222'").fetchone(), ("official", "unknown", None))
        self.assertFalse(self.db.execute("SELECT 1 FROM place_names WHERE name='River name'").fetchone())
        self.assertEqual(self.db.execute("SELECT relation FROM place_relations WHERE child_id='gnis:222222' AND parent_id=?", (self.county,)).fetchone()[0], "primary_point_in")

    def test_explicit_gnis_id_matches_census_without_duplicate(self):
        key = add_census(self.db, {"GEOID": "0612345", "NAME": "Fixture city", "STATE": "06", "FUNCSTAT": "A", "PLACENS": "00111111"}, "municipality", "census", 28)
        self.gnis("111111|Fixture|Populated Place|06|001|38|-122\n")
        self.assertFalse(self.db.execute("SELECT 1 FROM places WHERE id='gnis:111111'").fetchone())
        self.assertTrue(self.db.execute("SELECT 1 FROM place_names WHERE place_id=? AND name='Fixture'", (key,)).fetchone())

    def test_shared_gnis_id_stays_ambiguous(self):
        for layer, kind in [(26, "consolidated_city"), (28, "municipality")]:
            add_census(self.db, {"GEOID": "0612345", "NAME": "Fixture", "STATE": "06", "FUNCSTAT": "A", "PLACENS": "111111", "CONCITYNS": "111111"}, kind, "census", layer)
        self.gnis("111111|Fixture|Populated Place|06|001|38|-122\n")
        self.assertEqual(self.db.execute("SELECT count(*) FROM place_identifiers WHERE namespace='gnis' AND external_id='111111'").fetchone()[0], 3)

    def test_unknown_coordinates_are_not_real_points(self):
        self.assertEqual(point("0", "0"), (None, None))
        self.assertEqual(point("NaN", "-122"), (None, None))
        self.assertEqual(point("38", "-122"), (38.0, -122.0))

    def test_truncated_pagination_is_rejected(self):
        def fetch(url, **params):
            if not params:
                return {"fields": [{"name": "OBJECTID", "type": "esriFieldTypeOID"}], "advancedQueryCapabilities": {"supportsPagination": True}}
            if params.get("returnCountOnly"):
                return {"count": 3}
            return {"features": [{"attributes": {"OBJECTID": 1}}, {"attributes": {"OBJECTID": 2}}]}
        with self.assertRaisesRegex(RuntimeError, "Incomplete|Repeated"):
            list(census_rows("fixture", fetch, batch=2))

    def test_complete_pagination_checks_final_count(self):
        counts = iter([3, 4])
        def fetch(url, **params):
            if not params:
                return {"fields": [{"name": "OBJECTID", "type": "esriFieldTypeOID"}], "advancedQueryCapabilities": {"supportsPagination": True}}
            if params.get("returnCountOnly"):
                return {"count": next(counts)}
            offset = params["resultOffset"]
            return {"features": [{"attributes": {"OBJECTID": i}} for i in range(offset, min(offset + 2, 3))]}
        with self.assertRaisesRegex(RuntimeError, "changed"):
            list(census_rows("fixture", fetch, batch=2))

    def test_indexing_retains_versions_and_never_marks_them_reviewed(self):
        self.db.execute("INSERT INTO authorities VALUES('a',NULL,'Fixture','federal','https://example.gov','reviewed')")
        self.db.execute("INSERT INTO legal_sources(id,authority_id,topic,title,url,source_kind) VALUES('s','a','passport','Fixture','https://example.gov/path','procedure')")
        with self.db:
            self.assertTrue(store_snapshot(self.db, "s", "Initial procedure", "https://example.gov/path"))
            self.assertFalse(store_snapshot(self.db, "s", "Initial procedure", "https://example.gov/path"))
            self.assertTrue(store_snapshot(self.db, "s", "Changed procedure", "https://example.gov/path"))
        self.assertEqual(self.db.execute("SELECT count(*) FROM legal_snapshots").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT DISTINCT review_status FROM legal_snapshots").fetchall(), [("machine_indexed",)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM legal_search WHERE legal_search MATCH 'Changed'").fetchone()[0], 1)

    def test_census_existence_does_not_grant_topic_authority(self):
        self.assertGreater(self.db.execute("SELECT count(*) FROM authorities").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM authority_scopes").fetchone()[0], 0)

    def test_staged_gnis_discovery_requires_both_unambiguous_products(self):
        xml = '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated><Contents><Key>StagedProducts/GeographicNames/Topical/Populated_Places.zip</Key></Contents><Contents><Key>StagedProducts/GeographicNames/Topical/All_Names.zip</Key></Contents></ListBucketResult>'
        self.assertEqual(set(staged_products(xml)), {"Populated Places", "All Names"})
        with self.assertRaisesRegex(RuntimeError, "truncated"):
            staged_products(xml.replace("false", "true"))


if __name__ == "__main__":
    unittest.main()
