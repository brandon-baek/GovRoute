import { describe,expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { GuideResult } from "@/components/GuideResult";
import { LocationOverview } from "@/components/LocationOverview";
import { processJourneys } from "@/lib/process-catalog";
import type { PlaceContext } from "@/lib/place-registry";

describe("user-facing evidence and checklist contract",()=>{
  it("distinguishes official handoffs from complete procedures",()=>{
    const journey=processJourneys.find(j=>j.id==="journey-birth-certificate-start")!;
    const html=renderToStaticMarkup(createElement(GuideResult,{journey}));
    expect(html).toContain("Official starting route");expect(html).toContain("current residence does not determine");expect(html).toContain("Sources for this step");
    expect(html).toContain("Progress stays in this browser");expect(html).toContain('type="checkbox"');expect(html).toContain("Print checklist");
  });
  it("shows dependency order and review expiry in the guide",()=>{
    const journey={...processJourneys.find(j=>j.id==="journey-tx-license-transfer")!,reviewStatus:"review-due" as const};
    const html=renderToStaticMarkup(createElement(GuideResult,{journey}));
    expect(html).toContain("Review due");expect(html).toContain("First:");expect(html).toContain("Complete vehicle prerequisites");expect(html).toContain("disabled");
  });
  it("explains nonmunicipal status without inventing a city government",()=>{
    const context={places:[{id:"community",name:"Example community",kind:"cdp",government_status:"none",name_status:"official",state_code:"CA",state_fips:"06"},{id:"county",name:"Example County",kind:"county",government_status:"active",name_status:"official",state_code:"CA",state_fips:"06"}],relations:[],authorities:[],unresolved:[],precision:"community"} as PlaceContext;
    const html=renderToStaticMarkup(createElement(LocationOverview,{context}));
    expect(html).toContain("Unincorporated community");expect(html).toContain("no municipal government");expect(html).toContain("Example County");
  });
  it("keeps core text above WCAG AA contrast on the warm paper palette",()=>{
    const css=readFileSync("app/hub.css","utf8");const values=Object.fromEntries([...css.matchAll(/--(paper|surface|ink|muted|green):(#\w{6})/g)].map(m=>[m[1],m[2]]));
    function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
    for(const fg of ["ink","muted","green"])for(const bg of ["paper","surface"]){const a=luminance(values[fg]),b=luminance(values[bg]);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);}
    expect(values.paper).not.toBe("#ffffff");
  });
});
