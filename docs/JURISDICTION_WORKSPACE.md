# County service areas and address continuity

The same current Census polygon adapter is exercised for La Crescenta-Montrose,
Altadena, White Center, Glendale, and La Cañada Flintridge. No production lookup
branches on these names. The map-service relationship is applied to the input
community polygon (`esriSpatialRelWithin`), not a ZIP or centroid. Multiple-county
communities do not acquire county publications from a point-only crosswalk.

When a user chooses an address, local-task requests revalidate that address with
the official geocoder. The server preserves address-range precision and rejects
IDs outside the resulting context; it does not trust client-supplied coordinates
or precision. No address is stored in the database, checklist progress, or AI
router. Coverage uses a bounded POST body so addresses do not appear in its URL.

Regression checks cover failed and ambiguous lookups, incorporated addresses,
multi-county CDPs, mismatched place IDs, unknown service areas, dependency-aware
checklist progress, review expiry, and source changes. Component-render checks
verify evidence labels and checklist controls; palette checks enforce WCAG AA
text contrast on both off-white surfaces. They are not visual browser QA.

Per-answer graph traces exclude unrelated discoveries. Graph tooltips insert
source labels as text, never HTML. Automated source changes request instruction
re-review; a successful or blocked index never renews an authored review.

The normalized catalog contains source-checked procedures and separately labeled
official handoffs. Neither the national place inventory nor the tested cohort
establishes complete nationwide procedure coverage. Exact property decisions
still require parcel, zoning, recorded restrictions, and applicable legal review.

Birth-record chat requests use the national issuing-office handoff rather than
inferring a record office from the current-area picker or a residence-state name.
Existing state record guides remain directly browsable, but selecting one in
chat requires a future, distinct issuing-jurisdiction input and scope review.
Confident, scoped process-publication matches take precedence over older
overlapping guides and unreviewed crawler discoveries. Older guides remain a
fallback when a published route does not match the task.
