"""Build an atomic, provenance-preserving national place registry (stdlib only).

Names and geographic containment never imply topic-specific legal authority.
Run: python3 -m pipeline.locations --output data/govroute-locations.db
"""
from __future__ import annotations

import argparse
import contextlib
import csv
import hashlib
import html.parser
import io
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CENSUS = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer"
GNIS = "https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data"
FUNCTIONS = "https://www.census.gov/library/reference/code-lists/functional-status-codes.html"
LAYERS = {
    "States": "state", "Counties": "county", "County Subdivisions": "county_subdivision",
    "Consolidated Cities": "consolidated_city", "Incorporated Places": "municipality",
    "Census Designated Places": "cdp", "Unified School Districts": "school_district",
    "Secondary School Districts": "school_district", "Elementary School Districts": "school_district",
    "Federal American Indian Reservations": "tribal_area", "Off-Reservation Trust Lands": "tribal_area",
    "State American Indian Reservations": "tribal_area", "Tribal Subdivisions": "tribal_subdivision",
    "Alaska Native Village Statistical Areas": "tribal_statistical_area",
    "Oklahoma Tribal Statistical Areas": "tribal_statistical_area",
    "State Designated Tribal Statistical Areas": "tribal_statistical_area",
    "Tribal Designated Statistical Areas": "tribal_statistical_area",
    "American Indian Joint-Use Areas": "tribal_area", "Hawaiian Home Lands": "land_area",
}
NS_FIELDS = {"state": "STATENS", "county": "COUNTYNS", "county_subdivision": "COUSUBNS",
             "municipality": "PLACENS", "cdp": "PLACENS", "consolidated_city": "CONCITYNS"}


def now():
    return datetime.now(timezone.utc).isoformat()


def normalize(value):
    return " ".join(unicodedata.normalize("NFKD", str(value)).casefold().split())


def get_json(url, **params):
    query = urllib.parse.urlencode({"f": "json", **params})
    request = urllib.request.Request(url + "?" + query, headers={"User-Agent": "Govroute/1.0 (public place registry)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.load(response)
    if "error" in data:
        raise RuntimeError(f"Census service error: {data['error']}")
    return data


def census_rows(url, fetch=get_json, batch=5000):
    """Verify both count and unique object IDs; refuse silently truncated/repeated pages."""
    metadata = fetch(url)
    fields = metadata.get("fields", [])
    oid = next((x["name"] for x in fields if x["type"] == "esriFieldTypeOID"), None)
    if not oid:
        raise RuntimeError(f"Missing object-ID field at {url}")
    expected = int(fetch(url + "/query", where="1=1", returnCountOnly="true")["count"])
    seen = set()
    if metadata.get("advancedQueryCapabilities", {}).get("supportsPagination"):
        for offset in range(0, expected, batch):
            result = fetch(url + "/query", where="1=1", outFields="*", returnGeometry="false",
                           orderByFields=oid, resultOffset=offset, resultRecordCount=batch)
            rows = result.get("features", [])
            if len(rows) != min(batch, expected - offset):
                raise RuntimeError(f"Incomplete Census page at offset {offset}")
            for row in rows:
                values = row["attributes"]
                if values[oid] in seen:
                    raise RuntimeError("Repeated Census object ID; refusing incomplete import")
                seen.add(values[oid])
                yield values
    else:
        ids = fetch(url + "/query", where="1=1", returnIdsOnly="true").get("objectIds", [])
        if len(set(ids)) != expected:
            raise RuntimeError("Incomplete Census ID enumeration")
        for start in range(0, len(ids), batch):
            wanted = set(ids[start:start + batch])
            rows = fetch(url + "/query", objectIds=",".join(map(str, wanted)), outFields="*", returnGeometry="false").get("features", [])
            received = {row["attributes"][oid] for row in rows}
            if received != wanted or len(rows) != len(wanted):
                raise RuntimeError("Incomplete Census ID batch")
            for row in rows:
                seen.add(row["attributes"][oid])
                yield row["attributes"]
    final_count = int(fetch(url + "/query", where="1=1", returnCountOnly="true")["count"])
    if len(seen) != expected or final_count != expected:
        raise RuntimeError("Census dataset changed during import; retry the entire snapshot")


def dataset(db, key, url, publisher, vintage, count=0, digest=None):
    db.execute("INSERT INTO datasets VALUES(?,?,?,?,?,?,?,1)", (key, publisher, url, vintage, now(), digest, count))


def government_status(code):
    if code in {"A", "B", "C", "E", "G"}:
        return "active"
    if code in {"I", "N", "L"}:
        return "inactive"
    if code in {"S", "F"}:
        return "none"
    return "unknown"


def identifier(db, namespace, external_id, place_id):
    if not external_id or set(str(external_id)) == {"0"}:
        return
    # A feature identifier can describe several Census representations. Retain all;
    # ambiguity must never be resolved by selecting an arbitrary row.
    db.execute("INSERT OR IGNORE INTO place_identifiers VALUES(?,?,?)", (namespace, str(external_id), place_id))


def relation(db, child, parent, kind, source, evidence):
    if child != parent and db.execute("SELECT 1 FROM places WHERE id=?", (parent,)).fetchone():
        db.execute("INSERT OR IGNORE INTO place_relations VALUES(?,?,?,?,?)", (child, parent, kind, source, evidence))


def add_census(db, row, kind, source, layer_id):
    geoid = str(row["GEOID"])
    key = f"census:{layer_id}:{geoid}"
    state = str(row.get("STATE") or "") or None
    status = government_status(row.get("FUNCSTAT"))
    # Statistical entities cannot become governments even if an upstream field is wrong.
    if kind in {"cdp", "tribal_statistical_area"}:
        status = "none"
    name = row.get("NAME") or row.get("BASENAME")
    if not name:
        raise ValueError("Census place without a name")
    ns = row.get(NS_FIELDS.get(kind, ""))
    ns = str(int(ns)) if ns and str(ns).isdigit() and int(ns) else None
    lat, lon = point(row.get("INTPTLAT"), row.get("INTPTLON"))
    db.execute("INSERT INTO places VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (key, name, normalize(name), kind, state, row.get("STUSAB"), geoid, ns,
                "official", status, row.get("FUNCSTAT"), lat, lon, source, json.dumps(row)))
    identifier(db, f"census:{layer_id}", geoid, key)
    if ns:
        identifier(db, "gnis", ns, key)
    db.execute("INSERT INTO place_names VALUES(?,?,?,?,?,?)", (key, name, normalize(name), "official", "primary", source))
    # BASENAME often omits the legal suffix, and is an official Census field.
    if row.get("BASENAME") and row["BASENAME"] != name:
        db.execute("INSERT OR IGNORE INTO place_names VALUES(?,?,?,?,?,?)", (key, row["BASENAME"], normalize(row["BASENAME"]), "official", "variant", source))
    if status == "active" and kind not in {"tribal_area", "tribal_subdivision", "land_area"}:
        db.execute("INSERT INTO authorities VALUES(?,?,?,?,?,?)", (f"authority:{key}", key, name, kind, FUNCTIONS, "census_functional_status"))
    return key


def point(lat, lon):
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None, None
    if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180 or (lat == 0 and lon == 0):
        return None, None
    return lat, lon


def import_census(db, fetch=get_json):
    service = fetch(CENSUS)
    found = {item["name"]: item for item in service["layers"] if item["name"] in LAYERS}
    missing = set(LAYERS) - found.keys()
    if missing:
        raise RuntimeError(f"Census layer discovery changed: {sorted(missing)}")
    for name, kind in LAYERS.items():
        layer_id = found[name]["id"]
        url = f"{CENSUS}/{layer_id}"
        metadata = fetch(url)
        key = f"census:{layer_id}"
        dataset(db, key, url, "U.S. Census Bureau", metadata.get("description", service.get("serviceDescription", "Current")))
        count = 0
        for row in census_rows(url, fetch):
            row["_layer_name"] = name
            add_census(db, row, kind, key, layer_id)
            count += 1
        db.execute("UPDATE datasets SET records_seen=? WHERE id=?", (count, key))
        print(f"{name}: {count}", flush=True)
    # Geographic parents only. Multi-county municipalities are not assigned a county from a centroid.
    states = dict(db.execute("SELECT geoid,id FROM places WHERE kind='state'"))
    counties = dict(db.execute("SELECT geoid,id FROM places WHERE kind='county'"))
    codes = dict(db.execute("SELECT geoid,state_code FROM places WHERE kind='state'"))
    for key, state, kind, raw, source in db.execute("SELECT id,state_fips,kind,attributes_json,dataset_id FROM places").fetchall():
        if state in states:
            relation(db, key, states[state], "contained_by", source, "Census STATE code; geographic containment only")
            db.execute("UPDATE places SET state_code=? WHERE id=?", (codes[state], key))
        if kind == "state":
            relation(db, key, "country:US", "contained_by", source, "Census state or equivalent entity within US coverage")
        row = json.loads(raw)
        if state and row.get("COUNTY") and kind == "county_subdivision":
            county = counties.get(state + str(row["COUNTY"]).zfill(3))
            if county:
                relation(db, key, county, "contained_by", source, "Census STATE and COUNTY codes; geographic containment only")
    counts = dict(db.execute("SELECT kind,count(*) FROM places GROUP BY kind"))
    for kind, minimum in {"state": 51, "county": 3000, "municipality": 18000, "cdp": 5000}.items():
        if counts.get(kind, 0) < minimum:
            raise RuntimeError(f"National completeness gate failed: {kind}={counts.get(kind, 0)}")


class DownloadLinks(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.href, self.label = [], None, ""

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href, self.label = dict(attrs).get("href"), ""

    def handle_data(self, data):
        if self.href:
            self.label += data

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append((self.label.strip(), urllib.parse.urljoin(GNIS, self.href)))
            self.href = None


def staged_products(xml):
    """Discover current ZIP names from USGS's documented public staged directory."""
    root = ET.fromstring(xml)
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    if root.findtext("s3:IsTruncated", namespaces=ns) == "true":
        raise RuntimeError("GNIS staged listing is truncated")
    products = {}
    for entry in root.findall("s3:Contents", ns):
        key = entry.findtext("s3:Key", namespaces=ns) or ""
        filename = Path(key).name.lower()
        if not filename.endswith(".zip"):
            continue
        label = "Populated Places" if "populated" in filename else "All Names" if "allnames" in filename.replace("_", "").replace("-", "") else None
        if label:
            if label in products:
                raise RuntimeError(f"Ambiguous current GNIS product: {label}")
            products[label] = "https://prd-tnm.s3.amazonaws.com/" + urllib.parse.quote(key, safe="/")
    if set(products) != {"Populated Places", "All Names"}:
        raise RuntimeError("GNIS staged product schema changed; specify official local files")
    return products


def download_products(directory):
    listing = "https://prd-tnm.s3.amazonaws.com/?" + urllib.parse.urlencode({"list-type": "2", "prefix": "StagedProducts/GeographicNames/Topical/"})
    request = urllib.request.Request(listing, headers={"User-Agent": "Govroute/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        urls = staged_products(response.read())
    products = {}
    for label in ("Populated Places", "All Names"):
        url = urls[label]
        path = directory / ("populated.zip" if label == "Populated Places" else "names.zip")
        with urllib.request.urlopen(url, timeout=60) as response, path.open("wb") as target:
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 256 * 1024 * 1024:
                    raise RuntimeError("GNIS download exceeds 256 MiB safety limit")
                target.write(chunk)
        products[label] = (path, url)
    return products


@contextlib.contextmanager
def text_rows(path):
    """Read UTF-8 pipe-delimited official files, including zipped text + XML metadata."""
    with contextlib.ExitStack() as stack:
        if zipfile.is_zipfile(path):
            archive = stack.enter_context(zipfile.ZipFile(path))
            names = [n for n in archive.namelist() if n.lower().endswith((".txt", ".csv")) and not n.startswith("__MACOSX/")]
            if len(names) != 1:
                raise ValueError("Expected one GNIS data table per archive")
            if archive.getinfo(names[0]).file_size > 1024 * 1024 * 1024:
                raise ValueError("GNIS uncompressed file exceeds 1 GiB")
            stream = stack.enter_context(io.TextIOWrapper(archive.open(names[0]), encoding="utf-8-sig", newline=""))
        else:
            stream = stack.enter_context(Path(path).open(encoding="utf-8-sig", newline=""))
        reader = csv.DictReader(stream, delimiter="|")
        if not reader.fieldnames:
            raise ValueError("Empty GNIS table")
        reader.fieldnames = [n.strip().lower() for n in reader.fieldnames]
        if "feature_id" not in reader.fieldnames:
            raise ValueError("Missing GNIS feature_id")
        yield reader


def digest_file(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def import_gnis(db, populated, names=None, populated_url=GNIS, names_url=GNIS, minimum=50000):
    dataset(db, "gnis:populated", populated_url, "U.S. Geological Survey", Path(populated).name, digest=digest_file(populated))
    states = dict(db.execute("SELECT geoid,id FROM places WHERE kind='state'"))
    counties = dict(db.execute("SELECT geoid,id FROM places WHERE kind='county'"))
    codes = dict(db.execute("SELECT geoid,state_code FROM places WHERE kind='state'"))
    count = 0
    with text_rows(populated) as rows:
        for row in rows:
            if row.get("feature_class", "").casefold() != "populated place":
                continue
            feature_id = str(int(row["feature_id"]))
            candidates = db.execute("SELECT place_id FROM place_identifiers WHERE namespace='gnis' AND external_id=?", (feature_id,)).fetchall()
            canonical = candidates[0] if len(candidates) == 1 else None
            key = canonical[0] if canonical else f"gnis:{feature_id}"
            state = str(row.get("state_numeric") or "").zfill(2)
            county = str(row.get("county_numeric") or "").zfill(3)
            name = row["feature_name"]
            if not canonical:
                lat, lon = point(row.get("prim_lat_dec"), row.get("prim_long_dec"))
                db.execute("INSERT INTO places VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (key, name, normalize(name), "populated_place", state, codes.get(state), None, feature_id,
                            "official", "unknown", None, lat, lon, "gnis:populated", json.dumps(row)))
                identifier(db, "gnis", feature_id, key)
            db.execute("INSERT OR IGNORE INTO place_names VALUES(?,?,?,?,?,?)", (key, name, normalize(name), "official", "primary", "gnis:populated"))
            if state in states:
                relation(db, key, states[state], "primary_point_in", "gnis:populated", "GNIS primary coordinate state; not a boundary")
            if state + county in counties:
                relation(db, key, counties[state + county], "primary_point_in", "gnis:populated", "GNIS primary coordinate county; not full containment or jurisdiction")
            count += 1
    if count < minimum:
        raise RuntimeError(f"GNIS populated-place completeness gate failed: {count}")
    db.execute("UPDATE datasets SET records_seen=? WHERE id='gnis:populated'", (count,))
    print(f"GNIS populated places: {count}", flush=True)
    if names:
        dataset(db, "gnis:names", names_url, "U.S. Geological Survey", Path(names).name, digest=digest_file(names))
        count = 0
        with text_rows(names) as rows:
            for row in rows:
                feature_id = str(int(row["feature_id"]))
                matches = db.execute("SELECT place_id FROM place_identifiers WHERE namespace='gnis' AND external_id=?", (feature_id,)).fetchall()
                if not matches:
                    continue  # Do not turn rivers or mountains into communities.
                name = row.get("feature_name") or row.get("name")
                if not name:
                    raise ValueError("GNIS All Names schema changed: expected feature_name or name")
                for (key,) in matches:
                    official = db.execute("SELECT 1 FROM place_names WHERE place_id=? AND name=? AND status='official'", (key, name)).fetchone()
                    db.execute("INSERT OR IGNORE INTO place_names VALUES(?,?,?,?,?,?)", (key, name, normalize(name), "official" if official else "unofficial", "primary" if official else "variant", "gnis:names"))
                count += 1
        if not count:
            raise RuntimeError("GNIS All Names returned no populated-place names")
        db.execute("UPDATE datasets SET records_seen=? WHERE id='gnis:names'", (count,))
        print(f"GNIS names linked to places: {count}", flush=True)


def load_manifest(db, path):
    """Explicitly reviewed authority/topic scopes; no URL/name-based legal inference."""
    manifest = json.loads(Path(path).read_text())
    for item in manifest.get("authorities", []):
        db.execute("INSERT OR REPLACE INTO authorities VALUES(?,?,?,?,?,?)", (item["id"], item.get("place_id"), item["name"], item["level"], item["evidence_url"], "reviewed"))
    for item in manifest.get("scopes", []):
        db.execute("INSERT INTO authority_scopes VALUES(?,?,?,?,?,?)", (item["authority_id"], resolve_territory(db, item), item["topic"], item["role"], item["evidence_url"], item["reviewed_at"]))
    for item in manifest.get("sources", []):
        if urllib.parse.urlparse(item["url"]).scheme != "https":
            raise ValueError("Legal source URLs must use HTTPS")
        db.execute("INSERT INTO legal_sources(id,authority_id,topic,title,url,source_kind,adapter,reviewed_at,freshness_days) VALUES(?,?,?,?,?,?,?,?,?)",
                   (item["id"], item["authority_id"], item["topic"], item["title"], item["url"], item["kind"], item.get("adapter", "html"), item.get("reviewed_at"), item.get("freshness_days", 30)))


def resolve_territory(db, selector):
    """Resolve an explicit ID or an unambiguous state; no name/centroid inference."""
    if selector.get("territory_id") or selector.get("id"):
        key = selector.get("territory_id") or selector["id"]
        rows = db.execute("SELECT id FROM places WHERE id=?", (key,)).fetchall()
    elif selector.get("geoid") and selector.get("kind"):
        rows = db.execute("SELECT id FROM places WHERE geoid=? AND kind=?", (selector["geoid"],selector["kind"])).fetchall()
    elif selector.get("state_code"):
        rows = db.execute("SELECT id FROM places WHERE kind='state' AND state_code=?", (selector["state_code"],)).fetchall()
    else:
        raise ValueError("Missing explicit territory selector")
    if len(rows) != 1:
        raise ValueError("Territory selector is missing or ambiguous")
    return rows[0][0]


def coverage(db):
    return {
        "generatedAt": now(), "placeCount": db.execute("SELECT count(*) FROM places").fetchone()[0],
        "byKind": dict(db.execute("SELECT kind,count(*) FROM places GROUP BY kind")),
        "byState": dict(db.execute("SELECT coalesce(state_code,state_fips,'unknown'),count(*) FROM places GROUP BY coalesce(state_code,state_fips,'unknown')")),
        "unofficialNames": db.execute("SELECT count(*) FROM place_names WHERE status='unofficial'").fetchone()[0],
        "registeredDomains": db.execute("SELECT count(*) FROM government_domains").fetchone()[0],
        "linkedDirectoryPlaces": db.execute("SELECT count(DISTINCT place_id) FROM domain_places").fetchone()[0],
        "directoryIndexedPages": db.execute("SELECT count(*) FROM directory_pages").fetchone()[0],
        "directoryMatching": dict(db.execute("SELECT match_status,count(*) FROM government_domains GROUP BY match_status")),
        "directoryChecks": dict(db.execute("SELECT status,count(*) FROM directory_checks GROUP BY status")),
        "sourceCount": db.execute("SELECT count(*) FROM legal_sources").fetchone()[0],
        "reviewedProcesses": db.execute("SELECT count(*) FROM process_definitions WHERE review_status='reviewed'").fetchone()[0],
        "indexedSources": db.execute("SELECT count(DISTINCT source_id) FROM legal_snapshots").fetchone()[0],
        "sourceChecks": [dict(zip(["sourceId", "checkedAt", "status", "error"], row)) for row in db.execute("SELECT source_id,checked_at,status,error FROM legal_source_checks ORDER BY id")],
        "datasets": [dict(zip(["id", "publisher", "url", "vintage", "retrievedAt", "records", "complete"], row))
                     for row in db.execute("SELECT id,publisher,url,vintage,retrieved_at,records_seen,complete FROM datasets")],
        "limitations": ["Coverage is measured against imported datasets, not every community that exists.",
                         "Geographic containment is not proof of topic-specific legal authority.",
                         "Parcel, zoning, deed, tribal, and special-district rules need additional jurisdiction-specific sources.",
                         "Crawled source content is not a reviewed government pathway."]
    }


def preserve_legal_history(db, previous):
    """Retain versions only for the same authority, topic, and canonical source URL."""
    db.execute("ATTACH DATABASE ? AS previous", (str(previous),))
    db.execute("""INSERT INTO legal_snapshots SELECT p.* FROM previous.legal_snapshots p
      JOIN previous.legal_sources old ON old.id=p.source_id
      JOIN legal_sources s ON s.id=old.id AND s.url=old.url
        AND s.authority_id=old.authority_id AND s.topic=old.topic""")
    db.execute("INSERT INTO legal_chunks SELECT p.* FROM previous.legal_chunks p JOIN legal_snapshots s ON s.id=p.snapshot_id")
    if db.execute("SELECT 1 FROM previous.sqlite_master WHERE name='legal_source_checks'").fetchone():
        db.execute("""INSERT INTO legal_source_checks SELECT p.* FROM previous.legal_source_checks p
          JOIN previous.legal_sources old ON old.id=p.source_id
          JOIN legal_sources s ON s.id=old.id AND s.url=old.url
            AND s.authority_id=old.authority_id AND s.topic=old.topic""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/govroute-locations.db")
    parser.add_argument("--populated", type=Path, help="Official GNIS populated-place TXT or ZIP (offline import)")
    parser.add_argument("--names", type=Path, help="Official GNIS All Names TXT or ZIP (offline import)")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/registry/sources.json")
    parser.add_argument("--previous", type=Path, default=ROOT / "data/govroute-runtime.db", help="Seed legal-source history from a verified prior serving release")
    parser.add_argument("--processes", type=Path, default=ROOT / "data/registry/processes.json")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="govroute-registry-", dir=args.output.parent) as directory:
        staging = Path(directory) / "registry.db"
        db = sqlite3.connect(staging)
        db.executescript((ROOT / "database/registry/001_registry.sql").read_text())
        dataset(db, "federal", "https://www.usa.gov/", "United States government", "Federal scope")
        db.execute("INSERT INTO places(id,name,search_name,kind,name_status,government_status,dataset_id) VALUES('country:US','United States','united states','country','official','active','federal')")
        with db:
            import_census(db)
            if args.populated:
                import_gnis(db, args.populated, args.names)
            else:
                products = download_products(Path(directory))
                import_gnis(db, products["Populated Places"][0], products["All Names"][0], products["Populated Places"][1], products["All Names"][1])
            load_manifest(db, args.manifest)
            from pipeline.processes import load_processes
            load_processes(db, args.processes)
            previous = args.output if args.output.exists() else args.previous
            if previous.is_file():
                preserve_legal_history(db, previous)
        report = coverage(db)
        report["databaseBytes"] = staging.stat().st_size
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Registry integrity failed")
        db.close()
        os.replace(staging, args.output)  # Live snapshot survives any earlier failure.
        report_path = args.output.with_suffix(".coverage.json")
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
