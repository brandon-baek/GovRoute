import { NextRequest,NextResponse } from "next/server";
import { contextForPlaces, registryCoverage } from "@/lib/place-registry";
import { publicationPlaceIds } from "@/lib/scope-context";
import { publishedProcesses } from "@/lib/process-registry";
import { procedureCoverage } from "@/lib/procedure-coverage";
import { stateByCode } from "@/lib/jurisdictions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const state=request.nextUrl.searchParams.get("state")?.toUpperCase();const id=request.nextUrl.searchParams.get("id");
  if((state && !stateByCode(state)) || (id && id.length>150)) return NextResponse.json({message:"Choose a valid area."},{status:400});
  try {
    const context=id?await contextForPlaces([id],"community",[],true):undefined;
    if(id && !context?.places.some(p=>p.id===id)) return NextResponse.json({message:"Place not found."},{status:404});
    if(state && context?.places.some(p=>p.state_code && p.state_code!==state)) return NextResponse.json({message:"The place and state differ."},{status:400});
    const location=state??context?.places.find(p=>p.state_code)?.state_code??undefined;
    const catalog=await publishedProcesses(location,publicationPlaceIds(context,id?[id]:[]),context);
    return NextResponse.json({topics:procedureCoverage(catalog.journeys),inventory:await registryCoverage(),context,scopeNote:"Coverage describes published tasks, not every legal requirement in this area."},{headers:{"Cache-Control":"no-store"}});
  } catch {return NextResponse.json({message:"Coverage is temporarily unavailable."},{status:503});}
}
