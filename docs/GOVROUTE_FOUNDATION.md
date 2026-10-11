# Govroute: pathways first, jurisdiction data underneath

Govroute helps a person quickly find and understand a specific government process.
The main interaction is a task in plain language, followed by a short, ordered pathway:
which route fits, what to prepare, what it costs, when to act, and the official next action.
Ask for location and eligibility only when they change that pathway. Do not make people
browse government hierarchies to renew a passport.

## What this change implements

- A warm off-white, high-contrast homepage centered on tasks rather than interstate moves.
- Federal pathways included by default in browsing; location is an optional refinement.
- A separate SQLite geographic registry and an atomic national Census/GNIS importer.
- Official primary names, unofficial variants, stable identifiers, geographic relationships,
  and functioning-government status stored independently.
- Place-name search and a private, uncached US Census address-range lookup with explicit
  candidate selection. Raw addresses are never saved by Govroute or sent to its AI router.
- A reviewed authority/topic/source manifest, versioned source snapshots and searchable
  chunks, and a structured process/step model including requirements, fees, deadlines,
  dependencies, and source links.
- Property questions produce a record-gathering route and explicit coverage gaps, rather
  than an unsupported determination of an owner's rights.
- CI tests the application and creates a national-registry artifact and coverage report.

The existing curated and discovered catalogs serve public pathways. Two source-checked
process publications now also feed the same browsing, retrieval, permanent-page, and
graph interfaces: passport applications/renewals, and adult California licensing after
a move with a valid out-of-state license. Their ten official source entries were read
on October 8, 2026. The remaining processes still need migration. Adding a city to the
registry does not publish its laws or procedures.

`data/registry/processes.json` is the authored publication input. It includes route
eligibility, documents, costs, timing, dependencies, and per-step citations. The importer
requires a reviewed authority/topic/service-provider scope for each territory, validates
all source identities and review dates, and rejects missing citations, duplicate IDs,
conflicting territories, and forward/cyclic dependencies. It stores normalized steps,
all supporting source links, and a hashed publication document in the atomic snapshot.
Public retrieval selects only reviewed publications with the matching explicit scope.
State selectors resolve by an unambiguous Census state code rather than hard-coded
TIGER layer IDs. Geographic context alone never grants the agency topic competence.

The small authored catalog is also bundled with the app. Passport guidance works without
a location or registry mount; California-specific publications require California.
Existing SQL journey snapshots receive the newer authored records by stable ID. Registry
lookup uses the normalized publication tables when present, with a labeled bundled
fallback for a missing registry or an older snapshot without publication tables. Neither
path invents legal snapshots or successful fetches. Failed automated source indexing
and authored source review are measured separately.

## Build and validate

```sh
python3 -m unittest pipeline.test_locations pipeline.test_processes pipeline.test_national_backend -v
python3 -m pipeline.locations --output data/govroute-locations.db
python3 -m pipeline.legal_sources --database data/govroute-locations.db
npm ci
npm run typecheck
npm test
npm run lint
npm run build
```

The place importer uses Python's standard library. Census layers are discovered by exact
names, paginated with unique object IDs, and checked against counts before and after the
download. National minimum-count gates catch empty or truncated core layers. GNIS ZIP
names are discovered from USGS's documented public staged-products directory. Local official GNIS files can be passed
with `--populated` and `--names`; Census still requires its API. Missing/changing schemas
fail the build rather than publishing guessed records.

All imports stage a new database. `os.replace` publishes it only after complete imports,
foreign-key checks, and integrity checks. Existing source versions are retained for source
IDs that remain in the manifest. Interrupted or failed imports leave the previous live
database intact. A failed legal-source refresh retains its last successful snapshot and
returns a failure status. It never upgrades machine-indexed content to reviewed.

The `Govroute foundation` workflow runs application checks, the complete national
import, runtime SQL assertions, serverless file-trace checks, and production HTTP
scenarios on relevant pull requests. Its coverage report distinguishes geographic
records, linked websites, indexed pages, reviewed procedures, and unavailable sources.

After all checks pass, the workflow publishes both the compressed serving projection
and the compressed complete archive as immutable GitHub release assets. It pins the
serving manifest on the review branch. The website prebuild verifies and downloads that
asset; serverless functions bundle only its compressed form and extract it through a
bounded asynchronous stream. The complete archive stays outside function bundles.
A persistent Node host may instead use a read-only database mounted through
`GOVROUTE_REGISTRY_PATH`.

Procedure indexing is measured separately from geographic import. Failed source
fetches retain explicit failure records and the last successful content; they do not
invalidate a usable geographic snapshot or invent successful indexing. Failed imports,
runtime checks, or bundle budgets cannot advance the serving manifest.

The workflow neither merges the pull request nor changes main. The scheduled expansion
and refresh pipeline runs on main after the code is merged. Without a prepared registry,
the app reports that location coverage is not imported and keeps bundled pathways
available. Release assets preserve the full archive independently of the 90-day Actions
artifact retention window.

## Geographic identity and authority

| Record | Meaning | Legal routing rule |
| --- | --- | --- |
| Incorporated place | Census legal place, with FUNCSTAT preserved | A functioning government can be identified; topic competence still needs reviewed evidence |
| Census designated place | Official statistical geography | Never create a municipal government from this record |
| GNIS populated place | Officially named settlement/feature | Existence and a primary coordinate do not establish incorporation or boundaries |
| GNIS variant | Non-official alternative name of a known feature | Mark unofficial and resolve to its stable feature identity |
| County or equivalent | Census geography that may be statistical or nonfunctioning | Respect FUNCSTAT; do not assume a county government exists |
| Township or subdivision | Legal or statistical subdivision | Retain status; verify which functions its government performs |
| Tribal area | Reservation, trust, or statistical geography | Preserve separately; no blanket county/state authority inheritance |
| School district | A topic-specific administrative geography | No general-purpose legal authority inferred |

GNIS feature IDs and Census National Standard identifiers provide explicit identity
crosswalks. Equal names or close centroids do not deduplicate entities. Multiple Census
representations sharing an identifier remain ambiguous rather than arbitrarily merged.
The primary GNIS county relation is `primary_point_in`, not full geographic containment.
Municipalities spanning multiple counties are not assigned a county from their centroid.

`place_relations` carries geographic context. `authorities` identifies governments or
service bodies. Only `authority_scopes` with an explicit territory, topic, role, official
evidence URL, and review date can select a jurisdiction-specific legal/procedure source.
An agency may regulate a task, provide the service, or keep its records; these roles differ.
Federal sources can apply regardless of a person's municipal location.

GNIS does not enumerate every informal neighborhood or community that exists. Additional
local gazetteers and community datasets need dedicated adapters and provenance. The schema
supports unofficial community records and many-to-many geographic/service relationships;
source discovery and review are still required before those records are published.

## API behavior

| Endpoint | Purpose | Missing/ambiguous behavior |
| --- | --- | --- |
| `GET /api/places?q=...&state=CA` | Prefix search of official and unofficial place names | 503 before import; no invented fallback places |
| `GET /api/places?id=...` | Inspect geographic context and identified governments | Unknown IDs return 404; ancestors do not establish legal competence |
| `GET /api/places?coverage=true` | Current imported counts and dataset provenance | Returns `not_imported` when no snapshot exists |
| `POST /api/location/resolve` | Address-range geographies from the official Census API | Zero/multiple candidates stay explicit; uncached response |
| `POST /api/chat` | Task-first pathway matching with optional state/place IDs | Property evidence gaps are explicit; unsupported local guides are not selected by free text alone |
| `GET /api/processes?q=passport&state=CA` | Published sourced processes for an explicit service area | Federal scope works without location; storage identifies registry or bundled publication data |

The public location picker stores neither the typed address nor a parcel identity. It
passes registry place IDs into pathway retrieval. Census coordinates are interpolated
along address ranges. They are unsuitable as proof of an exact parcel, ownership,
easement, zoning determination, or which overlapping body has authority over every issue.
Hosting/network logs and the Census service are separate systems; do not claim they retain
no data. Disable request-body capture in deployment observability.

## Completing nationwide pathway coverage

1. Import and measure the place registry, including territorial gaps and source vintages.
2. Map actual agencies to reviewed territory/topic scopes, including county and municipal
   competence, special districts, service agreements, courts, and tribal jurisdictions.
3. Add connector-specific adapters for official procedure pages, local code publishers,
   ordinances, zoning GIS, assessors, recorders, and service-office directories. Respect
   terms, robots rules, limits, and available official APIs. `.gov` alone is not verification.
4. Assemble draft processes from sourced requirements and actions. Retain effective dates,
   historical versions, citations per step, eligibility branches, fees, and deadlines.
   Review and publish a process independently of the success of its crawler.
5. Migrate existing curated/discovered catalogs to the process model without presenting
   discovered pages as complete or legally reviewed pathways.
6. Report coverage by jurisdiction **and task**, age of sources, unresolved authorities,
   and missing records. Measure completion of a useful task, not the number of crawled pages.

For property rights, require parcel identity, authoritative boundary datasets, zoning
overlays and current code, recorded deeds/easements/covenants, and applicable higher-level
law. Conflicts, exceptions, and unresolved facts must remain visible. No address-only
pipeline can truthfully settle every person's exact rights.

## Primary data references

- Census current legal/statistical layers: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer
- Census functional status definitions: https://www.census.gov/library/reference/code-lists/functional-status-codes.html
- USGS GNIS downloads: https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data
- GNIS format documentation: https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/GNIS_file_format.pdf
- Census geocoder API and limitations: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

## National backend serving and local directories

The complete registry remains the provenance archive. `pipeline.compact_registry` projects it into a separate `govroute-runtime.db`, retaining identity, relationships, names, government status, reviewed scope, publications, directory pages, and source evidence. Only unused raw feature attributes are removed; the Census layer name remains for address geography matching. Serverless output includes the compressed asset, and a single asynchronous initialization stream verifies and extracts it into ephemeral storage with bounded memory. Raw copies remain outside function bundles. The projection uses smaller primary-key tables, has a 350 MiB extraction gate, and production traces have a 230 MiB gate.

After unit, importer, actual-dataset runtime, build, trace, and production HTTP scenario checks pass, CI publishes a public prerelease dataset asset and pins `data/registry/runtime-release.json` on the same review branch. The Vercel prebuild step downloads that immutable asset and checks SHA-256, schema, compressed bytes, and decompressed bytes. No new paid database service or AI calls are required. A failed refresh cannot advance the pinned manifest. The complete archive is excluded from function output.

The CISA current-full.csv importer loads all registered .gov organizations, with inventory hashes and duplicate/schema/count gates. A city or county domain links only when its registered organization and state identify one active Census government. The mailing city alone cannot authorize a link. Ambiguous registrations remain unlinked. This is an automatically established directory match, not a reviewed topic scope.

`pipeline.local_sources` rotates through unvisited and oldest-checked matched websites in state-balanced batches. It checks robots rules, limits content and time, follows only same-registered-domain HTTPS redirects, rejects private-address hosts, and indexes the homepage plus two relevant service pages. Crawl status, successful content hashes, indexing dates, and unavailable/blocked checks remain distinct. Later batches retain previous successful pages.

`GET /api/local-resources?id=<place-id>&q=<task>` returns official directory starting points and relevant machine-indexed pages. Chat property and local-service gaps expose the same resources. These results never turn into verified steps through keywords or geographic parentage alone.

See BACKEND_USER_SCENARIOS.md for the scenario matrix. The coverage report separately records registered domains, linked places, indexed directory pages, reviewed processes, and crawl failures. Coverage is not complete across every local government, and non-.gov websites require further officially evidenced connectors.

Human review expires separately from crawl freshness: after 30 days, a previously verified guide carries review-due status, and a successful link check cannot reset that review date.

Successful serving releases also include a compressed complete archive with a separate raw SHA-256. Raw feature provenance remains available beyond the 90-day Actions retention window. The full archive stays outside the website bundle.

Refreshes seed legal snapshots, chunks, and checks from the pinned previous serving release only when the source ID, canonical URL, topic, and authority still match. Local crawls retain prior pages and check history, advance to unvisited service links, and expose the date and availability of the latest crawl independently of procedure review.

## Publishing additional states and local procedures

The process and journey models support federal, California legacy, generic state, and local publications. Generic state publications must identify their state. Local publications must identify an exact reviewed territory; a GEOID plus geography kind may resolve it unambiguously, or an explicit stable place ID may be supplied. Imported publications retain the resolved territory ID and still require a reviewed agency/topic/service-provider scope and matching reviewed source identities.

Retrieval accepts local publications only through matching scope IDs. Explicit location selections and complete geographic containment support those IDs. GNIS primary-point relations, overlaps, service labels, and a typed locality name cannot certify a county or municipal process. The directory may still show such contextual starting points with its unreviewed labels.

The process endpoint accepts an optional place ID alongside state and task query, rejects conflicting state selections, and applies the same publication-scope checks as chat. The authored catalog publishes five reviewed procedures: U.S. passports, California new-resident licensing, Texas adult valid-license transfers, New York passenger-car plate surrender, and San Francisco damaged-public-object reports. The Texas and New York procedures remain scoped to their states. The SF311 procedure resolves Census municipal GEOID 0667000 and appears in chat only with that exact municipal scope or confirmed geographic containment. All sources retain their own review dates and independently measured crawl availability.

The Texas transfer checklist is limited to adults with valid, unexpired, noncommercial licenses from another U.S. state. The New York checklist covers passenger cars with plates available to surrender. SF311 handles only the listed public objects in San Francisco. Other tasks, eligibility branches, and jurisdictions still require source review and publication; five procedures do not establish nationwide procedure coverage.
