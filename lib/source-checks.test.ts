import { describe,expect,it } from "vitest";
import { applySourceChecks } from "./source-checks";
import { processJourneys } from "./process-catalog";
const journey=processJourneys.find(j=>j.id==="journey-irs-ein")!;
describe("automated checks versus instruction review",()=>{
  it("a successful crawl cannot renew an expired authored review",()=>{
    const old={...journey,reviewStatus:"review-due" as const,reviewedAt:"2020-01-01"};const result=applySourceChecks(old,[{id:old.sources[0].id,status:"indexed",checkedAt:"2026-10-13"}]);
    expect(result.reviewStatus).toBe("review-due");expect(result.reviewedAt).toBe("2020-01-01");
  });
  it("a changed source requests re-review without fabricating new instructions",()=>{
    const result=applySourceChecks(journey,[{id:journey.sources[0].id,status:"indexed",checkedAt:"2026-10-13",changedAt:"2026-10-13T00:01:00Z"}]);
    expect(result.reviewStatus).toBe("review-due");expect(result.steps).toEqual(journey.steps);expect(result.reviewNote).toContain("source changed");
  });
  it("records blocked indexing separately from the source-checked procedure",()=>{
    const result=applySourceChecks(journey,[{id:journey.sources[0].id,status:"unavailable",checkedAt:"2026-10-13"}]);
    expect(result.reviewStatus).toBe("verified");expect(result.sources[0].indexStatus).toBe("unavailable");
  });
});
