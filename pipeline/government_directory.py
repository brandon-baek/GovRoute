"""Import the complete CISA registrant inventory; no inferred legal competence."""
from __future__ import annotations
import argparse, csv, hashlib, io, json, re, sqlite3
from pathlib import Path
from urllib.request import Request, urlopen
from pipeline.locations import dataset, now, normalize

CATALOG = "https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv"
REQUIRED = {"Domain name", "Domain type", "Organization name", "Suborganization name", "City", "State"}

def organization_key(name):
    value = normalize(name)
    value = re.sub(r"^(?:city|town|village|borough|municipality|county|parish|township) of ", "", value)
    value = re.sub(r" (?:city|town|village|borough|municipality|county|parish|township)$", "", value)
    return value

def load_rows(text, minimum=10000):
    reader = csv.DictReader(io.StringIO(text))
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError("CISA inventory schema changed")
    rows = list(reader)
    domains = [row["Domain name"].lower() for row in rows]
    if len(rows) < minimum or len(set(domains)) != len(rows):
        raise ValueError("Incomplete or duplicate CISA inventory")
    if any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.gov", domain) for domain in domains):
        raise ValueError("Invalid government domain")
    return rows

def import_directory(db, text, minimum=10000, previous=None):
    rows = load_rows(text, minimum)
    dataset(db, "cisa:domains", CATALOG, "Cybersecurity and Infrastructure Security Agency",
            now()[:10], len(rows), hashlib.sha256(text.encode()).hexdigest())
    candidates = {}
    for key, name, state, kind in db.execute("SELECT id,name,state_code,kind FROM places WHERE government_status='active' AND kind IN ('municipality','county','county_subdivision','consolidated_city')"):
        category = "County" if kind == "county" else "City"
        candidates.setdefault((state,category,organization_key(name)), set()).add(key)
    for row in rows:
        domain, category = row["Domain name"].lower(), row["Domain type"]
        # Organization identifies the registrant. Mailing City is not a service boundary.
        matches = candidates.get((row["State"],category,organization_key(row["Organization name"])), set()) if category in {"County","City"} else set()
        status = "linked" if len(matches)==1 else "ambiguous" if matches else "unmatched"
        db.execute("INSERT INTO government_domains VALUES(?,?,?,?,?,?,?,?,?)",
            (domain,row["Organization name"],row["Suborganization name"],category,row["City"],row["State"] or None,"cisa:domains",status,now()))
        if len(matches)==1:
            db.execute("INSERT INTO domain_places VALUES(?,?,?)", (domain,next(iter(matches)),"registered_organization_exact"))
    if previous and Path(previous).is_file():
        old = sqlite3.connect(f"file:{Path(previous).resolve()}?mode=ro",uri=True)
        if old.execute("SELECT 1 FROM sqlite_master WHERE name='directory_pages'").fetchone():
            active = {r[0] for r in db.execute("SELECT domain FROM government_domains")}
            for row in old.execute("SELECT domain,url,title,summary,content,sha256,retrieved_at,review_status FROM directory_pages"):
                if row[0] in active:
                    db.execute("INSERT INTO directory_pages(domain,url,title,summary,content,sha256,retrieved_at,review_status) VALUES(?,?,?,?,?,?,?,?)",row)
            for row in old.execute("SELECT domain,url,checked_at,status,error FROM directory_checks"):
                if row[0] in active:
                    db.execute("INSERT INTO directory_checks(domain,url,checked_at,status,error) VALUES(?,?,?,?,?)",row)
        old.close()
    return {"registeredDomains":len(rows), "matching":dict(db.execute("SELECT match_status,count(*) FROM government_domains GROUP BY match_status")),
            "linkedPlaces":db.execute("SELECT count(DISTINCT place_id) FROM domain_places").fetchone()[0]}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database",type=Path,default=Path("data/govroute-locations.db"))
    parser.add_argument("--csv",type=Path)
    parser.add_argument("--previous",type=Path,default=Path("data/govroute-runtime.db"))
    args=parser.parse_args()
    if args.csv: text=args.csv.read_text()
    else:
        with urlopen(Request(CATALOG,headers={"User-Agent":"Govroute/1.0"}),timeout=60) as response:
            raw=response.read(8*1024*1024+1)
        if len(raw)>8*1024*1024: raise ValueError("Inventory size changed")
        text=raw.decode("utf-8-sig")
    db=sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    with db:
        report=import_directory(db,text,previous=args.previous)
    db.close()
    print(json.dumps(report))
if __name__=="__main__": main()
