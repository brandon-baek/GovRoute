import {describe,it,expect} from "vitest";
import {emptyPlan,saveGuide,parsePlan,planSteps,togglePlanStep,preparationPacket,stepKey,fingerprintJourney,guideChanges,moveJourney} from "./action-plan";
import {processJourneys} from "./process-catalog";
const passport=()=>structuredClone(processJourneys.find(j=>j.id==="journey-passport-apply")!);
describe("combined private action plans",()=>{
 it("combines guides and unlocks dependent steps without bypassing prerequisites",async()=>{
  const journey=passport();let plan=await saveGuide(emptyPlan(),journey);const first=journey.steps[0];const dependent=journey.steps.find(s=>s.dependsOn?.includes(first.id))!;const a=stepKey(journey.id,first.id),b=stepKey(journey.id,dependent.id);
  expect(togglePlanStep(plan,b)).toEqual(plan);plan=togglePlanStep(plan,a);expect(planSteps(plan).find(s=>s.key===b)?.blockedBy).toEqual([]);plan=togglePlanStep(plan,b);expect(plan.completed).toContain(b);plan=togglePlanStep(plan,a);expect(plan.completed).not.toContain(b);
 });
 it("replaces duplicate saves and resets completion after instruction changes",async()=>{
  const journey=passport();let plan=await saveGuide(emptyPlan(),journey);plan=togglePlanStep(plan,stepKey(journey.id,journey.steps[0].id));plan=await saveGuide(plan,journey);expect(plan.guides).toHaveLength(1);expect(plan.completed).toHaveLength(1);journey.steps[0].detail+=" Updated instruction.";plan=await saveGuide(plan,journey);expect(plan.completed).toHaveLength(0);
 });
 it("consolidates exact preparation repeats while keeping agency uses visible",async()=>{
  const a=passport(),b=passport();a.steps[0].requirements=["Original identity document."];b.id="another-guide";b.title="Another task";b.steps[0].requirements=["Original identity document"];
  let plan=await saveGuide(emptyPlan(),a);plan=await saveGuide(plan,b);const shared=preparationPacket(plan).find(r=>r.text==="Original identity document.")!;expect(shared.usedBy).toEqual([a.title,b.title]);
 });
 it("ignores recorded link-check timestamps when comparing factual guide versions",async()=>{
  const a=passport(),b=passport();b.sources[0].indexCheckedAt="2026-10-26";b.reviewStatus="review-due";expect(await fingerprintJourney(a)).toBe(await fingerprintJourney(b));b.steps[0].fees=["Changed fee information"];expect(await fingerprintJourney(a)).not.toBe(await fingerprintJourney(b));expect(guideChanges(a,b)).toContain("Fees");
 });
 it("rejects unsafe imported links, invalid dependencies and impossible dates",async()=>{
  const valid=await saveGuide(emptyPlan(),passport());const bad=structuredClone(valid);bad.guides[0].journey.sources[0].url="javascript:alert(1)";expect(()=>parsePlan(bad)).toThrow();
  const cycle=structuredClone(valid);cycle.guides[0].journey.steps[0].dependsOn=[cycle.guides[0].journey.steps[0].id];expect(()=>parsePlan(cycle)).toThrow();
  const dates=structuredClone(valid);dates.dates[stepKey(dates.guides[0].journey.id,dates.guides[0].journey.steps[0].id)]="2026-02-30";expect(()=>parsePlan(dates)).toThrow();
 });
 it("restores only dependency-consistent progress and valid preparation readiness",async()=>{
  const plan=await saveGuide(emptyPlan(),passport());const j=plan.guides[0].journey;const child=j.steps.find(s=>s.dependsOn?.length)!;plan.completed=[stepKey(j.id,child.id)];plan.prepared=["removed requirement"];const restored=parsePlan(JSON.parse(JSON.stringify(plan)));expect(restored.completed).toEqual([]);expect(restored.prepared).toEqual([]);
 });
 it("turns a real interstate plan into one source-linked portable guide",async()=>{
  const move=moveJourney("NY","TX",true)!;const plan=await saveGuide(emptyPlan(),move);expect(planSteps(plan).find(s=>s.step.id==="license")?.blockedBy.length).toBeGreaterThan(0);expect(move.steps.find(s=>s.id==="registration")?.deadlines?.[0]).toContain("30 days");expect(moveJourney("CA","CA",true)).toBeNull();expect(parsePlan(JSON.parse(JSON.stringify(plan))).guides[0].journey.id).toBe("move-NY-TX-vehicle");
 });
});
