import { describe,expect,it } from "vitest";
import { processJourneys } from "@/lib/process-catalog";
import { withSourceFreshness } from "./source-freshness";
const original=processJourneys[0];
describe("source review freshness",()=>{
  it("keeps a recent human review verified",()=>{
    const recent={...original,reviewStatus:"verified" as const,reviewedAt:"2026-10-08",sources:original.sources.map(source=>({...source,lastChecked:"2026-10-08"}))};
    expect(withSourceFreshness(recent,new Date("2026-10-09T12:00:00Z")).reviewStatus).toBe("verified");
  });
  it("marks an aged publication due without rewriting its instructions",()=>{
    const due=withSourceFreshness({...original,reviewStatus:"verified"},new Date("2027-01-01T00:00:00Z"));
    expect(due.reviewStatus).toBe("review-due");expect(due.steps).toEqual(original.steps);
  });
  it("cannot freshen an old review through a recent automated link check",()=>{
    const old={...original,reviewStatus:"verified" as const,reviewedAt:"2020-01-01",sources:original.sources.map(source=>({...source,lastChecked:"2026-10-09"}))};
    expect(withSourceFreshness(old,new Date("2026-10-09T12:00:00Z")).reviewStatus).toBe("review-due");
  });
  it("never upgrades an unreviewed page",()=>{
    const machine={...original,reviewStatus:"machine-indexed" as const};
    expect(withSourceFreshness(machine,new Date("2026-10-09"))).toBe(machine);
  });
});
