"""Crawl official local directory sites in rotating, state-balanced batches.
Pages stay machine indexed; neither registration nor keywords certify a procedure.
"""
from __future__ import annotations
import argparse, hashlib, html.parser, ipaddress, json, socket, sqlite3, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser
from pipeline.legal_sources import SourceText
from pipeline.locations import now

AGENT="Govroute/1.0 (public government service directory)"
MAX_BYTES=2*1024*1024
TERMS=("permit","license","planning","zoning","clerk","recorder","election","registration","business","water","waste","tax","benefit","housing","records")

def validate_url(url, domain):
    parsed=urlsplit(url)
    if parsed.scheme!="https" or parsed.username or parsed.password or parsed.port not in (None,443) or parsed.hostname not in (domain,"www."+domain):
        raise ValueError("Redirect or link outside the registered HTTPS website")
    return url

def public_host(url):
    hostname=urlsplit(url).hostname
    addresses=socket.getaddrinfo(hostname,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ValueError("Website does not resolve exclusively to public addresses")

class RegisteredRedirect(HTTPRedirectHandler):
    def __init__(self,domain): self.domain=domain
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        validate_url(newurl,self.domain)
        public_host(newurl)
        return super().redirect_request(request,fp,code,msg,headers,newurl)

def download(url,domain,limit=MAX_BYTES):
    validate_url(url,domain)
    public_host(url)
    opener=build_opener(RegisteredRedirect(domain))
    with opener.open(Request(url,headers={"User-Agent":AGENT,"Accept":"text/html,text/plain"}),timeout=12) as response:
        raw=response.read(limit+1)
        if len(raw)>limit: raise ValueError("Page exceeds crawl budget")
        return raw.decode(response.headers.get_content_charset() or "utf-8",errors="replace"),response.geturl(),response.headers.get("Content-Type","")

class Links(html.parser.HTMLParser):
    def __init__(self,base,domain):
        super().__init__(); self.base,self.domain=base,domain
        self.href=None; self.label=""; self.title=""; self.in_title=False; self.links={}
    def handle_starttag(self,tag,attrs):
        if tag=="title": self.in_title=True
        if tag=="a": self.href=dict(attrs).get("href"); self.label=""
    def handle_data(self,value):
        if self.in_title: self.title+=value
        if self.href: self.label+=value
    def handle_endtag(self,tag):
        if tag=="title": self.in_title=False
        if tag=="a" and self.href:
            target=urljoin(self.base,self.href)
            try:
                validate_url(target,self.domain)
                parsed=urlsplit(target)
                target=urlunsplit((parsed.scheme,parsed.netloc,parsed.path or "/",parsed.query,""))
                label=" ".join(self.label.split())
                score=sum(word in (label+" "+parsed.path).lower() for word in TERMS)
                if score and len(target)<500 and not parsed.path.lower().endswith((".pdf",".zip",".png",".jpg")):
                    self.links[target]=(score,label)
            except ValueError: pass
            self.href=None

def crawl_domain(domain,pages=2,visited=None):
    visited=visited or {}
    root="https://"+domain+"/"
    results=[]
    robots=RobotFileParser(root+"robots.txt")
    try:
        try:
            raw,_,_=download(robots.url,domain,256*1024)
            robots.parse(raw.splitlines())
        except HTTPError as error:
            if error.code not in (404,410): raise
            robots.parse([])  # Robots standard: missing file imposes no rules.
        delay=robots.crawl_delay(AGENT) or robots.crawl_delay("*") or 1
        rate=robots.request_rate(AGENT) or robots.request_rate("*")
        if rate: delay=max(delay,rate.seconds/rate.requests)
        queue=[root]
        for index in range(pages+1):
            if index>=len(queue): break
            url=queue[index]
            if index and delay>30:
                results.append({"domain":domain,"url":url,"status":"blocked","error":"Robots delay exceeds this batch budget"})
                break
            if index: time.sleep(delay)
            try:
                if not robots.can_fetch(AGENT,url):
                    results.append({"domain":domain,"url":url,"status":"blocked","error":"robots.txt disallows indexing"})
                    continue
                raw,final,ctype=download(url,domain)
                if "text/html" not in ctype: raise ValueError("Source needs a dedicated content adapter")
                text=SourceText(); text.feed(raw)
                content=text.text()
                if len(content)<300: raise ValueError("Insufficient server-rendered page text")
                links=Links(final,domain); links.feed(raw)
                results.append({"domain":domain,"url":final,"title":" ".join(links.title.split())[:240] or domain,
                    "summary":content[:500],"content":content[:120000],"status":"indexed"})
                if index==0:
                    queue.extend(url for url,_ in sorted(links.links.items(),key=lambda item:(item[0] in visited,visited.get(item[0],""),-item[1][0],item[0])) if url not in queue)
            except Exception as error:
                results.append({"domain":domain,"url":url,"status":"unavailable","error":str(error)[:500]})
    except Exception as error:
        results.append({"domain":domain,"url":root,"status":"unavailable","error":str(error)[:500]})
    return results

def crawl_queue(db,limit):
    # Unvisited websites first; retained check history makes subsequent batches advance.
    by_state=defaultdict(list)
    rows=db.execute("""SELECT d.domain,d.state_code,coalesce(max(c.checked_at),'') AS last_checked
      FROM government_domains d JOIN domain_places binding ON binding.domain=d.domain
      LEFT JOIN directory_checks c ON c.domain=d.domain
      GROUP BY d.domain ORDER BY last_checked,d.domain""").fetchall()
    for domain,state,last_checked in rows: by_state[state or "unknown"].append((domain,last_checked))
    chosen=[]
    while by_state and len(chosen)<limit:
        for state in sorted(list(by_state),key=lambda key:(by_state[key][0][1],key)):
            chosen.append(by_state[state].pop(0)[0])
            if not by_state[state]: del by_state[state]
            if len(chosen)==limit: break
    return chosen

def store_page(db,item):
    status=item["status"]
    if status=="indexed":
        digest=hashlib.sha256(item["content"].encode()).hexdigest()
        old=db.execute("SELECT sha256 FROM directory_pages WHERE url=?",(item["url"],)).fetchone()
        status="unchanged" if old and old[0]==digest else "indexed"
        db.execute("""INSERT INTO directory_pages(domain,url,title,summary,content,sha256,retrieved_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,summary=excluded.summary,
          content=excluded.content,sha256=excluded.sha256,retrieved_at=excluded.retrieved_at""",
          (item["domain"],item["url"],item["title"],item["summary"],item["content"],digest,now()))
    # Unavailable sources leave their last successful page intact.
    db.execute("INSERT INTO directory_checks(domain,url,checked_at,status,error) VALUES(?,?,?,?,?)",
       (item["domain"],item["url"],now(),status,item.get("error")))
    return status

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database",type=Path,default=Path("data/govroute-locations.db"))
    parser.add_argument("--sites",type=int,default=110)
    args=parser.parse_args()
    if not 1<=args.sites<=2000: parser.error("Site budget must be between 1 and 2000")
    db=sqlite3.connect(args.database); db.execute("PRAGMA foreign_keys=ON")
    domains=crawl_queue(db,args.sites)
    totals=defaultdict(int)
    with ThreadPoolExecutor(max_workers=8) as workers:
        visited={domain:dict(db.execute("SELECT url,max(checked_at) FROM directory_checks WHERE domain=? GROUP BY url",(domain,))) for domain in domains}
        futures=[workers.submit(crawl_domain,domain,2,visited[domain]) for domain in domains]
        for future in as_completed(futures):
            for item in future.result():
                with db: totals[store_page(db,item)]+=1
    print(json.dumps({"sitesAttempted":len(domains),"checks":dict(totals),
        "indexedPages":db.execute("SELECT count(*) FROM directory_pages").fetchone()[0]}))
    db.close()
if __name__=="__main__": main()
