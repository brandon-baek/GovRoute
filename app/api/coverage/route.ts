import { NextRequest,NextResponse } from "next/server";
import { contextForAddress, contextForPlaces, registryCoverage } from "@/lib/place-registry";
import { resolveAddress } from "@/lib/address-resolver";
import { consumeRequest } from "@/lib/request-limits";
import { z } from "zod";
import { publicationPlaceIds } from "@/lib/scope-context";
import { publishedProcesses } from "@/lib/process-registry";
import { procedureCoverage } from "@/lib/procedure-coverage";
import { stateByCode } from "@/lib/jurisdictions";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const inputSchema=z.object({state:z.string().regex(/^[A-Z]{2}$/).optional(),id:z.string().min(1).max(150).optional(),locationAddress:z.string().trim().min(8).max(240).optional()}).strict();
const headers={"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer"};
async function coverage(request:NextRequest,input:unknown) {
  if(!consumeRequest(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local"))return NextResponse.json({message:"Please wait before another coverage lookup."},{status:429,headers});
  const parsed=inputSchema.safeParse(input);
  if(!parsed.success || (parsed.data.state && !stateByCode(parsed.data.state)))return NextResponse.json({message:"Choose a valid area."},{status:400,headers});
  const {state,id,locationAddress}=parsed.data;
  try {
    let context=id?await contextForPlaces([id],"community",[],!locationAddress):undefined;
    if(locationAddress) {
      const matches=await resolveAddress(locationAddress);
      if(matches.length!==1)return NextResponse.json({message:"Confirm a single address using the location lookup."},{status:409,headers});
      context=await contextForAddress(matches[0]);
    }
    if(id && !context?.places.some(p=>p.id===id)) return NextResponse.json({message:"Place not found."},{status:404,headers});
    if(state && context?.places.some(p=>p.state_code && p.state_code!==state)) return NextResponse.json({message:"The place and state differ."},{status:400,headers});
    const location=state??context?.places.find(p=>p.state_code)?.state_code??undefined;
    const selected=locationAddress?context?.places.map(p=>p.id)??[]:id?[id]:[];
    const catalog=await publishedProcesses(location,publicationPlaceIds(context,selected),context);
    return NextResponse.json({topics:procedureCoverage(catalog.journeys),inventory:await registryCoverage(),context,scopeNote:"Coverage describes published tasks, not every legal requirement in this area."},{headers});
  } catch {return NextResponse.json({message:"Coverage is temporarily unavailable. Clear the address to use community lookup."},{status:503,headers});}
}
export async function GET(request:NextRequest) {
  return coverage(request,{state:request.nextUrl.searchParams.get("state")?.toUpperCase(),id:request.nextUrl.searchParams.get("id")??undefined});
}
export async function POST(request:NextRequest) {
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let bytes=0;
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2048){await reader.cancel();return NextResponse.json({message:"Location request too large."},{status:413,headers});}chunks.push(part.value);}
    return coverage(request,JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {return NextResponse.json({message:"Choose a valid area."},{status:400,headers});}
}
