import { describe,expect,it,vi } from "vitest";
import { censusService,containingCounty } from "./county-boundary";
const polygon={rings:[[[-118,34],[-118.1,34],[-118.1,34.1],[-118,34]]],spatialReference:{wkid:4326}};
function fetcher(counties:{attributes:{GEOID:string}}[]) {
  return vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({features:[{attributes:{GEOID:"0612345"},geometry:polygon}]}))).mockResolvedValueOnce(new Response(JSON.stringify({features:counties})));
}
describe("national whole-boundary county adapter",()=>{
  it("queries the complete community polygon, never its centroid",async()=>{
    const request=fetcher([{attributes:{GEOID:"06037"}}]);
    expect(await containingCounty(censusService+"/29",censusService+"/82","0612345",request)).toBe("06037");
    const parameters=request.mock.calls[1][1].body as URLSearchParams;
    expect(parameters.get("spatialRel")).toBe("esriSpatialRelWithin");
    expect(JSON.parse(parameters.get("geometry")!)).toEqual(polygon);
  });
  it("does not certify multi-county, absent, or other-state containment",async()=>{
    for(const rows of [[],[{attributes:{GEOID:"06037"}},{attributes:{GEOID:"06059"}}],[{attributes:{GEOID:"53033"}}]]) expect(await containingCounty(censusService+"/29",censusService+"/82","0612345",fetcher(rows))).toBeNull();
  });
  it("rejects incomplete responses and untrusted URLs",async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({features:[],exceededTransferLimit:true})));
    await expect(containingCounty(censusService+"/29",censusService+"/82","0612345",request)).rejects.toThrow("Incomplete");
    await expect(containingCounty("https://example.com/29",censusService+"/82","0612345",request)).rejects.toThrow("Untrusted");
  });
});
