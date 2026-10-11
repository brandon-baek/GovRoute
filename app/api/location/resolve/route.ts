import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { censusMatches } from "@/lib/place-context";
import { contextForAddress } from "@/lib/place-registry";
import { consumeRequest } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ address: z.string().trim().min(8).max(240) }).strict();
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function POST(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!consumeRequest(key)) return NextResponse.json({ status: "error", message: "Please wait a minute before resolving another address." }, { status: 429, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("invalid");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return NextResponse.json({ status: "error", message: "Address request is too large." }, { status: 413, headers }); }
      chunks.push(value);
    }
    const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return NextResponse.json({ status: "error", message: "Enter a complete US street address." }, { status: 400, headers });
    const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
    url.search = new URLSearchParams({ address: parsed.data.address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "all", format: "json" }).toString();
    // Never store/log addresses or send them to the AI router. The official geocoder
    // receives the address only for this user-requested lookup.
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("upstream");
    const matches = censusMatches(await response.json());
    const candidates = await Promise.all(matches.map(async (match) => ({ matchedAddress: match.matchedAddress, context: await contextForAddress(match) })));
    return NextResponse.json({
      status: matches.length === 1 ? "matched" : matches.length ? "ambiguous" : "not_found",
      candidates,
      benchmark: "Public_AR_Current", vintage: "Current_Current", retrievedAt: new Date().toISOString(),
      evidenceUrl: "https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html",
      message: matches.length === 1 ? "Address matched to Census address ranges. Confirm the match; parcel and legal boundaries still need local records."
        : matches.length ? "Several addresses matched. Select the correct match before continuing." : "No address matched. Check the address or use a community and state."
    }, { headers });
  } catch (error) {
    const invalid = error instanceof SyntaxError || (error instanceof Error && error.message === "invalid");
    return NextResponse.json({ status: "error", message: invalid ? "Enter a complete US street address." : "The official address lookup is unavailable. You can still search by state or community." }, { status: invalid ? 400 : 502, headers });
  }
}
