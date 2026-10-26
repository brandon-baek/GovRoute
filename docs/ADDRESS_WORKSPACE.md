# Address-specific findings and guide assembly

An address can now drive live point intersections and checklists rather than only a jurisdiction filter.

## User behavior
Select a street-address match in search or the coverage explorer and choose **Build my address report**. Property questions with a selected address, plus flood and school-district questions, also request the report directly. Building-permit pathways retain their existing reviewed service-area checks.

The report shows:
- Census-returned school-district and county geography;
- an attempted national FEMA NFHL flood-zone intersection;
- LA County candidate parcel number, zoning code, description, and planning area where returned;
- generated property, floodplain, and district-enrollment research checklists with official next actions.

Changing map values changes the guide text. A high-risk FEMA zone triggers floodplain-administrator and lender/insurer questions. County zoning and candidate parcel identifiers are carried into property-review preparation. Unsupported geographies do not inherit county adapters.

## Evidence and privacy
Connector URLs and selected fields are fixed in lib/address-workspace.ts. Query geometry comes only from server-side Census resolution, never a submitted point or county ID. Point queries are POSTed with no-store, no redirects, seven-second timeouts and 512 KiB response limits. Multiple differing polygons, missing fields, truncation, empty results, and provider failures are distinct outcomes.

The address is sent to Census. Coordinates are sent to FEMA. Within LA County, the normalized Census street address is sent to the county assessor-parcel layer; a unique candidate polygon is then used for zoning intersections. The UI explains this before the report request. No raw address or coordinates are returned in the report, persisted by this feature, placed in a share URL, or sent to an LLM. HTTP responses are private/no-store. Provider and host logging are outside this feature's control.

Census coordinates are interpolated address-range points, often near roads. A candidate parcel is NOT a verified subject parcel. Do not infer ownership, permitted uses, exact setbacks, insurance obligations, school assignment, or an absence of flood risk. Failed providers preserve the remaining report.

## Source manifest
- LA County ZNET zoning layer 4: ZONE, Z_DESC, PLNG_AREA.
- LA County ZNET parcel layer 12: AIN, APN, SitusFullAddress and candidate geometry. Street names are conservatively normalized; multiple assessor identities remain ambiguous. Zoning is queried across the candidate polygon when available, so road-interpolated Census points do not silently replace parcel evidence.
- FEMA NFHL layer 28: FLD_ZONE, ZONE_SUBTY, SFHA_TF.
- Census geocoder geography collections: county, incorporated place, school districts.

Point zoning and parcels currently cover LA County; flood screening is attempted nationally. These are screening/research guides, not reviewed legal determinations or full nationwide procedure coverage.

## Validation
Added focused map-adapter and endpoint regressions. Existing scope tests remain unchanged. Runtime, dependency installation, full build, visual checks, and live provider checks must pass before merging. The local environment became unavailable during development. GitHub Actions subsequently passed 107 tests, typecheck, lint, and production build on the initial implementation. Live checks exposed road-point misses in LA County and an ambiguous New York address; these motivated the assessor street lookup and polygon follow-up. Validate the final revision and live providers before merging. Government-service outages remain explicit report states. The pre-existing production dependency audit also reports high/critical advisories and remains a separate release blocker.
