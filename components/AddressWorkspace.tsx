"use client";
import { useEffect, useState } from "react";
import type { AddressWorkspace as Workspace } from "@/lib/address-workspace";
const labels = { matched: "Map record found", no_match: "No map record returned", ambiguous: "Needs boundary confirmation", unavailable: "Service unavailable" };
const fieldLabels: Record<string, string> = { ZONE: "Zone", Z_DESC: "Description", PLNG_AREA: "Planning area", AIN: "Assessor ID", APN: "Parcel number", UseDescription: "Assessor use description", FLD_ZONE: "Flood zone", ZONE_SUBTY: "Zone subtype", SFHA_TF: "Special flood hazard indicator", name: "Name", GEOID: "Census identifier" };
export function AddressWorkspace({ address, initialReport }: { address: string; initialReport?: Workspace }) {
  const [report, setReport] = useState<Workspace | undefined>(initialReport);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [task,setTask]=useState("");
  const [parcelId,setParcelId]=useState<string>();
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    fetch("/api/location/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address,task,parcelId }), signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message ?? "Address report unavailable."); if (!controller.signal.aborted) setReport(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message ?? "Address report unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [address, requested, revision, task, parcelId]);
  return <section className="address-workspace" aria-label="Address-specific findings and guides">
    <div className="address-workspace__heading"><div><p className="section-label">At your address</p><h2>Turn the location into a plan.</h2></div><button type="button" disabled={loading} onClick={() => { setReport(undefined); setCompleted([]); setError(""); setLoading(true); setRequested(true); setRevision(r => r + 1); }}>{loading ? "Checking official maps…" : report ? "Refresh findings" : "Build my address report"}</button></div>
    <p>Look up mapped flood zones, school-district geography, and—in Los Angeles County—candidate parcels and zoning. Your checklist changes with the records returned. Local procedures and extracted official-page instructions appear alongside the map findings.</p>
    <p className="privacy-note">This sends the address to Census, matched coordinates to FEMA, and—for LA County—the normalized street address and candidate geometry to the county GIS service. Govroute does not save the address or findings. Nothing is sent to an AI model. Clearing the location removes this report.</p>
    <label className="address-task">Focus the local instructions<select value={task} onChange={event=>{setTask(event.target.value);if(requested||report){setRequested(true);setLoading(true);setReport(undefined);}}}><option value="">All local tasks</option><option value="building_permit">Building and remodeling</option><option value="property">Zoning and property</option><option value="business">Start a local business</option><option value="waste">Trash and water services</option><option value="reports">Report a local problem</option><option value="voting">Voting and local records</option></select></label>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p role="status">Checking the address and official map layers. Unavailable layers will be shown separately.</p>}
      {error && <p role="alert">{error}</p>}
      {report && <>
        <p className="address-precision">Address-range screening · Checked {new Date(report.checkedAt).toLocaleString()} · Confirm the actual property before acting</p>
        {report.localActions && <section className="local-action-workspace"><h3>Local instructions for your address area</h3>
          {report.localActions.procedures.length>0 && <div><h4>Published local procedures</h4><ul>{report.localActions.procedures.map(j=><li key={j.id}><a href={"/guides/"+j.slug}>{j.title}</a><span> · {j.reviewStatus==="verified"?"Reviewed":"Review due"}</span><p>{j.summary}</p></li>)}</ul></div>}
          {report.localActions.evidence.map(page=><article className="local-source-guide" key={page.id}><p className="section-label">{page.placeName} · Extracted official-page instructions</p><h4><a href={page.url} target="_blank" rel="noreferrer">{page.title}</a></h4><ol>{page.excerpts.map((line,index)=><li key={index}>{line}</li>)}</ol><p className="privacy-note">{page.warning}</p><p>Source: {page.publisher} · Indexed {page.indexedAt.slice(0,10)} · Human review pending</p></article>)}
          {report.localActions.evidence.length===0 && report.localActions.procedures.length===0 && <p>No task-specific local instructions have been indexed for this address area yet. Map findings and the official next steps below remain available.</p>}
          {report.localActions.unavailable && <p>Some local source data could not be loaded. Available map findings are shown below.</p>}
        </section>}
        <div className="address-findings">{report.findings.map(f => <article key={f.id} className={`address-finding address-finding--${f.status}`}><h3>{f.label}</h3><span>{labels[f.status]}</span>{Object.keys(f.values).length > 0 && <dl>{Object.entries(f.values).map(([key, value]) => <div key={key}><dt>{fieldLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>}<p>{f.note}</p>{f.matches && <ul>{f.matches.map((values,index)=><li key={index}>{Object.entries(values).map(([key,value])=><span key={key}>{fieldLabels[key]??key}: {value} · </span>)}</li>)}</ul>}{Boolean(f.candidates?.length) && <div className="parcel-candidates">{f.candidates?.map(candidate=><button type="button" key={candidate.id} onClick={()=>{setParcelId(candidate.id);setRequested(true);setLoading(true);setReport(undefined);}}>{candidate.label}</button>)}</div>}<a href={f.source} target="_blank" rel="noreferrer">Source: {f.publisher}</a></article>)}</div>
        <div className="address-guides">{report.guides.map(guide => <article key={guide.id}><h3>{guide.title}</h3><p>{guide.why}</p><ol>{guide.steps.map((step, index) => { const id = guide.id + ":" + index; return <li key={id}><label><input type="checkbox" checked={completed.includes(id)} onChange={() => setCompleted(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])} /><strong>{step.title}</strong></label><p>{step.detail}</p><a href={step.url} target="_blank" rel="noreferrer">Open official next step ↗</a></li>; })}</ol></article>)}</div>
        <details><summary>Precision and coverage limits</summary><ul>{report.limitations.map(note => <li key={note}>{note}</li>)}</ul></details>
        <button type="button" onClick={() => window.print()}>Print this address checklist</button>
      </>}
    </div>
  </section>;
}

