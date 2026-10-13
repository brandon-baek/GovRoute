import sqlite3
import unittest
from pipeline.procedure_candidates import candidates

class CandidateTests(unittest.TestCase):
    def test_task_evidence_stays_unreviewed_and_retains_failed_refresh(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript("""CREATE TABLE directory_pages(url,title,content,sha256,retrieved_at,domain);
              CREATE TABLE directory_checks(id,url,status);CREATE TABLE domain_places(domain,place_id);
              CREATE TABLE places(id,name,state_code);""")
            for i,state in enumerate(("CA","CA","CA","WA")):
                domain=f"county{i}.gov";url=f"https://{domain}/building-permits"
                db.execute("INSERT INTO places VALUES(?,?,?)",(str(i),"County",state))
                db.execute("INSERT INTO domain_places VALUES(?,?)",(domain,str(i)))
                db.execute("INSERT INTO directory_pages VALUES(?,?,?,?,?,?)",(url,"Building permits","Submit required plans.\nPay the application fee.","hash","2026-10-12",domain))
                db.execute("INSERT INTO directory_checks VALUES(?,?,?)",(i,url,"unavailable"))
            report=candidates(db,2)
            self.assertEqual([row['places'][0]['state'] for row in report['candidates']],["CA","WA"])
            self.assertTrue(all(row['reviewStatus']=="machine-indexed" and row['latestCheckStatus']=="unavailable" for row in report['candidates']))
            self.assertTrue(all(row['evidenceExcerpts'] and row['missingReview'] for row in report['candidates']))
            self.assertFalse(db.execute("SELECT name FROM sqlite_master WHERE name='process_publications'").fetchone())
if __name__=="__main__":unittest.main()
