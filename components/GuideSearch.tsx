"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { states } from "@/lib/jurisdictions";
import type { Journey } from "@/lib/schema";
import { ArrowIcon, ExternalIcon } from "@/components/icons";
import { GuideResult } from "@/components/GuideResult";
import { DiscoveredGuideResult } from "@/components/DiscoveredGuideResult";
import type { DiscoveredGuide } from "@/lib/discovered-guides";
import type { LocalResource } from "@/lib/local-resources";
import { LocationPicker } from "@/components/LocationPicker";

type ApiResponse =
  | { status: "coverage_gap"; title?: string; directoryResources?: LocalResource[]; message: string; steps: string[]; sources: { id: string; title: string; url: string; publisher: string }[]; missing: string[]; scopeNote: string; alternatives: [] }
  | { status: "matched"; message: string; journey: Journey; provenance: { router: string; storage: string; processStorage?: string; assembledFrom: string[] }; alternatives: { id: string; slug: string; title: string }[] }
  | { status: "discovered"; message: string; guide: DiscoveredGuide; provenance: { router: string; assembledFrom: string[] }; alternatives: { id: string; slug: string; title: string; summary?: string; href?: string }[] }
  | { status: "clarify" | "unsupported" | "blocked" | "error"; message: string; alternatives: { id: string; slug: string; title: string; summary?: string; href?: string }[]; officialSearchUrl?: string };

const examples = [
  "How do I renew my passport?",
  "I need a driver's license in a new state",
  "How do I register to vote?",
  "How do I check the rules for my property?"
];

export function GuideSearch() {
  const [state, setState] = useState("");
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
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
        body: JSON.stringify({ message: clean, state: state || undefined, placeIds: placeIds.length ? placeIds : undefined, history: [] })
      });
      const data = (await response.json()) as ApiResponse;
      if (version!==requestVersion.current) return;
      if (!Array.isArray(data.alternatives)) data.alternatives=[];
      setResult(data);
      window.setTimeout(() => resultRef.current?.focus(), 50);
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
        <label htmlFor="goal">What do you need to do?</label>
        <div className="guide-search__control">
          <textarea id="goal" name="goal" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the situation in your own words" rows={2} maxLength={600} />
          <button type="submit" disabled={loading || message.trim().length < 3} aria-label={loading ? "Finding guidance" : "Find guidance"}><ArrowIcon /></button>
        </div>
        <p className="privacy-note">Do not include Social Security, account, passport, or license numbers.</p>
        <div className="location-fields search-location">
          <label htmlFor="search-state">Where should we look?<select id="search-state" value={state} onChange={(event) => { setState(event.target.value); setPlaceIds([]); setLocationLabel(""); resetLocation(); }}><option value="">Choose a state when needed</option>{states.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        </div>
        <LocationPicker key={state} state={state} onChange={(ids, label, code) => { setPlaceIds(ids); setLocationLabel(label); if (code) setState(code); resetLocation(); }} />
        {locationLabel && <p className="selected-location">Selected area: {locationLabel}</p>}
      </form>

      {!submitted && (
        <div className="examples" aria-label="Example requests">
          <span>Try an example</span>
          <div>
            {examples.map((example) => <button type="button" key={example} onClick={() => { setMessage(example); void run(example); }}>{example}</button>)}
          </div>
        </div>
      )}

      <div className="answer-region" aria-live="polite" aria-busy={loading} ref={resultRef} tabIndex={-1}>
        {loading && <SearchSkeleton query={submitted} />}
        {result?.status === "matched" && (
          <>
            <div className="query-line"><span>You asked</span><p>{submitted}</p></div>
            <GuideResult journey={result.journey} />
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
        {result?.status === "coverage_gap" && <section className="pathway-gap"><p className="section-label">{result.title ?? "Find the rules for your property"}</p><h2>Start with the right records.</h2><p>{result.message}</p><ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>{result.scopeNote}</p>{result.sources.length > 0 && <ul>{result.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.publisher}</a></li>)}</ul>}{Boolean(result.directoryResources?.length) && <div><h3>Official local starting points</h3><p>These websites match the registered government organization. The procedure and service area still need confirmation.</p><ul>{result.directoryResources?.map(resource=><li key={resource.id}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title} · {resource.placeName}</a><span> · {resource.kind==="indexed_page" ? "Crawled "+resource.retrievedAt.slice(0,10)+"; instructions unreviewed" : "Official registration; procedure unreviewed"}</span>{["unavailable","blocked"].includes(resource.lastCheckStatus) && <span> · Latest automated crawl unavailable</span>}</li>)}</ul></div>}</section>}
        {result && result.status !== "matched" && result.status !== "discovered" && result.status !== "coverage_gap" && (
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
  return (
    <div className="search-loading" role="status">
      <div className="query-line"><span>You asked</span><p>{query}</p></div>
      <div className="skeleton-card">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--title" />
        <span className="skeleton" />
        <span className="skeleton skeleton--wide" />
        <div className="skeleton-steps"><i /><i /><i /></div>
      </div>
      <span className="sr-only">Searching published government guides</span>
    </div>
  );
}
