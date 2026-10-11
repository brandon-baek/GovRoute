"use client";
import { useState } from "react";
import { states } from "@/lib/jurisdictions";
import { buildMovePlan } from "@/lib/moving";

export function MovingPlanner() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vehicle, setVehicle] = useState(true);
  const [completed, setCompleted] = useState<string[]>([]);
  const plan = buildMovePlan(from, to, vehicle);
  function changeLocation(setter: (value: string) => void, value: string) { setter(value); setCompleted([]); }
  return <div className="moving-workspace">
    <section className="planner-controls" aria-label="Move details">
      <div className="location-fields">
        <label>Moving from<select value={from} onChange={(event) => changeLocation(setFrom, event.target.value)}><option value="">Choose origin</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
        <label>Moving to<select value={to} onChange={(event) => changeLocation(setTo, event.target.value)}><option value="">Choose destination</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
      </div>
      <label className="vehicle-toggle"><input type="checkbox" checked={vehicle} onChange={(event) => { setVehicle(event.target.checked); setCompleted([]); }} /> I’m bringing a vehicle</label>
      <p>Choose two states to combine departure and arrival tasks. Progress stays on this page until you leave or reload.</p>
    </section>
    {!plan && <div className="planner-empty" role="status"><h2>{from && from === to ? "Choose two different states" : "Two jurisdictions. One checklist."}</h2><p>Start with where you live now and where you’re going. The checklist will show which agency handles each task.</p><button type="button" className="primary-action" onClick={() => { setFrom("NY"); setTo("TX"); setCompleted([]); }}>Try New York to Texas</button></div>}
    {plan && <section className="move-results" aria-live="polite">
      <header className="move-heading"><div><p className="eyebrow">Interstate driving and vehicle checklist</p><h2>{plan.title}</h2></div><span>{completed.length} of {plan.steps.length} checked</span></header>
      <p className="coverage-note">{plan.detailed ? `${plan.reviewDue ? "Review due. " : ""}Destination instructions last checked ${plan.reviewedAt}. This checklist covers ordinary personal driving and vehicle moves; confirm exceptions and current rules with each agency. Departure requirements need confirmation unless explicitly sourced below.` : "Coverage is limited for this destination. These are planning questions and official directories, not a verified state-specific sequence. Exact requirements and deadlines need agency confirmation."}</p>
      <ol className="move-steps">{plan.steps.map((step, index) => <li key={step.id} data-complete={completed.includes(step.id)}>
        <label className="step-check"><input type="checkbox" aria-label={`Mark complete: ${step.title}`} checked={completed.includes(step.id)} onChange={(event) => setCompleted((current) => event.target.checked ? [...current, step.id] : current.filter((id) => id !== step.id))} /><span>{String(index + 1).padStart(2,"0")}</span></label>
        <div><p className="step-jurisdiction">{step.jurisdiction} · {step.checkedAt ? `Source checked ${step.checkedAt}` : "Confirm with agency"}</p><h3>{step.title}</h3>{step.deadline && <p className="deadline">{step.deadline}</p>}<p>{step.detail}</p>{step.dependsOn && <small className="dependency">Review first: {step.dependsOn.map((id) => plan.steps.find((item) => item.id === id)?.title).join("; ")}</small>}<a className="text-action" href={step.url} target="_blank" rel="noreferrer">{step.sourceLabel}</a></div>
      </li>)}</ol>
    </section>}
  </div>;
}
