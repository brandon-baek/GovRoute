import { NextRequest, NextResponse } from "next/server";
import { contextForPlaces, registryCoverage, searchPlaces } from "@/lib/place-registry";
import { stateByCode } from "@/lib/jurisdictions";
import { consumeRequest } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!consumeRequest(key)) return NextResponse.json({ status: "error", message: "Please wait a minute before searching again." }, { status: 429 });
  const headers = { "Cache-Control": "no-store" };
  const params = request.nextUrl.searchParams;
  try {
    const coverage = await registryCoverage();
    if (params.get("coverage") === "true") return NextResponse.json(coverage, { headers });
    if (coverage.status === "not_imported") return NextResponse.json({ status: "not_imported", message: "The place registry has not been imported yet. State and federal pathways remain available." }, { status: 503, headers });
    const placeId = params.get("id");
    if (placeId) {
      if (placeId.length > 150) return NextResponse.json({ status: "error", message: "Invalid place." }, { status: 400, headers });
      const context = await contextForPlaces([placeId]);
      return NextResponse.json({ status: context.places.length ? "matched" : "not_found", context }, { status: context.places.length ? 200 : 404, headers });
    }
    const query = params.get("q")?.trim() ?? "";
    const state = params.get("state") ?? undefined;
    if (query.length < 2 || query.length > 100 || (state && (!/^[A-Z]{2}$/.test(state) || !stateByCode(state)))) return NextResponse.json({ status: "error", message: "Enter a place name between 2 and 100 characters." }, { status: 400, headers });
    return NextResponse.json({ status: "results", places: await searchPlaces(query, state) }, { headers });
  } catch {
    return NextResponse.json({ status: "error", message: "The location registry is unavailable. Try again later." }, { status: 503, headers });
  }
}
