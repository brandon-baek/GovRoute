# GovGuide

GovGuide focuses on state and local government services, including cross-state driving and vehicle moves. Reviewed guides contain checked steps; crawler-discovered guides provide a permanent, source-linked starting point while deeper instructions await review.

## Current MVP

- location-filtered state/local guides, with federal routes available as supporting references
- interstate moving planner with checked destination guidance for CA, TX, and NY; other destinations explicitly show limited coverage
- one shared pathway dataset for the Guides index, guidance retrieval, permanent pages, sitemap, and knowledge graph
- SQLite database with migrations, foreign keys, integrity checks, FTS5 search, source snapshots, ingestion runs, and GNN review tables
- free deterministic intent retrieval; paid classification requires GOVGUIDE_ENABLE_PAID_AI=true and only runs for ambiguous reviewed matches
- Python USA.gov and CA.gov sitemap crawlers with robots enforcement, bounded workers, retries, rate limiting, size limits, content hashing, and failure reports
- paginated Python SAM.gov Assistance Listings API connector with retry and key-gated access
- automatic crawler-to-SQLite ingestion with source snapshots and run history
- twice-monthly crawler advancement, guide generation, validation, commit, and Vercel deployment
- experimental two-layer GraphSAGE link-discovery model
- responsive guide browser, source views, graph explorer, skeleton state, privacy guard, error boundary, and 404 page

## Run locally

Requirements: Node.js 22 or newer and Python 3.11+.

```bash
npm install
python3 -m pip install -r pipeline/requirements.txt
npm run graph:export
npm run gnn:train
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

The app works without API keys. Copy `.env.example` to `.env.local` only when enabling optional integrations.

## Commands

```bash
npm run typecheck       # TypeScript validation
npm test                # routing, safety, and graph tests
npm run build           # production build
npm run db:stats        # SQL integrity and graph counts
npm run check:sources   # live official-link health report
npm run ingest:usa      # refresh the USA.gov machine index
npm run ingest:sam      # refresh SAM.gov; requires SAM_API_KEY
```

## Grounding contract

The normalized node class lives in `lib/schema.ts`. Every node has an ID, kind, label, description, review status, source relationships, and typed parameters such as jurisdiction, audience, category, and review date.

User-facing facts follow this path:

```text
request -> reviewed or discovered guide -> official source -> publisher
```

A reviewed step without a `supported-by` edge is invalid. Discovered guides can point to an official destination before detailed steps are reviewed, but their status is always visible. Changed source content becomes a review task; it does not silently rewrite reviewed instructions.

## Database

The default database is `data/govguide.db`. The migration in `database/migrations/001_initial.sql` creates:

- `graph_nodes` and `graph_edges`
- `journeys`, `journey_steps`, `sources`, and `step_sources`
- `journey_search` using SQLite FTS5
- `ingestion_runs` and `source_snapshots`
- `gnn_suggestions` with pending, accepted, or rejected review state

Set `GOVGUIDE_DB_PATH` to use a different file. The schema uses conservative SQL types and constraints so a later PostgreSQL migration is straightforward.

## Autonomous refresh and deployment

The GitHub Actions workflow in `.github/workflows/data-refresh.yml` runs on the 1st and 15th of each month, or can be started with **Actions → GovGuide data refresh → Run workflow**. It refreshes official directories, advances through rotating federal and state domain batches, prioritizes unseen action-oriented pages while reserving capacity for the oldest previously indexed pages, generates `data/generated/discovered-guides.json`, checks curated links, validates SQLite, and builds the Vercel configuration. SAM.gov ingestion is included when the optional `SAM_API_KEY` repository secret is present.

After every check succeeds, the workflow commits only `data/govguide.db` and generated source-index reports to `main`. Keep the GitHub repository connected to the Vercel project with `main` as its production branch; Vercel then deploys the refreshed read-only database snapshot. No hosted database or Vercel API token is needed. On Vercel, the SQLite connection opens read-only because function filesystems are not durable storage.

Crawler output stays marked `machine-indexed` and appears publicly as a discovered guide. It can be browsed, matched, graphed, and opened at a permanent URL, while reviewed steps remain a separate trust level. Pages with too little useful content remain visible inside GovGuide but are kept out of the XML sitemap until they meet the search-quality gate. All crawls, guide export, SQLite integrity, native SQLite load, and production build must succeed before the workflow pushes data.

### Why SQLite for the MVP?

SQLite is an intentional MVP choice, not a placeholder masquerading as a database. GovGuide's current workload is read-heavy, the reviewed dataset fits comfortably in one relational file, and the app does not yet need multiple servers writing concurrently. SQLite gives the prototype real foreign keys, transactions, indexes, full-text search, migrations, and integrity checks without requiring a cloud database account during a classroom demonstration. It also makes the result reproducible: a teacher can open the exact populated database in `data/govguide.db` instead of depending on a remote service. The tables and constraints are kept portable so the project can move to PostgreSQL when hosting, concurrent writes, or larger-scale ingestion makes that operational complexity worthwhile.

To inspect the populated database directly:

```bash
sqlite3 data/govguide.db
.tables
SELECT kind, COUNT(*) FROM graph_nodes GROUP BY kind;
SELECT relation, COUNT(*) FROM graph_edges GROUP BY relation;
```

## Crawling and refresh

All acquisition and ETL code lives in `pipeline/`. The sitemap crawlers use an explicit user agent, remain on their configured government origin, enforce `robots.txt`, retry temporary failures, rate-limit requests, reject oversized/non-HTML responses, and hash normalized content. They inspect a wider sitemap inventory than they fetch on each run, rank likely actions and services first, and exclude URLs already stored so repeated runs continue advancing. The runner updates SQL, exports the graph, and regenerates the deployable guide catalog automatically.

```bash
python3 -m pipeline.run --source all
python3 -m pipeline.run --source usagov --limit 100
python3 -m pipeline.run --source california --limit 100
SAM_API_KEY=... python3 -m pipeline.run --source sam --limit 500
```

The frontend and API remain TypeScript because Next.js is a TypeScript web framework. Crawling, normalization, database ingestion, and graph/ML processing are Python so the data system can be read and run independently of the interface.

SAM.gov’s current Assistance Listings API requires a personal API key. Store it as the `SAM_API_KEY` repository secret for the scheduled workflow. Do not put it in source control.

Set `NEXT_PUBLIC_SITE_URL` to the canonical production origin. Optional guide ad placements are enabled only when `NEXT_PUBLIC_ADSENSE_GUIDE_INLINE_SLOT` or `NEXT_PUBLIC_ADSENSE_GUIDE_END_SLOT` is configured; without a slot ID, no empty ad container is rendered.

## GNN policy

`ml/train_gnn.py` trains a reproducible GraphSAGE encoder using topology and hashed node features. It proposes journey-to-journey `related-to` edges in `data/generated/gnn-neighbors.json`. Suggestions are imported into SQL as `pending` and are never used as factual support until a person reviews them.

## Production notes

- Keep request-body logging disabled because users may describe sensitive situations.
- Put the app behind a persistent volume or migrate the same schema to managed PostgreSQL before horizontal scaling.
- Add a SAM.gov key only through the host’s secret manager.
- Treat HTTP 403 responses from government anti-bot systems separately from confirmed 404s during source review.
- Run the full test, build, database integrity, and source-health gates before deployment.

GovGuide is an independent educational project. It provides public information, not legal advice, and hands transactions back to official government sites.

## Cost and abuse controls

The default public guidance and moving planner make no LLM calls, even if an API key is configured. The optional paid router uses a short timeout, no retries, bounded output, and a per-process hourly call cap. Request sizes, per-process IP windows, and rate-limit memory are bounded. These process-local controls are **not** a distributed billing limit: use your hosting firewall and provider-side project limits before enabling paid AI. Distributed bots can still consume hosting resources. No new paid service is required by this change.

## Jurisdiction and publication

The default guide directory focuses on state/local services. Generated guides recover state and locality from official directory records; unknown locations are never treated as a selected state's guide. Publication consolidates equivalent task titles on the same responsible host and scope, removes tracking URL variants, and preserves aliases for consolidated permanent pages. Reviewed-source URLs take precedence over discovered starting points. Similar tasks in different towns remain separate and display their location. The scheduled crawler prioritizes state/local sources through `--source local`; federal ingestion remains available manually.

## Govroute pathway and location foundation

The task-first interface and national location/source registry are documented in [docs/GOVROUTE_FOUNDATION.md](docs/GOVROUTE_FOUNDATION.md). The location registry is separate from the existing curated/discovered pathway database; geographic coverage does not imply complete procedural coverage.
