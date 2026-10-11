import { NextRequest, NextResponse } from "next/server";
import { publishedProcesses } from "@/lib/process-registry";
import { stateByCode } from "@/lib/jurisdictions";
import { contextForPlaces } from "@/lib/place-registry";
import { publicationPlaceIds } from "@/lib/scope-context";
import { retrieveJourneys } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state")?.toUpperCase();
  const id=request.nextUrl.searchParams.get("id");
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if ((state && !stateByCode(state)) || query.length > 120 || (id && id.length>150)) {
    return NextResponse.json({ message: "Choose a supported state and a query up to 120 characters." }, { status: 400 });
  }
  try {
    const context=id ? await contextForPlaces([id]) : undefined;
    if(id && !context?.places.some(place=>place.id===id)) return NextResponse.json({message:"Choose an available place."},{status:404});
    const scopeIds=publicationPlaceIds(context,id?[id]:[]);
    const location=state??context?.places.find(place=>place.kind==="state")?.state_code??undefined;
    if(state && context?.places.some(place=>place.state_code && place.state_code!==state)) return NextResponse.json({message:"The place and selected state differ."},{status:400});
    const catalog = await publishedProcesses(location,scopeIds);
    const journeys = query ? retrieveJourneys(query, 20, catalog.journeys, location, scopeIds).map((match) => match.journey) : catalog.journeys;
    return NextResponse.json({ processes: journeys, storage: catalog.storage, coverage: "Only the explicitly published processes are included." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "The process catalog is temporarily unavailable." }, { status: 503 });
  }
}
