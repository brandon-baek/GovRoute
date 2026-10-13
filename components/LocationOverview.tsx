import type { PlaceContext } from "@/lib/place-registry";
export function LocationOverview({context}:{context:PlaceContext}) {
  const governments=context.places.filter(p=>["county","state","municipality"].includes(p.kind));
  const unincorporated=context.places.some(p=>p.kind==="cdp" && p.government_status==="none") && !context.places.some(p=>p.kind==="municipality" && p.government_status==="active");
  return <section className="location-overview" aria-label="Location context"><div><span className="section-label">Your area</span><strong>{unincorporated?"Unincorporated community":"Geographic context"}</strong><p>{unincorporated?"This community has no municipal government of its own. The responsible office depends on the task.":"These geographic areas help find the responsible office. Each task has its own service area."}</p></div><ul>{governments.map(p=><li key={p.id}><span>{p.kind==="municipality"?"City":p.kind==="county"?"County or equivalent":"State or territory"}</span><strong>{p.name}</strong></li>)}</ul>{context.unresolved.length>0 && <p className="location-unresolved">Some boundaries remain unconfirmed. Use the address lookup for more precise routing.</p>}</section>;
}
