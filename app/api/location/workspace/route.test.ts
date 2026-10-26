import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ allowed: true, resolve: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/request-limits", () => ({ consumeRequest: () => mocks.allowed }));
vi.mock("@/lib/place-registry",()=>({contextForAddress:async()=>({places:[]})}));
vi.mock("@/lib/local-evidence",()=>({enrichAddressActions:async()=>({procedures:[],evidence:[],topics:[],unavailable:true})}));
vi.mock("@/lib/address-resolver", () => ({ resolveAddress: mocks.resolve }));
vi.mock("@/lib/address-workspace", () => ({ buildAddressWorkspace: mocks.build }));
import { POST } from "./route";
const request = (body: unknown) => new NextRequest("https://govroute.test/api/location/workspace", { method: "POST", body: JSON.stringify(body) });
afterEach(() => { mocks.allowed = true; vi.clearAllMocks(); });
describe("private address workspace endpoint", () => {
  it("rechecks the address and returns private non-cacheable findings", async () => {
    const match = { coordinates: { x: -118, y: 34 } }; mocks.resolve.mockResolvedValue([match]); mocks.build.mockResolvedValue({ findings: [], guides: [] });
    const response = await POST(request({ address: "A complete public test address" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.build).toHaveBeenCalledWith(match,expect.any(Function),undefined); expect(JSON.stringify(await response.json())).not.toContain("test address");
  });
  it("rejects visitor coordinates, arbitrary URLs, malformed input, and large bodies", async () => {
    for (const body of [{ address: "A complete test address", coordinates: { x: 1, y: 1 } }, { address: "short" }, [], null, { url: "https://example.com" }]) expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request({ address: "x".repeat(2200) }))).status).toBe(413);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("does not choose an ambiguous address or silently accept no match", async () => {
    for (const matches of [[], [{}, {}]]) { mocks.resolve.mockResolvedValue(matches); expect((await POST(request({ address: "A complete test address" }))).status).toBe(409); }
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("fails recoverably when geocoding is unavailable", async () => {
    mocks.resolve.mockRejectedValue(new Error("upstream")); expect((await POST(request({ address: "A complete test address" }))).status).toBe(503);
  });
  it("limits requests before external lookups", async () => {
    mocks.allowed = false; expect((await POST(request({ address: "A complete test address" }))).status).toBe(429); expect(mocks.resolve).not.toHaveBeenCalled();
  });
});

