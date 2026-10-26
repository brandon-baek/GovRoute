import { describe, expect, it } from "vitest";
import { assembleAddressGuides, buildAddressWorkspace, pointFinding, parcelByAddress } from "./address-workspace";
import type { CensusMatch } from "./place-context";
const address = (county = "06037"): CensusMatch => ({ matchedAddress: "2809 FOOTHILL BLVD, LA CRESCENTA, CA, 91214", coordinates: { x: -118.24, y: 34.21 }, geographies: { Counties: [{ GEOID: county, NAME: county === "06037" ? "Los Angeles County" : "Other County" }], "Unified School Districts": [{ GEOID: "0615720", NAME: "Example Unified" }] } });
const json = (data: unknown) => new Response(JSON.stringify(data));
const fetcher = (data: unknown): typeof fetch => async () => json(data);
describe("address-specific map evidence and generated guides", () => {
  it("resolves a street-address parcel and uses its polygon for zoning",async()=>{
    const calls:string[]=[];
    const report=await buildAddressWorkspace(address(),async(url,init)=>{
      const params=new URLSearchParams(String(init?.body));calls.push(params.get("geometryType")??"address");
      if(String(url).includes("LACounty_Parcel"))return json({features:[{attributes:{AIN:"1234567890",SitusFullAddress:"2809 FOOTHILL BLVD LA CRESCENTA CA"},geometry:{rings:[[[-118,34],[-118.001,34],[-118.001,34.001],[-118,34]]]}}]});
      return json({features:[{attributes:String(url).includes("/346/")?{ZONE:"R-1"}:{FLD_ZONE:"X"}}]});
    });
    expect(calls).toContain("esriGeometryPolygon");expect(report.findings.find(f=>f.id==="parcel")?.status).toBe("matched");
    expect(JSON.stringify(report)).not.toContain("2809 FOOTHILL");
  });
  it("does not choose between multiple assessor parcels or a similar street name",async()=>{
    expect((await parcelByAddress(address(),fetcher({features:[{attributes:{AIN:"1234567890",SitusFullAddress:"2809 FOOTHILL BLVD"}},{attributes:{AIN:"1234567891",SitusFullAddress:"2809 FOOTHILL BLVD"}}]}))).finding.status).toBe("ambiguous");
    expect((await parcelByAddress(address(),fetcher({features:[{attributes:{AIN:"1234567890",SitusFullAddress:"2809 FOOTHILL BLVDOTHER"}}]}))).finding.status).toBe("ambiguous");
  });
  it("queries reviewed endpoints with a point, never the street address", async () => {
    let called = ""; let params = "";
    const finding = await pointFinding("zoning", address(), async (url, init) => { called = String(url); params = String(init?.body); expect(init?.cache).toBe("no-store"); expect(init?.redirect).toBe("error"); return json({ features: [{ attributes: { ZONE: "R-1", Z_DESC: "Single family", PLNG_AREA: "Crescenta Valley" } }] }); });
    expect(called).toContain("/DRP/GISNET_Public/MapServer/346/query"); expect(params).toContain("inSR=4326"); expect(params).not.toContain("PUBLIC");
    const guide = assembleAddressGuides([finding])[0]; expect(guide.why).toContain("R-1"); expect(guide.why).toContain("Crescenta Valley");
  });
  it("never presents empty, incomplete, or failed flood data as low risk", async () => {
    for (const data of [{ features: [] }, { error: { code: 500 } }, { features: [{ attributes: {} }] }, { features: [{ attributes: { ZONE_SUBTY: "unknown" } }] }]) {
      const finding = await pointFinding("flood", address(), fetcher(data));
      expect(finding.status).not.toBe("matched"); expect(assembleAddressGuides([finding])[0].why).toContain("not a low-risk result");
    }
  });
  it("branches guidance based on the returned flood zone", async () => {
    const a = await pointFinding("flood", address(), fetcher({ features: [{ attributes: { FLD_ZONE: "AE", SFHA_TF: "T" } }] }));
    const b = await pointFinding("flood", address(), fetcher({ features: [{ attributes: { FLD_ZONE: "X", SFHA_TF: "F" } }] }));
    expect(assembleAddressGuides([a])[0].title).toContain("before building"); expect(assembleAddressGuides([b])[0].title).not.toContain("before building");
  });
  it("preserves ambiguity and rejects truncation and malformed feature rows", async () => {
    expect((await pointFinding("parcel", address(), fetcher({ features: [{ attributes: { AIN: "1" } }, { attributes: { AIN: "2" } }] }))).status).toBe("ambiguous");
    expect((await pointFinding("parcel", address(), fetcher({ exceededTransferLimit: true, features: [] }))).status).toBe("unavailable");
    expect((await pointFinding("parcel", address(), fetcher({ features: [null] }))).status).toBe("unavailable");
  });
  it("does not apply county adapters to an address elsewhere", async () => {
    const urls: string[] = [];
    const report = await buildAddressWorkspace(address("36061"), async url => { urls.push(String(url)); return json({ features: [] }); });
    expect(urls).toHaveLength(1); expect(urls[0]).toContain("fema.gov"); expect(report.guides.some(g => g.id === "property")).toBe(false);
    expect(report.guides.find(g => g.id.startsWith("census:"))?.why).toContain("Example Unified");
  });
  it("keeps local findings when another provider fails", async () => {
    const report = await buildAddressWorkspace(address(), async url => {
      if (String(url).includes("fema")) throw new Error("timeout");
      return json({ features: [{ attributes: String(url).includes("LACounty_Parcel") ? { AIN: "1234567890", SitusFullAddress: "2809 FOOTHILL BLVD LA CRESCENTA CA" } : { ZONE: "R-2" } }] });
    });
    expect(report.findings.find(f => f.id === "flood")?.status).toBe("unavailable"); expect(report.findings.find(f=>f.id==="parcel")?.values.AIN).toBe("1234567890");
    expect(JSON.stringify(report)).not.toContain("2809 FOOTHILL");
  });
  it("rejects invalid coordinates before contacting a provider", async () => {
    const match = address(); match.coordinates.x = NaN;
    await expect(pointFinding("flood", match, async () => { throw new Error("must not run"); })).rejects.toThrow("coordinates");
  });
  it("caps provider response bodies", async () => {
    expect((await pointFinding("flood", address(), async () => new Response("x".repeat(512 * 1024 + 1)))).status).toBe("unavailable");
  });
  it("does not invent a parcel when only an assessor description was returned", async () => {
    expect((await pointFinding("parcel", address(), fetcher({ features: [{ attributes: { UseDescription: "Residential" } }] }))).status).toBe("unavailable");
  });
});

