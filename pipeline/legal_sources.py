"""Index an explicit, reviewed source manifest. Indexing does not publish legal advice.

Run after locations: python3 -m pipeline.legal_sources --database data/govroute-locations.db
Municipal code hosts require an explicit source entry and adapter; no unrestricted crawl.
"""
from __future__ import annotations
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from datetime import datetime, timezone
from pipeline.locations import coverage

USER_AGENT = "Govroute"
MAX_BYTES = 4 * 1024 * 1024


class SourceText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skipped = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "nav", "header", "footer"}:
            self.skipped += 1
        elif tag in {"p", "li", "h1", "h2", "h3", "br", "tr"} and not self.skipped:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "nav", "header", "footer"}:
            self.skipped = max(0, self.skipped - 1)

    def handle_data(self, text):
        if not self.skipped and text.strip():
            self.parts.append(text.strip() + " ")

    def text(self):
        return "\n".join(" ".join(line.split()) for line in "".join(self.parts).splitlines() if line.strip())


def fetch_source(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username:
        raise ValueError("Expected an explicit public HTTPS source")
    robots = RobotFileParser(parsed.scheme + "://" + parsed.netloc + "/robots.txt")
    with urlopen(Request(robots.url, headers={"User-Agent": USER_AGENT}), timeout=20) as response:
        robots.parse(response.read(256 * 1024).decode("utf-8", errors="replace").splitlines())
    if not robots.can_fetch(USER_AGENT, url):
        raise RuntimeError("Source disallows indexing through robots.txt")
    with urlopen(Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"}), timeout=30) as response:
        final = response.geturl()
        if urlparse(final).hostname != parsed.hostname or urlparse(final).scheme != "https":
            raise RuntimeError("Source redirected to a different host; review its manifest entry")
        if "text/html" not in response.headers.get("Content-Type", ""):
            raise RuntimeError("This source needs a dedicated PDF/API adapter")
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise RuntimeError("Source exceeds size limit")
        parser = SourceText()
        parser.feed(raw.decode(response.headers.get_content_charset() or "utf-8", errors="replace"))
        text = parser.text()
        if len(text) < 300:
            raise RuntimeError("Insufficient text; source may require an API adapter")
        return text, final


def store_snapshot(db, source_id, text, final_url):
    sha = hashlib.sha256(text.encode()).hexdigest()
    if db.execute("SELECT 1 FROM legal_snapshots WHERE source_id=? AND sha256=?", (source_id, sha)).fetchone():
        return False
    cursor = db.execute("INSERT INTO legal_snapshots(source_id,retrieved_at,sha256,content,final_url) VALUES(?,?,?,?,?)",
                        (source_id, datetime.now(timezone.utc).isoformat(), sha, text, final_url))
    paragraphs = text.splitlines()
    chunks, chunk = [], ""
    for paragraph in paragraphs:
        if len(chunk) + len(paragraph) > 1600 and chunk:
            chunks.append(chunk)
            chunk = ""
        chunk += paragraph + "\n"
    if chunk:
        chunks.append(chunk)
    db.executemany("INSERT INTO legal_chunks(snapshot_id,ordinal,text) VALUES(?,?,?)", [(cursor.lastrowid, i, value) for i, value in enumerate(chunks)])
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("data/govroute-locations.db"))
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error("Build the place registry first")
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    failures = []
    for source_id, url, adapter in db.execute("SELECT id,url,adapter FROM legal_sources WHERE active=1").fetchall():
        try:
            if adapter != "html":
                raise RuntimeError(f"Unimplemented adapter: {adapter}")
            text, final_url = fetch_source(url)
            with db:
                changed = store_snapshot(db, source_id, text, final_url)
                db.execute("INSERT INTO legal_source_checks(source_id,checked_at,status) VALUES(?,?,?)", (source_id, datetime.now(timezone.utc).isoformat(), "indexed" if changed else "unchanged"))
            print(json.dumps({"source": source_id, "changed": changed, "status": "machine_indexed"}))
        except Exception as error:
            failures.append(source_id)
            with db:
                db.execute("INSERT INTO legal_source_checks(source_id,checked_at,status,error) VALUES(?,?,'unavailable',?)", (source_id, datetime.now(timezone.utc).isoformat(), str(error)))
            print(json.dumps({"source": source_id, "status": "failed", "error": str(error)}))
    report = coverage(db)
    report["databaseBytes"] = args.database.stat().st_size
    args.database.with_suffix(".coverage.json").write_text(json.dumps(report, indent=2) + "\n")
    db.close()
    if failures:
        raise SystemExit(f"Source index incomplete: {', '.join(failures)}. Previous snapshots retained.")


if __name__ == "__main__":
    main()
