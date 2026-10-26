"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { states } from "@/lib/jurisdictions";
import type { Journey } from "@/lib/schema";
import { ExternalIcon } from "@/components/icons";
import { GuideResult } from "@/components/GuideResult";
import { DiscoveredGuideResult } from "@/components/DiscoveredGuideResult";
import type { DiscoveredGuide } from "@/lib/discovered-guides";
import type { LocalResource } from "@/lib/local-resources";
import { LocationPicker } from "@/components/LocationPicker";
import { AddressWorkspace } from "@/components/AddressWorkspace";
import type { AddressWorkspace as AddressReport } from "@/lib/address-workspace";
import { LocationOverview } from "@/components/LocationOverview";
import type { PlaceContext } from "@/lib/place-registry";

type ApiResponse =
  | { status: "address_guidance"; message: string; workspace: AddressReport; alternatives: [] }
  | { status: "coverage_gap"; title?: string; directoryResources?: LocalResource[]; message: string; steps: string[]; sources: { id: string; title: string; url: string; publisher: string }[]; missing: string[]; scopeNote: string; alternatives: [] }
  | { status: "matched"; message: string; journey: Journey; workspace?: AddressReport; provenance: { router: string; storage: string; processStorage?: string; assembledFrom: string[] }; alternatives: { id: string; slug: string; title: string }[] }
  | { status: "discovered"; message: string; guide: DiscoveredGuide; provenance: { router: string; assembledFrom: string[] }; alternatives: { id: string; slug: string; title: string; summary?: string; href?: string }[] }
  | { status: "clarify" | "unsupported" | "blocked" | "error"; message: string; alternatives: { id: string; slug: string; title: string; summary?: string; href?: string }[]; officialSearchUrl?: string };

const examples = [
  "How do I renew my passport?",
  "I need a driver's license in a new state",
  "How do I register to vote?",
  "I want to remodel my home. How do I get a building permit?"
];

export function GuideSearch() {
  const [state, setState] = useState("");
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [locationContext,setLocationContext]=useState<PlaceContext>();
  const [locationAddress,setLocationAddress]=useState<string>();
  const [pickerKey,setPickerKey]=useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!loading && !result) return;
    const frame=requestAnimationFrame(()=>{
      resultRef.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
      resultRef.current?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[loading,result]);
  function resetLocation() { requestVersion.current++; activeRequest.current?.abort(); setLoading(false); setResult(null); }

  async function run(query: string) {
    const clean = query.trim();
    if (clean.length < 3 || loading) return;
    const version=++requestVersion.current;
    activeRequest.current?.abort();
    const controller=new AbortController(); activeRequest.current=controller;
    setLoading(true);
    setResult(null);
    setSubmitted(clean);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, state: state || undefined, placeIds: placeIds.length ? placeIds : undefined, locationAddress, history: [] })
      });
      const data = (await response.json()) as ApiResponse;
      if (version!==requestVersion.current) return;
      if (!Array.isArray(data.alternatives)) data.alternatives=[];
      setResult(data);

    } catch {
      if (version!==requestVersion.current || controller.signal.aborted) return;
      setResult({ status: "error", message: "govroute could not connect. Check your connection and try again.", alternatives: [] });
    } finally {
      if (version===requestVersion.current) setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(message);
  }

  return (
    <div className="search-experience">
      <form className="guide-search" onSubmit={submit}>
        <div className="form-kicker"><span>Find your route</span><span>01 / Your situation</span></div><label htmlFor="goal">What do you need to do?</label>
        <div className="guide-search__control">
          <textarea id="goal" name="goal" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. I want to remodel my home and need a building permit" rows={2} maxLength={600} />
        </div>
        <div className="location-fields search-location">
          <label htmlFor="search-state">State or territory<select id="search-state" value={state} onChange={(event) => { setState(event.target.value); setPlaceIds([]); setLocationLabel("");setLocationContext(undefined);setLocationAddress(undefined);setPickerKey(k=>k+1); resetLocation(); }}><option value="">Select a state (optional)</option>{states.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        </div>
        <LocationPicker key={pickerKey} state={state} onChange={(ids, label, code,context,address) => { setPlaceIds(ids); setLocationLabel(label);setLocationContext(context);setLocationAddress(address); if (code) setState(code); resetLocation(); }} />
        {locationContext && <LocationOverview context={locationContext} />}
        <button className="search-submit" type="submit" disabled={loading || message.trim().length < 3}>{loading?<><span className="ui-spinner"/>Finding your route…</>:<>Find my next step <span aria-hidden="true">→</span></>}</button>
        <p className="search-hint">Official sources. No account required. Keep identity and account numbers out of your request.</p>
      </form>



      {!submitted && (
        <div className="examples" aria-label="Example requests">
          <span>Try an example</span>
          <div>
            {examples.map((example) => <button type="button" key={example} onClick={() => { setMessage(example); document.getElementById("goal")?.focus(); }}>{example}</button>)}
          </div>
        </div>
      )}

      <div className="answer-region" aria-label="Guidance results" aria-live="polite" aria-busy={loading} ref={resultRef} tabIndex={-1}>
        {result&&<div className="result-arrival"><span className="result-check">✓</span><div><strong>{result.status==="matched"||result.status==="address_guidance"||result.status==="discovered"?"Your guidance is ready":"Here’s what we found"}</strong><p>{locationLabel||states.find(s=>s.code===state)?.name||"Government pathways"}</p></div><a href="#ask">Edit request ↑</a></div>}
        {loading && <SearchSkeleton query={submitted} />}
        {result?.status === "address_guidance" && locationAddress && <AddressWorkspace key={locationAddress} address={locationAddress} initialReport={result.workspace} />}
        {result?.status === "matched" && (
          <>
            <div className="query-line"><span>You asked</span><p>{submitted}</p></div>
            <GuideResult journey={result.journey} />
            {locationAddress && result.workspace && <AddressWorkspace key={locationAddress} address={locationAddress} initialReport={result.workspace} />}
            <details className="trace-details">
              <summary>How this answer was assembled</summary>
              <p>This pathway was selected for your task{state && result.journey.jurisdiction !== "federal" ? ` and ${states.find((item) => item.code === state)?.name ?? state}` : ""}. Its steps link to {result.provenance.assembledFrom.length} official source{result.provenance.assembledFrom.length === 1 ? "" : "s"}. Source links show where to check the current requirements before you act.</p>
              <Link href={`/graph?focus=${result.journey.id}`}>See it in the graph</Link>
            </details>
          </>
        )}
        {result?.status === "discovered" && <>
          <div className="query-line"><span>You asked</span><p>{submitted}</p></div>
          <DiscoveredGuideResult guide={result.guide} compact />
          <details className="trace-details"><summary>Why this result was selected</summary><p>Your request matched a published government task whose source, task title, page content, and crawl record passed the automated publication checks.</p><Link href={`/guides/${result.guide.slug}`}>Open the permanent guide</Link></details>
        </>}
        {result?.status === "coverage_gap" && <section className="pathway-gap"><p className="section-label">{result.title ?? "Find the rules for your property"}</p><h2>Here is the next useful step.</h2><p>{result.message}</p><ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>{result.scopeNote}</p><details className="missing-evidence"><summary>What still needs confirmation</summary><ul>{result.missing.map(item=><li key={item}>{item}</li>)}</ul></details>{result.sources.length > 0 && <ul>{result.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.publisher}</a></li>)}</ul>}{Boolean(result.directoryResources?.length) && <div><h3>Official local starting points</h3><p>These websites match the registered government organization. The procedure and service area still need confirmation.</p><ul>{result.directoryResources?.map(resource=><li key={resource.id}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title} · {resource.placeName}</a><span> · {resource.kind==="indexed_page" ? "Crawled "+resource.retrievedAt.slice(0,10)+"; instructions unreviewed" : "Official registration; procedure unreviewed"}</span>{["unavailable","blocked"].includes(resource.lastCheckStatus) && <span> · Latest automated crawl unavailable</span>}</li>)}</ul></div>}</section>}
        {result && result.status !== "matched" && result.status !== "discovered" && result.status !== "coverage_gap" && result.status !== "address_guidance" && (
          <div className={`notice notice--${result.status}`} role={result.status === "error" || result.status === "blocked" ? "alert" : undefined}>
            <p>{result.message}</p>
            {result.alternatives?.length > 0 && <div className="notice-options">{result.alternatives.map((item) => <Link key={item.id} href={item.href ?? `/guides/${item.slug}`}><strong>{item.title}</strong>{item.summary && <span>{item.summary}</span>}</Link>)}</div>}
            {result.officialSearchUrl && <a className="text-action" href={result.officialSearchUrl} target="_blank" rel="noreferrer">Search USA.gov<ExternalIcon /></a>}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchSkeleton({ query }: { query: string }) {
 return <section className="search-progress" role="status"><div className="ui-spinner"/><p className="section-label">Finding your next step</p><h2>Checking the right route for you.</h2><p className="progress-query">{query}</p><p>Matching your task and location with published procedures and official sources. Address checks can take longer.</p><div className="indeterminate-track"><span/></div></section>;
}
