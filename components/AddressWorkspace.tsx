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
  const [requested, setRequested] = useState(false);
  useEffect(() => { setReport(initialReport); setError(""); setCompleted([]); setRequested(false); }, [address, initialReport]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    setReport(undefined); setCompleted([]); setError(""); setLoading(true);
    fetch("/api/location/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }), signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message ?? "Address report unavailable."); if (!controller.signal.aborted) setReport(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message ?? "Address report unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [address, requested, revision]);
  return <section className="address-workspace" aria-label="Address-specific findings and guides">
    <div className="address-workspace__heading"><div><p className="section-label">At your address</p><h2>Turn the location into a plan.</h2></div><button type="button" disabled={loading} onClick={() => { setRequested(true); setRevision(r => r + 1); }}>{loading ? "Checking official maps…" : report ? "Refresh findings" : "Build my address report"}</button></div>
    <p>Look up mapped flood zones, school-district geography, and—in Los Angeles County—candidate parcels and zoning. Your checklist changes with the records returned.</p>
    <p className="privacy-note">This sends the address to Census and matched coordinates to FEMA and, for LA County, the county GIS service. Govroute does not save the address or findings. Nothing is sent to an AI model. Clearing the location removes this report.</p>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p role="status">Checking the address and official map layers. Unavailable layers will be shown separately.</p>}
      {error && <p role="alert">{error}</p>}
      {report && <>
        <p className="address-precision">Address-range screening · Checked {new Date(report.checkedAt).toLocaleString()} · Confirm the actual property before acting</p>
        <div className="address-findings">{report.findings.map(f => <article key={f.id} className={`address-finding address-finding--${f.status}`}><h3>{f.label}</h3><span>{labels[f.status]}</span>{Object.keys(f.values).length > 0 && <dl>{Object.entries(f.values).map(([key, value]) => <div key={key}><dt>{fieldLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>}<p>{f.note}</p><a href={f.source} target="_blank" rel="noreferrer">Source: {f.publisher}</a></article>)}</div>
        <div className="address-guides">{report.guides.map(guide => <article key={guide.id}><h3>{guide.title}</h3><p>{guide.why}</p><ol>{guide.steps.map((step, index) => { const id = guide.id + ":" + index; return <li key={id}><label><input type="checkbox" checked={completed.includes(id)} onChange={() => setCompleted(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])} /><strong>{step.title}</strong></label><p>{step.detail}</p><a href={step.url} target="_blank" rel="noreferrer">Open official next step ↗</a></li>; })}</ol></article>)}</div>
        <details><summary>Precision and coverage limits</summary><ul>{report.limitations.map(note => <li key={note}>{note}</li>)}</ul></details>
        <button type="button" onClick={() => window.print()}>Print this address checklist</button>
      </>}
    </div>
  </section>;
}
