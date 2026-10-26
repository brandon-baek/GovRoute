import {NextRequest,NextResponse} from "next/server";
import {getStoredJourneys} from "@/lib/database";
import {processJourneys} from "@/lib/process-catalog";
import {currentJourneyReview} from "@/lib/process-registry";
import {fingerprintJourney,moveJourney} from "@/lib/action-plan";
import {consumeRequest} from "@/lib/request-limits";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer"};
export async function POST(request:NextRequest){
 if(!consumeRequest(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local"))return NextResponse.json({message:"Wait a moment before rechecking more guides."},{status:429,headers});
 let ids:string[];
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>4096){await reader.cancel();return NextResponse.json({message:"Request too large."},{status:413,headers});}chunks.push(part.value);}
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="ids")||!Array.isArray(body.ids)||body.ids.length>12||body.ids.some((id:unknown)=>typeof id!=="string"||id.length<1||id.length>160))throw new Error();ids=[...new Set(body.ids)] as string[];
 }catch{return NextResponse.json({message:"Provide up to 12 saved guide IDs."},{status:400,headers});}
 try{
  const catalog=new Map([...getStoredJourneys().journeys,...processJourneys].map(j=>[j.id,j]));
  const records=await Promise.all(ids.map(async id=>{const move=/^move-([A-Z]{2})-([A-Z]{2})-(vehicle|no-vehicle)$/.exec(id);const saved=move?moveJourney(move[1],move[2],move[3]==="vehicle"):catalog.get(id);
   if(!saved)return {id,status:"unavailable" as const};
   const journey=move?saved:await currentJourneyReview(saved);return {id,status:"available" as const,journey,fingerprint:await fingerprintJourney(journey)};
  }));
  return NextResponse.json({checkedAt:new Date().toISOString(),records,note:"Compares saved references with GovRoute's current published guide versions and recorded review/source-check status. It is not a live legal or government-page audit."},{headers});
 }catch{return NextResponse.json({message:"Guide versions could not be checked. Your browser-saved plan is still available."},{status:503,headers});}
}
