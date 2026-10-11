import { describe, expect, it } from "vitest";
import { censusMatches, geographyReferences, requiresParcelEvidence } from "./place-context";

describe("location evidence", () => {
  it("retains zero and multiple address matches for explicit selection", () => {
    expect(censusMatches({ result: { addressMatches: [] } })).toEqual([]);
    const match = { matchedAddress: "Fixture street", coordinates: { x: -122, y: 38 }, geographies: { Counties: [{ GEOID: "06001", NAME: "Fixture" }] } };
    expect(censusMatches({ result: { addressMatches: [match, match] } })).toHaveLength(2);
    expect(geographyReferences(match)).toEqual([{ layer: "Counties", geoid: "06001", name: "Fixture" }]);
  });
  it("rejects malformed geocoder results instead of treating them as no matches", () => {
    expect(() => censusMatches({ result: {} })).toThrow();
    expect(() => censusMatches({ result: { addressMatches: [{ matchedAddress: "Fixture", coordinates: { x: 200, y: 38 }, geographies: {} }] } })).toThrow();
  });
  it("requests property records without blocking unrelated business processes", () => {
    expect(requiresParcelEvidence("What are my land rights?")).toBe(true);
    expect(requiresParcelEvidence("Can I build an ADU?")).toBe(true);
    expect(requiresParcelEvidence("How do I build a business?")).toBe(false);
    expect(requiresParcelEvidence("Report damaged public property")).toBe(false);
    expect(requiresParcelEvidence("Can I build on public property?")).toBe(true);
    expect(requiresParcelEvidence("Report public property damage near my parcel boundary")).toBe(true);
    expect(requiresParcelEvidence("Report damage on my property")).toBe(true);
  });
});
