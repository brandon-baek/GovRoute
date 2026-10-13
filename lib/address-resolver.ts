import { censusMatches } from "@/lib/place-context";

export async function resolveAddress(address:string,fetcher:typeof fetch=fetch) {
  const url=new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.search=new URLSearchParams({address,benchmark:"Public_AR_Current",vintage:"Current_Current",layers:"all",format:"json"}).toString();
  // The address is used for this requested lookup only, never stored or passed
  // to the optional AI router. Bound the upstream body before parsing it.
  const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(12000),redirect:"error"});
  if(!response.ok || !response.body) throw new Error("Official geocoder unavailable");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  while(true) {const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
    if(bytes>2*1024*1024){await reader.cancel();throw new Error("Geocoder response too large");}chunks.push(part.value);}
  const matches=censusMatches(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if(matches.length>10)throw new Error("Too many address candidates");
  return matches;
}
