import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/place-registry",()=>({openRegistry:async()=>null}));
vi.mock("@/lib/process-registry",()=>({publishedProcesses:async()=>({journeys:[]})}));
import { addressLocalActions, extractLocalPassages, topicForPage } from "./local-evidence";
describe("local official-page extraction",()=>{
  it("identifies tasks from page identity rather than incidental body mentions",()=>{
    expect(topicForPage("Building permits","https://example.gov/building-permits").map(t=>t.id)).toContain("building_permit");
    expect(topicForPage("Report damaged public property in San Francisco","https://www.sf.gov/report-damaged-public-property").map(t=>t.id)).toContain("reports");
    expect(topicForPage("Home","https://example.gov/")).toHaveLength(0);
  });
  it("retains actual source instructions instead of inventing requirements",()=>{
    const source="Building permits\nSubmit your signed building permit application at the permit center.\nYou must provide two copies of the site plan for this application.\nCopyright and all rights reserved for this government website.";
    const lines=extractLocalPassages(source,["building permit"]);
    expect(lines).toContain("Submit your signed building permit application at the permit center.");
    expect(lines).toContain("You must provide two copies of the site plan for this application.");
    expect(lines.every(line=>source.includes(line))).toBe(true);expect(lines.some(line=>/copyright/i.test(line))).toBe(false);
  });
  it("bounds and deduplicates excerpts",()=>{
    const line="Submit the building permit application with a signed site plan.";
    expect(extractLocalPassages(Array(20).fill(line).join("\n"),["building permit"])).toEqual([line]);
  });
  it("reports missing registry data without manufacturing local steps",async()=>{
    expect((await addressLocalActions(undefined)).unavailable).toBe(true);
  });
});
