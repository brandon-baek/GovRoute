import { describe,expect,it } from "vitest";
import { fitsServiceArea } from "./service-area";
import { processJourneys } from "./process-catalog";
import type { PlaceContext, Place } from "./place-registry";
const guide={...processJourneys[0],serviceArea:"unincorporated" as const,territoryIds:["county"]};
const community:Place={id:"community",kind:"cdp",government_status:"none",name:"Community",state_code:"CA",state_fips:"06",name_status:"official"};
const context={places:[community],relations:[{child_id:"community",parent_id:"county",relation:"contained_by",evidence:"Whole polygon"}],authorities:[],unresolved:[],precision:"community"} as PlaceContext;
describe("unincorporated service area",()=>{
  it("uses a server-verified address county even when the whole CDP crosses counties",()=>{
    const address={...context,precision:"address_range" as const,relations:[],places:[...context.places,{...community,id:"county",kind:"county",government_status:"active" as const}]};
    expect(fitsServiceArea(guide,address,["community","county"])).toBe(true);
    expect(fitsServiceArea({...guide,territoryIds:["another-county"]},address,["community","county"])).toBe(false);
  });
  it("accepts a selected statistical community only with the relevant county containment",()=>{expect(fitsServiceArea(guide,context,["community"])).toBe(true);});
  it("rejects city, county-only, unrelated county, and point-only assertions",()=>{
    expect(fitsServiceArea(guide,context,["county"])).toBe(false);
    expect(fitsServiceArea({...guide,territoryIds:["different-county"]},context,["community"])).toBe(false);
    expect(fitsServiceArea(guide,{...context,relations:context.relations.map(r=>({...r,relation:"primary_point_in"}))},["community"])).toBe(false);
    expect(fitsServiceArea(guide,{...context,places:[...context.places,{...community,id:"city",kind:"municipality",government_status:"active"}]},["community"])).toBe(false);
  });
});
