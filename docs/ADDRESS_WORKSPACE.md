# Address-specific local task workspace

Selecting an address changes both the local evidence and the actions presented. Search and the coverage explorer share the same workspace.

## User flow

1. Look up the complete address and confirm the Census match.
2. Build the address report. It resolves the address on the server, identifies its actual geographic context, and returns local published procedures, relevant indexed official-page instructions, district geography, and attempted map-layer intersections.
3. Choose a local task: building/remodeling, property/zoning, business licensing, trash/water, local reports, or voting/records. The backend refreshes evidence from task-scoped department pages first, then registered local government websites. Each extracted instruction retains its official page, publisher, retrieval date, and machine-indexed status.
4. Where the assessor address differs from the street address, choose the actual property from nearby assessor parcels. A supplied parcel ID must resolve within 150 meters of the server-verified address point. No nearest parcel is automatically declared correct.
5. The candidate parcel polygon supplies zoning intersections. Interior-overlap queries exclude polygons that merely touch a parcel boundary. Conflicting zone records remain visible. A missing polygon never falls back to assigning a different street point's zone to the parcel.
6. Use the source-specific zoning-code link, matched district directory record, local published procedure, or official application instructions. Check off and print the resulting research checklist.

Building-permit responses retain their reviewed guide and include this address evidence. Property, floodplain, and school-district requests can return the address workspace directly.

## National local-source discovery

The registry stores actual Census/GNIS identities, geographic context, CISA registrations, indexed government pages, and separately reviewed procedure scopes. Address-local source selection requires a government present in the verified address context. A shared county, postal label, or keyword never grants reviewed topic competence.

Retained source passages are extracted only from pages whose title/URL identify the task. Fresh lookup starts with scoped procedure sources when available and then linked local .gov websites. It observes robots rules, stays on the approved source host, rejects private-address hosts and arbitrary redirects, caps bodies and fetch times, rate-limits crawling, and bounds the public-source cache. Cache keys contain canonical task categories and public URLs, never raw user messages or addresses. Failed live lookups retain indexed evidence with its existing age/failure warnings.

Extracted instructions are source passages, not newly reviewed legal conclusions. The UI distinguishes them from published procedures. No model invents local eligibility, fees, deadlines, permission, or authority. No paid AI service is needed.

## GIS and districts

- FEMA NFHL layer 28: flood-zone screening nationally where available. A failed, empty, or ambiguous response never becomes a low-risk conclusion.
- LA County public assessor parcel layer 0: normalized street lookup, bounded nearby candidate search, and explicit candidate confirmation.
- LA County GISNET zoning layer 346: code, description, planning area and Title 22 node. Multiple records remain distinct.
- Census geography collections: county, incorporated place, and school district. A district GEOID links to its exact NCES directory record; it does not identify an assigned campus or guarantee enrollment.

Parcel/zoning adapters currently cover LA County; other jurisdictions receive the applicable local procedures, official-source extraction, and national screenings. Non-.gov sites need separately evidenced connectors. Place coverage does not establish complete procedural coverage or resolve every property right.

## API and privacy

POST /api/location/workspace accepts address, optional task and optional parcelId. It refuses caller coordinates, arbitrary URLs, unknown fields, invalid IDs, oversized bodies and ambiguous address matches. Its responses are private/no-store and its function trace includes the pinned national registry asset.

The address goes to Census. Coordinates go to FEMA; the normalized street and selected geometry go to LA County when those adapters apply. Official-page discovery sends neither the address nor the user's request to the government websites. Govroute does not persist the address, parcel choice, checklist or findings in this feature, or send them to an LLM. The UI explains provider disclosures before lookup. Provider/hosting logs are separate systems.

Census coordinates interpolate along address ranges. Candidate parcels require confirmation. Ownership, recorded restrictions, complete overlays, exact setbacks, legal permission, flood insurance obligations and school assignment remain matters for the relevant official records and offices.

## Verification

Regression coverage includes geographic isolation, source extraction, safe URL discovery, robots-aware fetch behavior, input budgets, polygon ambiguity, provider failure, explicit parcel confirmation, privacy and rendering. CI runs production dependency audit, TypeScript, tests, lint, production build and live public-address checks. The source manifest is immutable; full national importer tests remain in the foundation workflow.
