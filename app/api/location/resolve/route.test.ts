import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/request-limits",()=>({consumeRequest:()=>true}));
vi.mock("@/lib/place-registry",()=>({contextForAddress:()=>({places:[{id:"fixture"}],relations:[],authorities:[],unresolved:[],precision:"address_range"})}));
import { POST } from "./route";
const request=(body:unknown)=>new NextRequest("https://govroute.test/api/location/resolve",{method:"POST",body:JSON.stringify(body)});
const match={matchedAddress:"1600 PENNSYLVANIA AVE NW, WASHINGTON, DC",coordinates:{x:-77.036,y:38.898},geographies:{States:[{GEOID:"11",NAME:"District of Columbia"}]}};
afterEach(()=>vi.unstubAllGlobals());
describe("address lookup contract",()=>{
  it("requires user confirmation and preserves address-range precision",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match]}}),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const response=await POST(request({address:"1600 Pennsylvania Ave NW, Washington, DC"}));
    const body=await response.json();
    expect(body.status).toBe("matched"); expect(body.candidates[0].context.precision).toBe("address_range");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const url=new URL(fetcher.mock.calls[0][0]);
    expect(url.hostname).toBe("geocoding.geo.census.gov");
    expect(url.searchParams.get("address")).toBe("1600 Pennsylvania Ave NW, Washington, DC");
  });
  it("preserves multiple candidates rather than choosing the first",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match,{...match,matchedAddress:"Second candidate"}]}}))));
    const body=await (await POST(request({address:"Complete ambiguous address"}))).json();
    expect(body.status).toBe("ambiguous");expect(body.candidates).toHaveLength(2);
  });
  it("returns not-found without inventing a community",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[]}}))));
    const body=await (await POST(request({address:"An unmatched street address"}))).json();
    expect(body.status).toBe("not_found");expect(body.candidates).toEqual([]);
  });
  it("handles upstream failure and malformed geography as unavailable",async()=>{
    for (const response of [new Response("",{status:503}),new Response(JSON.stringify({result:{addressMatches:[{...match,coordinates:{x:999,y:38}}]}}))]) {
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
      expect((await POST(request({address:"Complete street address"}))).status).toBe(502);
    }
  });
  it("rejects malformed and oversized input before contacting Census",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    expect((await POST(new NextRequest("https://govroute.test/api/location/resolve",{method:"POST",body:"{"}))).status).toBe(400);
    expect((await POST(request({address:"x".repeat(3000)}))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
