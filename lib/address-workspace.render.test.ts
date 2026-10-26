import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddressWorkspace } from "@/components/AddressWorkspace";
import { assembleAddressGuides, type AddressFinding } from "@/lib/address-workspace";
describe("address report rendering", () => {
  it("shows actual map values, sources, next actions and ambiguity labels", () => {
    const findings: AddressFinding[] = [
      { id:"zoning",label:"Mapped zoning",status:"matched",values:{ZONE:"R-1",PLNG_AREA:"Example planning area"},source:"https://example.gov/map",publisher:"Example County",checkedAt:"2026-10-26T00:00:00Z",note:"Confirm the parcel." },
      { id:"parcel",label:"Candidate parcel",status:"ambiguous",values:{},source:"https://example.gov/parcels",publisher:"Example County",checkedAt:"2026-10-26T00:00:00Z",note:"Multiple parcels returned." }
    ];
    const html=renderToStaticMarkup(createElement(AddressWorkspace,{address:"An example public address",initialReport:{checkedAt:"2026-10-26T00:00:00Z",precision:"address_range",findings,guides:assembleAddressGuides(findings),limitations:["Confirm boundaries."]}}));
    expect(html).toContain("R-1");expect(html).toContain("Example planning area");expect(html).toContain("Needs boundary confirmation");
    expect(html).toContain("Open official next step");expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("An example public address");
  });
});
