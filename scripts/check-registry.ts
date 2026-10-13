import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { openRegistry, registryCoverage, searchPlaces, contextForPlaces, relevantLegalSources } from "../lib/place-registry";
import { publishedProcesses } from "../lib/process-registry";

async function main() {
const db = await openRegistry();
assert.ok(db, "Publish the national registry before checking its runtime");
const coverage = await registryCoverage();
assert.equal(coverage.status, "available");
assert.ok(coverage.placeCount > 200000, "National place completeness gate");
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM place_names WHERE search_name LIKE ? ESCAPE '\\'").all("spring%") as { detail: string }[];
assert.ok(plan.some((row) => row.detail.includes("names_prefix")), "Prefix lookups must use the national name index");
const unofficial = db.prepare("SELECT n.place_id,n.name FROM place_names n WHERE n.status='unofficial' AND (SELECT count(*) FROM place_names other WHERE other.search_name=n.search_name)=1 LIMIT 1").get() as { place_id: string; name: string };
assert.ok(unofficial);
assert.ok((await searchPlaces(unofficial.name)).some((place) => place.id === unofficial.place_id && place.matched_name_status === "unofficial"));
const statistical = db.prepare("SELECT id FROM places WHERE kind='cdp' LIMIT 1").get() as { id: string };
const context = await contextForPlaces([statistical.id]);
assert.ok(context.places.some((place) => place.id === statistical.id && place.government_status === "none"));
assert.equal((db.prepare("SELECT count(*) AS count FROM authorities WHERE place_id=?").get(statistical.id) as { count: number }).count, 0);
assert.equal((await relevantLegalSources([statistical.id], "property")).length, 0);
assert.equal((await relevantLegalSources([statistical.id], "passport")).length, 7);
const texasProcesses = await publishedProcesses("TX");
assert.equal(texasProcesses.storage, "registry-process-catalog");
assert.deepEqual(texasProcesses.journeys.map(journey=>journey.id).sort(), ["journey-birth-certificate-start","journey-driver-license-start","journey-irs-ein","journey-passport-apply","journey-tx-license-transfer","journey-voter-registration-start"]);
const sf=db.prepare("SELECT id FROM places WHERE geoid='0667000' AND kind='municipality'").get() as {id:string};
assert.ok(sf, "San Francisco's reviewed municipal scope must resolve in the real dataset");
assert.ok((await publishedProcesses("CA",[sf.id])).journeys.some(journey=>journey.id==="journey-sf-damaged-public-property"));
assert.ok(!(await publishedProcesses("CA",[statistical.id])).journeys.some(journey=>journey.jurisdiction==="local"));
assert.equal((await publishedProcesses("CA")).journeys.length, 6);
assert.equal((db.prepare("SELECT count(*) AS count FROM process_definitions WHERE review_status='reviewed'").get() as { count: number }).count, 16);
assert.ok((db.prepare("SELECT count(*) AS count FROM process_step_sources").get() as { count: number }).count > 9);
assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
console.log(JSON.stringify({ placeCount: coverage.placeCount, sourceCount: coverage.sourceCount, bytes: statSync("data/govroute-locations.db").size, tests: "search, unofficial labels, statistical government gate, topic-scoped sources, integrity" }));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
