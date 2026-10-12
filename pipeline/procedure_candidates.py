"""Build a task-specific review queue from retained official pages.

Candidates preserve evidence and failed-check status. This job never publishes
instructions or upgrades machine-indexed pages to reviewed procedures.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import sqlite3
from pipeline.locations import now

TOPICS = {
    "building_permit": ("building permit", "construction permit", "building safety", "building and safety"),
    "property": ("zoning", "recorded deed", "real estate records", "parcel"),
    "birth_certificate": ("birth certificate", "birth records", "vital records"),
    "voter_registration": ("voter registration", "register to vote", "elections"),
    "driver_license": ("driver license", "drivers license", "driver's license"),
    "vehicle_registration": ("vehicle registration", "motor vehicle", "license plates"),
    "public_property_repair": ("pothole", "illegal dumping", "report a problem", "311"),
    "business_license": ("business license", "business registration", "fictitious business"),
    "water_waste": ("water service", "sewer service", "trash collection", "garbage collection"),
}

def candidates(db, limit=500):
    regions=defaultdict(list)
    rows=db.execute("""SELECT p.url,p.title,p.content,p.sha256,p.retrieved_at,p.domain,
      coalesce((SELECT status FROM directory_checks c WHERE c.url=p.url ORDER BY c.id DESC LIMIT 1),'not_checked')
      FROM directory_pages p ORDER BY p.url""").fetchall()
    for url,title,content,digest,retrieved,domain,last_status in rows:
        locations=db.execute("""SELECT p.id,p.name,p.state_code FROM domain_places b
          JOIN places p ON p.id=b.place_id WHERE b.domain=? ORDER BY p.id""",(domain,)).fetchall()
        if not locations: continue
        heading=re.sub(r"[^a-z0-9]+"," ",(title+" "+url).lower())
        for topic,phrases in TOPICS.items():
            if not any(re.sub(r"[^a-z0-9]+"," ",phrase) in heading for phrase in phrases): continue
            lines=[line.strip() for line in content.splitlines() if line.strip()]
            evidence=[line[:600] for line in lines if re.search(r"\b(apply|submit|required|must|fee|deadline|documents|eligib|inspection|certified)\w*\b",line,re.I)][:6]
            if not evidence: continue
            state=locations[0][2] or "unknown"
            regions[state].append({"topic":topic,"url":url,"title":title,"contentHash":digest,"retrievedAt":retrieved,
                "latestCheckStatus":last_status,"reviewStatus":"machine-indexed","places":[dict(id=p[0],name=p[1],state=p[2]) for p in locations],
                "evidenceExcerpts":evidence,"missingReview":["Topic authority and service area","Eligibility and procedure requirements","Step citations and current fees or deadlines"]})
    # Rotate across regions instead of filling the queue with one large state.
    queue=[]
    while regions and len(queue)<limit:
        for state in sorted(list(regions)):
            queue.append(regions[state].pop(0))
            if not regions[state]: del regions[state]
            if len(queue)==limit: break
    return {"generatedAt":now(),"status":"review-queue-only","candidateCount":len(queue),
            "byTopic":dict(Counter(row["topic"] for row in queue)),"candidates":queue}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database",type=Path,default=Path("data/govroute-locations.db"))
    parser.add_argument("--output",type=Path,default=Path("data/govroute-procedure-queue.json"))
    args=parser.parse_args()
    with sqlite3.connect(f"file:{args.database.resolve()}?mode=ro",uri=True) as db: report=candidates(db)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({key:value for key,value in report.items() if key!="candidates"}))
if __name__=="__main__": main()
