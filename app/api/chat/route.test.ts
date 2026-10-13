import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { journeys } from "@/data/curated/journeys";
vi.mock("@/lib/database", () => ({ getStoredJourneys: () => ({ journeys, storage: "bundled-fallback" }) }));
// Keep fallback-unit scenarios independent of any real snapshot mounted for
// integration checks in the same checkout.
vi.mock("@/lib/place-registry", () => ({
  openRegistry: async () => null,
  contextForPlaces: async () => ({places:[],relations:[],authorities:[],unresolved:[],precision:"community"}),
  relevantLegalSources: async () => []
}));
vi.mock("@/lib/ai-router", () => ({ routeWithAI: vi.fn() }));
import { routeWithAI } from "@/lib/ai-router";
import { POST } from "./route";
const request = (body: unknown) => new NextRequest("https://govguide.test/api/chat", { method:"POST", body:JSON.stringify(body) });
describe("free guidance endpoint", () => {
  it("makes no paid calls when disabled, even with a key", async () => {
    vi.stubEnv("GOVGUIDE_ENABLE_PAID_AI", "false"); vi.stubEnv("OPENAI_API_KEY", "test-key");
    const response = await POST(request({message:"I was laid off in California",state:"CA"}));
    expect((await response.json()).journey.id).toBe("journey-ca-unemployment"); expect(routeWithAI).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
  it("routes cross-state requests to the planner", async () => { const body = await (await POST(request({message:"moving from New York to Texas"}))).json(); expect(body.alternatives[0].href).toBe("/moving"); });
  it("asks for the destination when a vehicle move names only its origin", async () => {
    const body = await (await POST(request({message:"moving from New York with a car"}))).json();
    expect(body.status).toBe("clarify");
    expect(body.alternatives[0].href).toBe("/moving");
    expect(body.journey).toBeUndefined();
  });
  it("routes a single-state license transfer to its published procedure", async () => {
    const body = await (await POST(request({message:"transfer out-of-state license to Texas",state:"TX"}))).json();
    expect(body.status).toBe("matched");
    expect(body.journey.id).toBe("journey-tx-license-transfer");
    expect(body.journey.steps.find((step: {id: string}) => step.id==="visit").dependsOn).toEqual(["vehicles","documents"]);
  });
  it("routes New York plate surrender to its insurance dependency", async () => {
    const body = await (await POST(request({message:"surrender NY plates before canceling insurance",state:"NY"}))).json();
    expect(body.status).toBe("matched");
    expect(body.journey.id).toBe("journey-ny-plate-surrender");
    expect(body.journey.steps.at(-1).dependsOn).toEqual(["return"]);
  });
  it("keeps passport renewal task-first after a move", async () => { const body = await (await POST(request({message:"renew passport after moving from New York to Texas"}))).json(); expect(body.status).toBe("matched"); expect(body.journey.jurisdiction).toBe("federal"); });
  it("serves prepared passport steps without a mounted registry", async () => {
    const body = await (await POST(request({message:"How do I renew my passport?"}))).json();
    expect(body.status).toBe("matched");
    expect(body.journey.id).toBe("journey-passport-apply");
    expect(body.journey.steps).toHaveLength(5);
    expect(body.journey.steps[2].fees).toHaveLength(2);
    expect(body.provenance.processStorage).toBe("bundled-process-catalog");
  });
  it("shows a local coverage gap when only a typed SF locality is supplied", async () => {
    const body = await (await POST(request({message:"Report a broken bench",state:"CA",locality:"San Francisco"}))).json();
    expect(body.status).toBe("coverage_gap");
    expect(body.journey).toBeUndefined();
    expect(body.alternatives).toEqual([]);
  });
  it("shows missing property records rather than deciding rights", async () => { const body = await (await POST(request({message:"What are my land rights in my exact home?",state:"CA"}))).json(); expect(body.status).toBe("coverage_gap"); expect(body.steps).toHaveLength(3); expect(body.journey).toBeUndefined(); });
  it("clarifies conflicting state selection", async () => { const body = await (await POST(request({message:"unemployment in Texas",state:"CA"}))).json(); expect(body.status).toBe("clarify"); expect(body.journey).toBeUndefined(); });
  it("rejects oversized requests and malformed JSON", async () => {
    expect((await POST(request({message:"x".repeat(9000)}))).status).toBe(413);
    expect((await POST(new NextRequest("https://govguide.test/api/chat",{method:"POST",body:"{"}))).status).toBe(400);
  });
  it("blocks sensitive identifiers before routing", async () => { expect((await (await POST(request({message:"my SSN is 123-45-6789"}))).json()).status).toBe("blocked"); });
});
