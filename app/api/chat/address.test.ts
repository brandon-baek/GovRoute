import { afterEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
const fixtures=vi.hoisted(()=>({city:false}));
vi.mock("@/lib/request-limits",()=>({consumeRequest:()=>true,consumeAIRoute:()=>false}));
vi.mock("@/lib/database",()=>({getStoredJourneys:()=>({journeys:[],storage:"fixture"})}));
vi.mock("@/lib/discovered-guides",()=>({discoveredGuides:[],retrieveDiscoveredGuides:()=>[]}));
vi.mock("@/lib/local-resources",()=>({localResources:async()=>[]}));
vi.mock("@/lib/place-registry",()=>({
  contextForPlaces:async()=>({places:[{id:"community",kind:"cdp",state_code:"CA",government_status:"none"},{id:"county",kind:"county",state_code:"CA",government_status:"active"}],relations:[],authorities:[],unresolved:[],precision:"community"}),
  contextForAddress:async()=>({places:[{id:"community",kind:fixtures.city?"municipality":"cdp",state_code:"CA",government_status:fixtures.city?"active":"none"},{id:"county",kind:"county",state_code:"CA",government_status:"active"}],relations:[],authorities:[],unresolved:[],precision:"address_range"}),
  relevantLegalSources:async()=>[]
}));
vi.mock("@/lib/process-registry",async()=>{
  const {processJourneys}=await import("@/lib/process-catalog");const {fitsServiceArea}=await import("@/lib/service-area");
  const guide={...processJourneys.find(j=>j.id==="journey-la-county-building-permit")!,territoryIds:["county"]};
  return {publishedProcesses:async(_state:unknown,ids:string[],context:Parameters<typeof fitsServiceArea>[1])=>({journeys:fitsServiceArea(guide,context,ids)?[guide]:[],storage:"fixture"})};
});
import { POST } from "./route";
const match={matchedAddress:"PUBLIC TEST ADDRESS",coordinates:{x:-118,y:34},geographies:{Counties:[{GEOID:"06037"}]}};
async function ask(ids=["community","county"]){return (await POST(new NextRequest("https://govroute.test/api/chat",{method:"POST",body:JSON.stringify({message:"I need a building permit",state:"CA",placeIds:ids,locationAddress:"A complete test address"})}))).json();}
afterEach(()=>{vi.unstubAllGlobals();fixtures.city=false;});
describe("address-to-procedure verification",()=>{
  it("preserves address-range context without echoing the address",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match]}})));vi.stubGlobal("fetch",fetcher);
    const answer=await ask();expect(answer.status).toBe("matched");expect(answer.journey.id).toBe("journey-la-county-building-permit");expect(fetcher).toHaveBeenCalledOnce();expect(JSON.stringify(answer)).not.toContain("TEST ADDRESS");
  });
  it("does not turn an incorporated address into a county permit route",async()=>{
    fixtures.city=true;vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match]}}))));
    expect((await ask()).status).toBe("coverage_gap");
  });
  it("rejects place IDs that do not belong to the verified address",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match]}}))));
    expect((await ask(["another-county"])).status).toBe("clarify");
  });
  it("does not publish a procedure after a failed or ambiguous address lookup",async()=>{
    for(const response of [new Response("",{status:503}),new Response(JSON.stringify({result:{addressMatches:[match,match]}}))]) {
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));const answer=await ask();expect(answer.status).toBe("clarify");expect(answer.journey).toBeUndefined();
    }
  });
});
