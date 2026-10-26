import {describe,it,expect,vi,afterEach} from "vitest";
import {NextRequest} from "next/server";
const state=vi.hoisted(()=>({allowed:true}));
vi.mock("@/lib/request-limits",()=>({consumeRequest:()=>state.allowed}));
vi.mock("@/lib/database",()=>({getStoredJourneys:()=>({journeys:[]})}));
vi.mock("@/lib/process-registry",()=>({currentJourneyReview:async(journey:Record<string,unknown>)=>({...journey,reviewStatus:"review-due"})}));
import {POST} from "./route";
const request=(body:unknown)=>new NextRequest("https://govroute.test/api/plan/recheck",{method:"POST",body:JSON.stringify(body)});
afterEach(()=>{state.allowed=true;});
describe("private saved-guide version checks",()=>{
 it("returns current guide and move versions without requiring a personal plan or address",async()=>{
  const response=await POST(request({ids:["journey-passport-apply","move-NY-TX-vehicle","unknown-guide"]}));const data=await response.json();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store, private");expect(data.records[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(data.records[0].journey.reviewStatus).toBe("review-due");expect(data.records[1].journey.id).toBe("move-NY-TX-vehicle");expect(data.records[2].status).toBe("unavailable");expect(data.note).toContain("not a live legal");
 });
 it("rejects plan contents, arbitrary address fields, large requests and invalid ID collections",async()=>{
  for(const body of [{ids:["journey-passport-apply"],address:"A private address"},{ids:Array(13).fill("guide")},{ids:[null]},{ids:"guide"}])expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({ids:["x".repeat(5000)]}))).status).toBe(413);
 });
 it("rate limits before reading guide data",async()=>{state.allowed=false;expect((await POST(request({ids:[]}))).status).toBe(429);});
});
