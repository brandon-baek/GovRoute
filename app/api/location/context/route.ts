import { NextRequest, NextResponse } from "next/server";
import { contextForPlaces } from "@/lib/place-registry";
import { consumeRequest } from "@/lib/request-limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!consumeRequest(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local")) return NextResponse.json({message:"Please wait before another lookup."},{status:429});
  const id=request.nextUrl.searchParams.get("id");
  if (!id || id.length>150) return NextResponse.json({message:"Select a valid community."},{status:400});
  try { const context=await contextForPlaces([id],"community",[],true);
    if (!context.places.some(p=>p.id===id)) return NextResponse.json({message:"Place not found."},{status:404});
    return NextResponse.json({context},{headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({message:"Location context is unavailable. Try a street address or state."},{status:503});}
}
