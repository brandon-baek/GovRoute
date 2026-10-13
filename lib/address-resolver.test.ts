import { describe,expect,it,vi } from "vitest";
import { resolveAddress } from "./address-resolver";
const match={matchedAddress:"PUBLIC TEST ADDRESS",coordinates:{x:-118,y:34},geographies:{Counties:[{GEOID:"06037"}]}};
describe("bounded official address adapter",()=>{
  it("uses the official endpoint without caching or redirects",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({result:{addressMatches:[match]}})));
    expect(await resolveAddress("A complete test address",fetcher)).toEqual([match]);
    const [url,options]=fetcher.mock.calls[0];expect(url.hostname).toBe("geocoding.geo.census.gov");expect(options.cache).toBe("no-store");expect(options.redirect).toBe("error");
  });
  it("rejects oversized bodies and unbounded candidate lists",async()=>{
    for(const response of [new Response("x".repeat(2*1024*1024+1)),new Response(JSON.stringify({result:{addressMatches:Array(11).fill(match)}}))]) {
      await expect(resolveAddress("A complete test address",vi.fn().mockResolvedValue(response))).rejects.toThrow();
    }
  });
});
