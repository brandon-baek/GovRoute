import { describe,expect,it } from "vitest";
import { traceJourney } from "./graph";
import { processJourneys } from "./process-catalog";
describe("per-answer provenance",()=>{
  it("contains only the selected journey and its supporting graph",()=>{
    const journey=processJourneys.find(j=>j.id==="journey-la-county-building-permit")!;
    const trace=traceJourney(journey);const ids=new Set(trace.nodes.map(n=>n.id));
    expect(trace.nodes.filter(n=>n.kind==="journey").map(n=>n.id)).toEqual([journey.id]);
    expect(trace.nodes.filter(n=>n.kind==="step")).toHaveLength(journey.steps.length);
    expect(trace.edges.every(e=>ids.has(e.from)&&ids.has(e.to))).toBe(true);
    expect(JSON.stringify(trace).length).toBeLessThan(10000);
  });
});
