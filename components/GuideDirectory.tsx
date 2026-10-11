"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Journey } from "@/lib/schema";
import type { DiscoveredGuide } from "@/lib/discovered-guides";
import { GUIDE_GROUPS, guideGroupForCategory, type GuideGroupId } from "@/lib/guide-groups";
import { jurisdictionLabel, states } from "@/lib/jurisdictions";
import styles from "./GuideDirectory.module.css";

type Entry = Pick<Journey, "id" | "slug" | "title" | "summary" | "category"> & { jurisdiction: string; state?: string; locality?: string; publisher?: string };
export function GuideDirectory({ guides, discovered, initialGroup = "identity-civic" }: { guides: Journey[]; discovered: DiscoveredGuide[]; initialGroup?: GuideGroupId }) {
  const [active, setActive] = useState<GuideGroupId>(initialGroup);
  const [state, setState] = useState("");
  const [locality, setLocality] = useState("");
  const [query, setQuery] = useState("");
  const [includeFederal, setIncludeFederal] = useState(true);
  const entries = useMemo<Entry[]>(() => [...guides, ...discovered], [guides, discovered]);
  const filtered = entries.filter((entry) => {
    const code = entry.state ?? (["california", "federal-and-state"].includes(entry.jurisdiction) ? "CA" : "");
    if (entry.jurisdiction === "federal") { if (!includeFederal) return false; }
    else if (entry.jurisdiction !== "california" && !["state", "local", "federal-and-state"].includes(entry.jurisdiction)) return false;
    if (state && entry.jurisdiction !== "federal" && code !== state) return false;
    if (locality.trim() && entry.locality && !entry.locality.toLowerCase().includes(locality.trim().toLowerCase())) return false;
    return `${entry.title} ${entry.summary} ${jurisdictionLabel(entry)}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const group = GUIDE_GROUPS.find((item) => item.id === active)!;
  const shown = filtered.filter((entry) => guideGroupForCategory(entry.category) === active).sort((a,b) => a.title.localeCompare(b.title) || jurisdictionLabel(a).localeCompare(jurisdictionLabel(b)));
  return <section className={styles.directory} aria-labelledby="guide-directory-heading">
    <header className={styles.header}><p className={styles.kicker}>Browse by task</p><h2 id="guide-directory-heading">Find your pathway.</h2><p>Reviewed routes and discovered official starting points are labeled separately. Add your location to narrow the results.</p></header>
    <div className="directory-filters">
      <label>State or territory<select value={state} onChange={(event) => setState(event.target.value)}><option value="">All locations</option>{states.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>City or county<input value={locality} onChange={(event) => setLocality(event.target.value)} placeholder="Filter local jurisdictions" /></label>
      <label>Find a task<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="License, records, benefits…" /></label>
      <label className="vehicle-toggle"><input type="checkbox" checked={includeFederal} onChange={(event) => setIncludeFederal(event.target.checked)} /> Include federal guides</label>
    </div>
    <div className={styles.groupGrid}>{GUIDE_GROUPS.map((item) => <button className={styles.groupCard} aria-pressed={active === item.id} data-active={active === item.id} type="button" key={item.id} onClick={() => setActive(item.id)}><span><strong>{item.title}</strong><small>{item.description}</small></span><em>{filtered.filter((entry) => guideGroupForCategory(entry.category) === item.id).length} tasks</em></button>)}</div>
    <section className={styles.taskPanel} aria-live="polite"><div className={styles.taskHeading}><h3>{group.title}</h3><span>{shown.length} guides</span></div>
      {shown.length === 0 && <p>There isn’t a published guide in this category for those filters yet. Try another category or broaden the location. <Link href="/moving">Moving between states?</Link></p>}
      <div className={styles.rows}>{shown.map((entry) => <Link href={`/guides/${entry.slug}`} key={entry.id} className={styles.row}><span className={styles.copy}><strong>{entry.title}</strong><small>{entry.summary}</small><em>{jurisdictionLabel(entry)} · {"reviewStatus" in entry ? "Reviewed route" : "Official starting point"}</em></span></Link>)}</div>
    </section>
  </section>;
}
