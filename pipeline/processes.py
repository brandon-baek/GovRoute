"""Import authored, source-checked processes without claiming a successful crawl.

The location importer calls this inside its atomic staging transaction. A failed
source fetch leaves the authored publication and the unavailable check separate.
"""
from datetime import date
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from pipeline.locations import resolve_territory


def public_url(value):
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Process links must be public HTTPS URLs")


def load_processes(db, path):
    documents = json.loads(Path(path).read_text())["processes"]
    seen = set()
    for item in documents:
        journey = item["journey"]
        process_id = journey["id"]
        if process_id in seen:
            raise ValueError("Duplicate process ID")
        seen.add(process_id)
        if journey["reviewStatus"] != "verified":
            raise ValueError("Only source-checked processes can be published")
        date.fromisoformat(journey["reviewedAt"])
        territory = resolve_territory(db, item["territory"])
        if journey["jurisdiction"] == "federal" and territory != "country:US":
            raise ValueError("Federal process has a conflicting territory")
        if journey["jurisdiction"] == "california" and item["territory"] != {"state_code": "CA"}:
            raise ValueError("California process has a conflicting territory")
        region = db.execute("SELECT kind,state_code FROM places WHERE id=?", (territory,)).fetchone()
        if journey["jurisdiction"] == "state" and (region[0] != "state" or journey.get("state") != region[1]):
            raise ValueError("State process has a conflicting territory")
        if journey["jurisdiction"] == "local" and (region[0] in {"country","state"} or (region[1] and journey.get("state") != region[1])):
            raise ValueError("Local process has a conflicting territory")
        if journey["jurisdiction"] not in {"federal","california","state","local","federal-and-state"}:
            raise ValueError("Unknown process jurisdiction")
        if journey["jurisdiction"] in {"state","local"}:
            if journey.get("territoryIds") and journey["territoryIds"] != [territory]:
                raise ValueError("Publication has conflicting territory IDs")
            journey["territoryIds"] = [territory]
        scope = db.execute("""SELECT 1 FROM authority_scopes WHERE authority_id=?
            AND territory_id=? AND topic=? AND role='service_provider'""",
            (item["authority_id"], territory, item["topic"])).fetchone()
        if not scope:
            raise ValueError("Process lacks a reviewed service-provider scope")
        sources = {}
        for source in journey["sources"]:
            if source["id"] in sources:
                raise ValueError("Duplicate process source ID")
            record = db.execute("SELECT authority_id,topic,url,reviewed_at,active FROM legal_sources WHERE id=?", (source["id"],)).fetchone()
            if not record or record[:3] != (item["authority_id"], item["topic"], source["url"]) or not record[3] or not record[4]:
                raise ValueError("Process source does not match its reviewed authority and topic")
            if source["lastChecked"] != record[3] or source["lastChecked"] != journey["reviewedAt"]:
                raise ValueError("Process source review date is inconsistent")
            public_url(source["url"])
            sources[source["id"]] = source
        if not sources or not journey["steps"]:
            raise ValueError("Process needs sourced steps")
        if journey.get("officialAction"):
            public_url(journey["officialAction"]["url"])
        db.execute("INSERT INTO process_definitions VALUES(?,?,?,?,?,?,?)",
            (process_id, journey["title"], item["topic"], item["authority_id"],
             json.dumps(journey.get("eligibility", [])), "reviewed", journey["reviewedAt"]))
        prior = set()
        for position, step in enumerate(journey["steps"], 1):
            if step["id"] in prior:
                raise ValueError("Duplicate process step ID")
            dependencies = step.get("dependsOn", [])
            if not set(dependencies).issubset(prior):
                raise ValueError("Dependencies must refer to earlier steps")
            if not step["sourceIds"] or not set(step["sourceIds"]).issubset(sources):
                raise ValueError("Every step must cite a declared reviewed source")
            if step.get("action"):
                public_url(step["action"]["url"])
            step_id = f"{process_id}:step:{step['id']}"
            db.execute("INSERT INTO process_steps VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (step_id, process_id, position, step["title"], step["detail"],
                 json.dumps(step.get("requirements", [])), json.dumps(dependencies),
                 json.dumps(step.get("fees", [])), json.dumps(step.get("deadlines", [])),
                 step["sourceIds"][0], step.get("action", {}).get("url")))
            db.executemany("INSERT INTO process_step_sources VALUES(?,?)",
                [(step_id, source_id) for source_id in set(step["sourceIds"])])
            prior.add(step["id"])
        document = json.dumps(journey, ensure_ascii=False, sort_keys=True)
        db.execute("INSERT INTO process_publications VALUES(?,?,?,?,?)",
            (process_id, territory, journey["slug"], document, hashlib.sha256(document.encode()).hexdigest()))
    return len(documents)
