import { describe,expect,it } from "vitest";
import { states } from "@/lib/jurisdictions";
import { buildMovePlan } from "./moving";
describe("interstate user scenarios",()=>{
  it("keeps New York departure and Texas vehicle/license agencies in the right order",()=>{
    const plan=buildMovePlan("NY","TX",true)!;
    expect(plan.steps.find(step=>step.id==="departure")?.detail).toContain("surrender");
    expect(plan.steps.find(step=>step.id==="registration")?.url).toContain("txdmv.gov");
    expect(plan.steps.find(step=>step.id==="license")?.url).toContain("dps.texas.gov");
    expect(plan.steps.find(step=>step.id==="license")?.dependsOn).toContain("registration");
  });
  it("does not invent a registration dependency when no vehicle is brought",()=>{
    const plan=buildMovePlan("NY","TX",false)!;
    expect(plan.steps.map(step=>step.id)).toEqual(["residency","license"]);
    expect(plan.steps.find(step=>step.id==="license")?.dependsOn).not.toContain("registration");
  });
  it("supports all pairs without attaching an unreviewed state's exact deadlines",()=>{
    for(const origin of states) for(const destination of states) for(const vehicle of [true,false]) {
      const plan=buildMovePlan(origin.code,destination.code,vehicle);
      if(origin.code===destination.code) {expect(plan).toBeNull();continue;}
      expect(plan).not.toBeNull();
      const visited=new Set<string>();
      for(const step of plan!.steps) {
        expect(new URL(step.url).protocol).toBe("https:");
        expect([origin.name,destination.name]).toContain(step.jurisdiction);
        expect(step.dependsOn?.every(id=>visited.has(id))??true).toBe(true);
        visited.add(step.id);
      }
      if(!plan!.detailed) expect(plan!.steps.every(step=>step.deadline===undefined)).toBe(true);
    }
  });
  it("rejects invalid or equivalent states and reports aged source review",()=>{
    expect(buildMovePlan("ZZ","TX",true)).toBeNull();
    expect(buildMovePlan("ca","CA",true)).toBeNull();
    expect(buildMovePlan("NY","TX",true,new Date("2027-01-01"))!.reviewDue).toBe(true);
  });
});
