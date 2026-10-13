import { describe, expect, it } from "vitest";
import { bundledProcessesForState, mergeProcessJourneys, processJourneys } from "@/lib/process-catalog";
import { retrieveJourneys } from "@/lib/retrieval";

describe("published process routing", () => {
  it("offers federal passport steps without a location or national registry", () => {
    const records = bundledProcessesForState();
    expect(records.map((journey) => journey.id)).toContain("journey-passport-apply");
    expect(records.every(journey=>journey.jurisdiction==="federal")).toBe(true);
    const passport = retrieveJourneys("renew passport", 1, records)[0].journey;
    expect(passport.steps.some((step) => step.requirements?.length)).toBe(true);
    expect(passport.steps.some((step) => step.fees?.length)).toBe(true);
    expect(passport.steps.some((step) => step.deadlines?.length)).toBe(true);
  });

  it("does not present California's new-resident process as a Texas process", () => {
    expect(bundledProcessesForState("TX").some((journey) => journey.id === "journey-ca-new-resident")).toBe(false);
    expect(bundledProcessesForState("CA").some((journey) => journey.id === "journey-ca-new-resident")).toBe(true);
  });

  it("keeps the new state procedures in their reviewed states", () => {
    const texas = bundledProcessesForState("TX");
    expect(texas.map(journey=>journey.id)).toContain("journey-tx-license-transfer");
    expect(bundledProcessesForState("NY").map(journey=>journey.id)).toContain("journey-ny-plate-surrender");
    expect(bundledProcessesForState("CA").some(journey=>journey.id==="journey-ny-plate-surrender")).toBe(false);
  });

  it("requires a resolved municipal scope before offering a bundled local guide", () => {
    expect(processJourneys.some(journey=>journey.id==="journey-sf-damaged-public-property")).toBe(true);
    for (const state of [undefined,"CA","TX"]) {
      expect(bundledProcessesForState(state).some(journey=>journey.jurisdiction==="local")).toBe(false);
    }
  });

  it("updates an older SQL passport document without duplicate identities", () => {
    const updated = processJourneys.find((journey) => journey.id === "journey-passport-apply")!;
    const old = { ...updated, reviewedAt: "2020-01-01", steps: [updated.steps[0]] };
    const records = mergeProcessJourneys([old]);
    expect(records.filter((journey) => journey.id === old.id)).toHaveLength(1);
    expect(records.find((journey) => journey.id === old.id)?.steps).toHaveLength(5);
  });
});
