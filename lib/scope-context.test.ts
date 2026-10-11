import { describe,expect,it } from "vitest";
import { publicationPlaceIds } from "./scope-context";
import type { PlaceContext } from "./place-registry";
import { processJourneys } from "./process-catalog";
import { retrieveJourneys } from "./retrieval";
import { matchesLocation } from "./jurisdictions";

const context={places:["community","town","county","state"].map(id=>({id,name:id,kind:id,state_code:"TX",state_fips:"48",name_status:"official",government_status:"active"})),
  relations:[{child_id:"community",parent_id:"county",relation:"primary_point_in",evidence:"Point only"},{child_id:"town",parent_id:"county",relation:"contained_by",evidence:"Complete containment"},{child_id:"county",parent_id:"state",relation:"contained_by",evidence:"Complete containment"}],
  authorities:[],unresolved:[],precision:"community"} as PlaceContext;
describe("reviewed publication scope",()=>{
  it("does not use a community point to certify a county procedure",()=>{
    expect(publicationPlaceIds(context,["community"])).toEqual(["community"]);
  });
  it("accepts explicit county selection and complete containment",()=>{
    expect(new Set(publicationPlaceIds(context,["town"]))).toEqual(new Set(["town","county","state"]));
    expect(new Set(publicationPlaceIds(context,["county"]))).toEqual(new Set(["county","state"]));
  });
  it("retrieves a generic state process only in its state",()=>{
    const guide={...processJourneys[0],id:"fixture-state",jurisdiction:"state" as const,state:"TX"};
    expect(retrieveJourneys("renew passport",1,[guide],"TX")).toHaveLength(1);
    expect(retrieveJourneys("renew passport",1,[guide],"CA")).toHaveLength(0);
  });
  it("requires a reviewed local territory match even when names and state match",()=>{
    const guide={...processJourneys[0],id:"fixture-local",jurisdiction:"local" as const,state:"TX",locality:"Springfield",territoryIds:["town"]};
    expect(matchesLocation(guide,"TX","Springfield")).toBe(false);
    expect(retrieveJourneys("renew passport",1,[guide],"TX",["town"])).toHaveLength(1);
    expect(retrieveJourneys("renew passport",1,[guide],"TX",["other-town"])).toHaveLength(0);
    expect(retrieveJourneys("renew passport",1,[guide],"CA",["town"])).toHaveLength(0);
  });
});
