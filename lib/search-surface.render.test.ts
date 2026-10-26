import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {GuideSearch} from "@/components/GuideSearch";
import {LocationOverview} from "@/components/LocationOverview";
describe("task-first search surface",()=>{
 it("names the submit action and exposes a result destination without prototype instructions",()=>{const html=renderToStaticMarkup(createElement(GuideSearch));expect(html).toContain("Find my next step");expect(html).toContain('aria-label="Guidance results"');expect(html).not.toContain("For a local answer:");});
 it("keeps jurisdiction context concise inside the form and preserves uncertainty",()=>{const html=renderToStaticMarkup(createElement(LocationOverview,{context:{places:[{id:"cdp",name:"La Crescenta",kind:"cdp",government_status:"none",name_status:"official",state_code:"CA",state_fips:"06"},{id:"county",name:"Los Angeles County",kind:"county",government_status:"active",name_status:"official",state_code:"CA",state_fips:"06"}],relations:[],authorities:[],unresolved:[{layer:"test",geoid:"unknown",name:"Unknown"}],precision:"community"}}));expect(html).toContain("Unincorporated community");expect(html).toContain("Los Angeles County");expect(html).toContain("Some boundaries still need confirmation");expect(html).not.toContain("<button");});
});
