"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { restoreChecklist, toggleStep } from "@/lib/checklist";
import type { Journey } from "@/lib/schema";
import { jurisdictionLabel } from "@/lib/jurisdictions";
import { CheckIcon, ExternalIcon } from "@/components/icons";

export function GuideResult({ journey, compact = false }: { journey: Journey; compact?: boolean }) {
  const [completed,setCompleted]=useState<string[]>([]);
  const [loadedKey,setLoadedKey]=useState("");
  const storageKey=`govroute-progress:${journey.id}:${journey.reviewedAt}`;
  useEffect(()=>{let saved:unknown=[];try {saved=JSON.parse(localStorage.getItem(storageKey)??"[]");} catch {} setCompleted(restoreChecklist(journey.steps,saved));setLoadedKey(storageKey);},[storageKey,journey.steps]);
  useEffect(()=>{if(loadedKey===storageKey) try {localStorage.setItem(storageKey,JSON.stringify(completed));} catch {}},[completed,loadedKey,storageKey]);
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${journey.reviewedAt}T00:00:00Z`));
  return (
    <article className={compact ? "guide-result guide-result--compact" : "guide-result"}>
      <header className="guide-result__header">
        <div>
          <p className="eyebrow">{journey.category} · {jurisdictionLabel(journey)}</p>
          <h2>{journey.title}</h2>
          <p className="guide-summary">{journey.summary}</p>
        </div>
        <div className="verified-stamp"><CheckIcon /> {journey.reviewStatus === "review-due" ? "Review due · Last checked" : "Sources checked"} {formatted}</div>
      </header>

      {journey.coverageLevel==="official-handoff" && <div className="coverage-label"><strong>Official starting route</strong><p>The receiving agency still needs to confirm its local requirements. This checklist is a handoff, with source-checked navigation steps.</p></div>}
      {journey.scopeNote && <p className="scope-note">{journey.scopeNote}</p>}
      {!compact && <div className="checklist-progress"><div><strong>{completed.length} of {journey.steps.length} steps complete</strong><span>Progress stays in this browser. No address or identification numbers are saved.</span></div><progress value={completed.length} max={journey.steps.length} aria-label="Checklist progress" /><button type="button" onClick={()=>window.print()}>Print checklist</button></div>}

      {journey.eligibility?.length ? <details className="process-eligibility"><summary>Does this route fit my situation?</summary>{journey.eligibility.map((item) => <p key={item}>{item}</p>)}</details> : null}

      <ol className="steps-list">
        {journey.steps.map((step, index) => (
          <li key={step.id} className={completed.includes(step.id)?"step-complete":""}>
            <span className="step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.title}</h3>
              {!compact && <label className="step-completion"><input type="checkbox" checked={completed.includes(step.id)} disabled={!completed.includes(step.id) && Boolean(step.dependsOn?.some(id=>!completed.includes(id)))} onChange={()=>setCompleted(old=>toggleStep(journey.steps,old,step.id))} />{completed.includes(step.id)?"Completed":"Mark complete"}</label>}
              {step.dependsOn?.length ? <p className="step-dependencies">First: {step.dependsOn.map(id=>journey.steps.find(item=>item.id===id)?.title??id).join("; ")}</p> : null}
              <p>{step.detail}</p>
              <dl className="step-facts">
                {([['Prepare', step.requirements], ['Cost', step.fees], ['Timing', step.deadlines]] as const).map(([label, items]) => items?.length ? <div key={label}><dt>{label}</dt><dd>{items.map((item) => <p key={item}>{item}</p>)}</dd></div> : null)}
              </dl>
              {step.caution && <p className="caution"><strong>Important:</strong> {step.caution}</p>}
              {step.action && <a className="text-action" href={step.action.url} target="_blank" rel="noreferrer">{step.action.label}<ExternalIcon /></a>}
              <div className="step-citations"><span>Sources for this step</span>{step.sourceIds.map((id) => journey.sources.find((source) => source.id === id)).filter((source) => source !== undefined).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="source-block">
        <div className="source-block__heading">
          <h3>Official sources</h3>
          <span>{journey.sources.length} source{journey.sources.length === 1 ? "" : "s"}</span>
        </div>
        <ul>
          {journey.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer"><span>{source.title}<small>{source.publisher}</small></span><ExternalIcon /></a>
            </li>
          ))}
        </ul>
      </div>

      {!compact && (
        <div className="result-actions">
          {journey.officialAction && <a className="primary-action" href={journey.officialAction.url} target="_blank" rel="noreferrer">{journey.officialAction.label}<ExternalIcon /></a>}
          <Link className="quiet-action" href={`/guides/${journey.slug}`}>Open permanent guide</Link>
        </div>
      )}
    </article>
  );
}
