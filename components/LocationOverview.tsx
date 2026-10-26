import type {PlaceContext} from "@/lib/place-registry";
export function LocationOverview({context}:{context:PlaceContext}){
 const community=context.places.find(p=>p.kind==="cdp"||p.kind==="municipality");const county=context.places.find(p=>p.kind==="county");
 const unincorporated=context.places.some(p=>p.kind==="cdp"&&p.government_status==="none")&&!context.places.some(p=>p.kind==="municipality"&&p.government_status==="active");
 return <div className="selected-area" aria-label="Selected location"><span aria-hidden="true">⌖</span><div><strong>{community?.name??county?.name??"Address area selected"}</strong><p>{unincorporated?"Unincorporated area · ":""}{county?.name&&county.name!==community?.name?county.name:"Location applied to your request"}</p>{context.unresolved.length>0&&<small>Some boundaries still need confirmation.</small>}</div></div>;
}
