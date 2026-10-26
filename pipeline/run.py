from __future__ import annotations

import argparse
import json
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from pathlib import Path
from urllib.parse import urlsplit

from pipeline.config import SITEMAP_SOURCES, SitemapSource
from pipeline.database import export_graph, open_database, store_result
from pipeline.pathways import export_discovered_guides
from pipeline.domain_catalog import (
    crawl_federal_directory, crawl_state_directory, discover_sitemap,
    government_domain_result, load_all_gov_domains, load_federal_domains,
)
from pipeline.http_client import HttpPolicy
from pipeline.models import CrawlResult
from pipeline.sam_crawler import crawl_sam
from pipeline.sitemap_crawler import crawl_sitemap

ROOT = Path(__file__).resolve().parents[1]


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl government sources and populate Govroute SQLite automatically.")
    parser.add_argument("--source", choices=("all", "local", "usagov", "california", "sam", "federal-directory", "federal-sites", "government-domain-directory", "government-sites", "state-directory", "state-sites"), default="all")
    parser.add_argument("--limit", type=int, default=int(os.getenv("GOVROUTE_CRAWL_LIMIT", os.getenv("GOVGUIDE_CRAWL_LIMIT", "40"))))
    parser.add_argument("--workers", type=int, default=int(os.getenv("GOVROUTE_CRAWL_WORKERS", os.getenv("GOVGUIDE_CRAWL_WORKERS", "16"))))
    parser.add_argument("--delay", type=float, default=float(os.getenv("GOVROUTE_CRAWL_DELAY_SECONDS", os.getenv("GOVGUIDE_CRAWL_DELAY_SECONDS", "0.25"))))
    parser.add_argument("--database", type=Path, default=ROOT / "data/govguide.db")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/generated")
    parser.add_argument("--domain-limit", type=int, default=50, help="Maximum domains in federal-sites/state-sites mode; use 0 for the whole directory. all mode always crawls every listed domain.")
    parser.add_argument("--domain-offset", type=int, default=0, help="Skip this many domains for resumable batches.")
    parser.add_argument("--pages-per-domain", type=int, default=3, help="Maximum pages to crawl from each discovered sitemap.")
    parser.add_argument("--domains", help="Comma-separated federal domains for a focused bulk crawl, such as irs.gov,dol.gov.")
    return parser.parse_args()


def main() -> None:
    args = arguments()
    known_urls: dict[str, str] = {}
    if args.database.exists():
        with sqlite3.connect(args.database) as existing:
            try:
                known_urls = {row[0]: row[1] for row in existing.execute("SELECT url, last_checked FROM sources")}
            except sqlite3.OperationalError:
                known_urls = {}
    policy = HttpPolicy(
        user_agent=os.getenv("GOVROUTE_USER_AGENT", os.getenv("GOVGUIDE_USER_AGENT", "Govroute/1.0 educational civic navigator; contact repository owner")),
        delay_seconds=args.delay,
    )
    results = []
    state_sites: list[dict[str, str]] = []
    if args.source in ("all", "local", "state-directory", "state-sites"):
        state_result, state_sites = crawl_state_directory(policy)
        if args.source in ("all", "local", "state-directory"):
            results.append(state_result)
    if args.source in ("all", "federal-directory"):
        results.append(crawl_federal_directory(policy))
    if args.source in ("all", "local", "government-domain-directory"):
        results.append(government_domain_result(load_all_gov_domains(policy)))
    for source in SITEMAP_SOURCES:
        if args.source in ("all", source.key) or (args.source == "local" and source.key == "california"):
            # Advance through unseen task pages on every run while the crawler's
            # refresh quota rechecks the oldest known pages for changes.
            results.append(crawl_sitemap(source, policy, args.limit, args.workers, known_urls))
    if args.source in ("all", "sam"):
        api_key = os.getenv("SAM_API_KEY")
        if api_key:
            results.append(crawl_sam(api_key, policy, max(args.limit, 100)))
        elif args.source == "sam":
            raise SystemExit("SAM_API_KEY is required for --source sam")
        else:
            print("SAM.gov skipped because SAM_API_KEY is not set.")

    site_modes = ("government-sites", "federal-sites", "state-sites") if args.source == "all" else ("government-sites", "state-sites") if args.source == "local" else (args.source,)
    for site_mode in site_modes:
        if site_mode not in ("government-sites", "federal-sites", "state-sites"):
            continue
        bulk_policy = HttpPolicy(user_agent=policy.user_agent, timeout_seconds=8, retries=0, delay_seconds=args.delay)
        rows = load_all_gov_domains(policy) if site_mode == "government-sites" else load_federal_domains(policy) if site_mode == "federal-sites" else state_sites
        if args.source == "local" and site_mode == "government-sites":
            rows = [row for row in rows if not row.get("Domain type", "").lower().startswith("federal")]
        domain_offset = args.domain_offset
        if args.domains:
            selected_domains = {item.strip().lower().removeprefix("www.") for item in args.domains.split(",") if item.strip()}
            rows = [row for row in rows if (row.get("Domain name", row.get("domain", "")).lower().removeprefix("www.")) in selected_domains]
        else:
            domain_limit = args.domain_limit
            if args.source in ("all", "local"):
                scheduled_limits = {"government-sites": 600, "federal-sites": 100, "state-sites": 400}
                domain_limit = scheduled_limits[site_mode]
                slots = max(1, (len(rows) + domain_limit - 1) // domain_limit)
                domain_offset = (int(os.getenv("GITHUB_RUN_NUMBER", "0")) % slots) * domain_limit
            rows = rows[domain_offset:]
            if domain_limit:
                rows = rows[:domain_limit]
        def crawl_domain(item: tuple[int, dict[str, str]]):
            position, row = item
            domain = row.get("Domain name", row.get("domain", "")).lower()
            publisher = row.get("Organization name") or row.get("publisher") or domain
            sitemap = discover_sitemap(domain, bulk_policy)
            if not sitemap:
                key = f"{site_mode}-{domain.removesuffix('.gov').replace('.', '-')}"
                warning = f"No same-domain sitemap found for {domain}; catalog entry retained without page crawl."
                return CrawlResult(key, "", "", warnings=[warning], metadata={"domain": domain, "publisher": publisher, "pagesIndexed": 0})
            source = SitemapSource(
                key=f"{site_mode}-{domain.removesuffix('.gov').replace('.', '-').replace('/', '-')}",
                publisher=publisher,
                origin=f"{urlsplit(sitemap).scheme}://{urlsplit(sitemap).netloc}",
                sitemap_url=sitemap,
                excluded_fragments=("/search",),
            )
            print(f"[{position}/{domain_offset + len(rows)}] {domain}: {sitemap}", flush=True)
            try:
                result = crawl_sitemap(source, bulk_policy, args.pages_per_domain, 1, known_urls)
                result.metadata.update({"domain": domain, "publisher": publisher})
                return result
            except Exception as error:
                return CrawlResult(source.key, "", "", warnings=[f"{domain} sitemap crawl failed: {error}"],
                                   metadata={"domain": domain, "publisher": publisher, "pagesIndexed": 0})

        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 24))) as executor:
            futures = [executor.submit(crawl_domain, item) for item in enumerate(rows, start=domain_offset + 1)]
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as error:
                    print(f"Domain crawl failed: {error}", flush=True)

    database = open_database(args.database, ROOT / "database/migrations/001_initial.sql")
    try:
        batch_summaries: dict[str, list[dict[str, object]]] = {}
        for result in results:
            if not result.started_at:
                from datetime import datetime, timezone
                stamp = datetime.now(timezone.utc).isoformat()
                result.started_at = stamp
                result.finished_at = stamp
            store_result(database, result)
            args.output_dir.mkdir(parents=True, exist_ok=True)
            if result.connector.startswith(("government-sites-", "federal-sites-", "state-sites-")):
                batch = "government-sites" if result.connector.startswith("government-sites-") else "federal-sites" if result.connector.startswith("federal-sites-") else "state-sites"
                batch_summaries.setdefault(batch, []).append({"connector": result.connector, **result.metadata, "warnings": result.warnings})
            else:
                output = args.output_dir / f"{result.connector}.json"
                output.write_text(json.dumps(asdict(result), indent=2) + "\n")
            print(f"{result.connector}: {len(result.nodes)} nodes, {len(result.edges)} edges, {len(result.warnings)} warnings")
        for batch, entries in batch_summaries.items():
            output = args.output_dir / f"{batch}-batch.json"
            combined = {}
            if output.exists():
                try:
                    combined.update({item["connector"]: item for item in json.loads(output.read_text()).get("domains", [])})
                except (OSError, ValueError, KeyError, TypeError):
                    combined = {}
            combined.update({item["connector"]: item for item in entries})
            domains = sorted(combined.values(), key=lambda item: item["connector"])
            output.write_text(json.dumps({"domainsAttempted": len(domains), "domains": domains}, indent=2) + "\n")
        export_graph(database, args.output_dir / "graph.json")
        discovered = export_discovered_guides(database, args.output_dir / "discovered-guides.json")
        check = database.execute("PRAGMA integrity_check").fetchone()[0]
        counts = dict(database.execute("SELECT kind,COUNT(*) FROM graph_nodes GROUP BY kind"))
        print(json.dumps({"database": str(args.database), "integrity": check, "nodes": counts, "discoveredGuides": discovered}, indent=2))
    finally:
        database.close()


if __name__ == "__main__":
    main()
