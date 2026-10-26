import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AddressVisual,JurisdictionLayers} from "./LocationVisuals";
import type {AddressWorkspace} from "@/lib/address-workspace";
const report:AddressWorkspace={checkedAt:"2026-10-26",precision:"address_range",map:{longitude:-118,latitude:34,parcelRings:[[[-118,34],[-117.999,34],[-117.999,34.001],[-118,34]]]},findings:[{id:"parcel",label:"Parcel",status:"matched",values:{APN:"123"},source:"https://example.gov/parcel",publisher:"County",checkedAt:"2026-10-26",note:"Confirm parcel identity"},{id:"flood",label:"Flood",status:"unavailable",values:{},source:"https://example.gov/flood",publisher:"FEMA",checkedAt:"2026-10-26",note:"Service unavailable"}],guides:[],limitations:[]};
describe("location evidence visuals",()=>{
 it("renders returned geometry and honest partial-layer counts without loading an external map",()=>{const html=renderToStaticMarkup(createElement(AddressVisual,{report}));expect(html).toContain("polygon");expect(html).toContain("1 of 2 layers returned records");expect(html).toContain("Confirm parcel identity");expect(html).not.toContain("<iframe");expect(html).toContain("shares coordinates with OpenStreetMap");});
 it("does not invent a parcel when geometry is missing",()=>{const html=renderToStaticMarkup(createElement(AddressVisual,{report:{...report,map:undefined}}));expect(html).not.toContain("<polygon");expect(html).toContain("no parcel geometry returned");});
 it("distinguishes a community from a municipal government",()=>{const html=renderToStaticMarkup(createElement(JurisdictionLayers,{context:{places:[{id:"cdp",name:"La Crescenta",kind:"cdp",government_status:"none",name_status:"official",state_code:"CA",state_fips:"06"}],relations:[],authorities:[],unresolved:[],precision:"community"}}));expect(html).toContain("No separate city government");expect(html).not.toContain("City of La Crescenta");});
});
