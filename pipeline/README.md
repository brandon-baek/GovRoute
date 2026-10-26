# Govroute Python data pipeline

The data system is separate from the TypeScript web application. Running `python3 -m pipeline.run` performs the complete acquisition path:

1. Read configured government sitemaps and refresh official federal and state/territory directories.
2. Fetch and enforce the origin's `robots.txt` policy.
3. Select same-origin pages and crawl them with bounded workers, a shared rate gate, retries, timeouts, and response-size limits.
4. Extract the page title, summary, headings, canonical URL, response metadata, and a SHA-256 content fingerprint.
5. Normalize each page into a typed graph node and connect it to its publisher.
6. Upsert those nodes, edges, official sources, source snapshots, and ingestion-run results into `data/govroute.db` in a transaction.
7. Export the complete SQL graph to `data/generated/graph.json`.

`domain_catalog.py` imports CISA's complete daily `.gov` registry, the federal-only registry, and USA.gov's state/territory directory with links to their listed state government and agency sites. These catalog records remain discovery data, not verified instructions. `sam_crawler.py` uses SAM.gov's structured Assistance Listings API instead of scraping HTML. It paginates until the configured record limit.

## Run it

```bash
python3 -m pip install -r pipeline/requirements.txt
python3 -m pipeline.run --source usagov --limit 40
python3 -m pipeline.run --source california --limit 40
SAM_API_KEY=your_key python3 -m pipeline.run --source sam --limit 500
python3 -m pipeline.run --source federal-directory
python3 -m pipeline.run --source government-domain-directory
python3 -m pipeline.run --source state-directory
python3 -m pipeline.run --source state-sites --domain-limit 0 --pages-per-domain 3 --workers 8
python3 -m pipeline.run --source federal-sites --domain-limit 0 --pages-per-domain 3 --workers 8
```

`--domain-limit 0` inspects every source from that official directory. For long crawls, use `--domain-limit` and `--domain-offset` to run resumable batches. Federal and state site crawls share a bounded domain worker pool, honor each site's `robots.txt` crawl rules, and store one compact batch report rather than one generated JSON file per domain. Domains without a discoverable sitemap remain in the catalog and are reported as crawl warnings. Increase `--pages-per-domain` gradually; discovery inventories can be much larger than a single crawl batch.

The scheduled `--source all` run refreshes the federal and state/territory catalogs, then inspects every domain in both site directories. Bulk domain probing uses shorter timeouts and no retries, pages are limited by `--pages-per-domain`, and per-site crawl delays and parseable rules come from `robots.txt`. An unavailable `robots.txt` response in the 4xx range is handled per RFC 9309; 429 and server/network failures remain fail-closed. A failed or missing sitemap is recorded as a warning. Every collected page remains `machine-indexed` until reviewed.

New crawler records are automatically stored as `machine-indexed`. This is a database status, not a manual holding file. They are immediately queryable and visible to internal graph tooling, while the separate `verified` status identifies reviewed instructions safe for user-facing procedural answers.

## Files

- `run.py`: command-line orchestration
- `sitemap_crawler.py`: standards-aware government HTML crawler
- `sam_crawler.py`: paginated API crawler
- `http_client.py`: retrying HTTP session and rate gate
- `database.py`: automatic transactional SQLite writes and graph export
- `config.py`: source registry and scope rules
- `domain_catalog.py`: imports CISA's official federal `.gov` registry and discovers agency sitemaps
- `models.py`: normalized Python data classes
