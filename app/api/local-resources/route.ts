import { NextRequest, NextResponse } from "next/server";
import { contextForPlaces, registryCoverage } from "@/lib/place-registry";
import { localResources } from "@/lib/local-resources";
import { consumeRequest } from "@/lib/request-limits";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const headers={"Cache-Control":"no-store"};
  const key=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local";
  if (!consumeRequest(key)) return NextResponse.json({status:"error",message:"Please wait a minute before searching again."},{status:429,headers});
  const id=request.nextUrl.searchParams.get("id"),query=request.nextUrl.searchParams.get("q")??"";
  if (!id || id.length>150 || query.length>120) return NextResponse.json({status:"error",message:"Choose a valid place."},{status:400,headers});
  try {
    if ((await registryCoverage()).status!=="available") return NextResponse.json({status:"unavailable",message:"Local directory lookup is temporarily unavailable."},{status:503,headers});
    const context=await contextForPlaces([id]);
    if (!context.places.some(place=>place.id===id)) return NextResponse.json({status:"not_found",resources:[]},{status:404,headers});
    const resources=await localResources(context,query);
    return NextResponse.json({status:resources.length?"directory":"coverage_gap",resources,
      scopeNote:"These official registrations and indexed pages are starting points. Topic authority, service boundaries, requirements, and fees still need procedure review."},{headers});
  } catch { return NextResponse.json({status:"unavailable",message:"Local directory lookup is temporarily unavailable."},{status:503,headers}); }
}
