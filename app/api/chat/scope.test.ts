import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { processJourneys } from "@/lib/process-catalog";
const fixtures=vi.hoisted(()=>({local:"census:municipality:4812345",tribal:"census:aian:fixture"}));
vi.mock("@/lib/database",()=>({getStoredJourneys:()=>({journeys:[],storage:"fixture"})}));
vi.mock("@/lib/discovered-guides",()=>({discoveredGuides:[],retrieveDiscoveredGuides:()=>[]}));
vi.mock("@/lib/ai-router",()=>({routeWithAI:vi.fn()}));
vi.mock("@/lib/local-resources",()=>({localResources:async()=>[]}));
vi.mock("@/lib/place-registry",()=>({
  contextForPlaces:async(ids:string[])=>({
    places:ids.map(id=>({id,name:id,kind:id===fixtures.tribal?"tribal_area":"municipality",state_code:id===fixtures.tribal?null:"TX",government_status:"active"})),
    relations:[],authorities:[],unresolved:[],precision:"municipality"
  }),
  relevantLegalSources:async()=>[]
}));
vi.mock("@/lib/process-registry",()=>({publishedProcesses:async(state:string|undefined,ids:string[])=>({
  journeys:((state==="TX"&&ids.includes(fixtures.local))||ids.includes(fixtures.tribal))?[{
    ...processJourneys[0],id:"fixture-building-permit",slug:"fixture-building-permit",
    title:"Apply for a building permit",summary:"Follow the reviewed building permit application.",
    category:"Construction",aliases:["building permit"],jurisdiction:"local",state:ids.includes(fixtures.tribal)?undefined:"TX",
    territoryIds:[ids.includes(fixtures.tribal)?fixtures.tribal:fixtures.local]
  }]:[],
  storage:"registry-process-catalog"
})}));
import { POST } from "./route";
async function ask(id:string,state?:string) {
  return (await POST(new NextRequest("https://govroute.test/api/chat",{
    method:"POST",body:JSON.stringify({message:"Apply for a building permit",state,placeIds:[id]})
  }))).json();
}
describe("local process routing",()=>{
  it("serves the reviewed local procedure before the generic coverage gap",async()=>{
    const result=await ask(fixtures.local,"TX");
    expect(result.status).toBe("matched");
    expect(result.journey.id).toBe("fixture-building-permit");
    expect(result.provenance.processStorage).toBe("registry-process-catalog");
  });
  it("accepts an exact local service area without inventing a state",async()=>{
    const result=await ask(fixtures.tribal);
    expect(result.status).toBe("matched");
    expect(result.journey.state).toBeUndefined();
    expect(result.journey.territoryIds).toEqual([fixtures.tribal]);
  });
  it("keeps the procedure out of another municipality",async()=>{
    const result=await ask("census:municipality:4899999","TX");
    expect(result.status).toBe("coverage_gap");
    expect(result.journey).toBeUndefined();
    expect(result.missing).toContain("Reviewed local procedure");
  });
});
