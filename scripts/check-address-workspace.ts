import assert from "node:assert/strict";
import { resolveAddress } from "../lib/address-resolver";
import { buildAddressWorkspace } from "../lib/address-workspace";

async function main() {
  // Public civic addresses only; no resident information is logged.
  const cases = [
    { name: "LA County public library", address: "2809 Foothill Boulevard, La Crescenta, CA 91214", local: true },
    { name: "New York City Hall", address: "260 Broadway, New York, NY 10007", local: false }
  ];
  const results: unknown[] = [];
  for (const item of cases) {
    const matches = await resolveAddress(item.address);
    assert.equal(matches.length, 1, item.name + ": expected one Census match");
    const report = await buildAddressWorkspace(matches[0]);
    assert(report.guides.some(g => g.id === "flood"));
    const maps = report.findings.filter(f => ["flood", "parcel", "zoning"].includes(f.id));
    if (item.local) assert.equal(maps.length, 3, "LA County adapters must be selected from the returned county");
    else assert.equal(maps.length, 1, "LA County adapters must not run in New York");
    results.push({ case: item.name, layers: maps.map(f => ({ id: f.id, status: f.status })), schoolDistricts: report.findings.filter(f => /school district/i.test(f.label)).length });
    console.log(JSON.stringify(results[results.length - 1]));
    assert(maps.some(f => f.status !== "unavailable"), item.name + ": every official map provider was unavailable");
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Address smoke check failed"); process.exitCode = 1; });
