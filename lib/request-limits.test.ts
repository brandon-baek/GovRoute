import { describe, expect, it, vi } from "vitest";
import { consumeAIRoute, consumeRequest } from "@/lib/request-limits";
describe("bounded request and paid-route guards", () => {
  it("resets the request window and rejects excess traffic", () => {
    for (let i=0;i<30;i++) expect(consumeRequest("test-address",1000)).toBe(true);
    expect(consumeRequest("test-address",1000)).toBe(false);
    expect(consumeRequest("test-address",61000)).toBe(true);
  });
  it("requires opt-in, caps calls, and resets hourly", () => {
    vi.stubEnv("GOVROUTE_ENABLE_PAID_AI","false"); expect(consumeAIRoute(1000)).toBe(false);
    vi.stubEnv("GOVROUTE_ENABLE_PAID_AI","true"); vi.stubEnv("GOVROUTE_AI_ROUTES_PER_HOUR","2");
    expect(consumeAIRoute(1000)).toBe(true); expect(consumeAIRoute(1000)).toBe(true); expect(consumeAIRoute(1000)).toBe(false);
    expect(consumeAIRoute(3601000)).toBe(true); vi.unstubAllEnvs();
  });
});
