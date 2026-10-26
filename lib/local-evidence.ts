import { openRegistry, type PlaceContext } from "@/lib/place-registry";
import { publicationPlaceIds } from "@/lib/scope-context";
import { publishedProcesses } from "@/lib/process-registry";
import type { Journey } from "@/lib/schema";

export type LocalEvidence = {
  id: string; title: string; url: string; publisher: string; placeName: string;
  topic: string; indexedAt: string; status: "machine-indexed"; contentHash: string;
  excerpts: string[]; warning: string;
};
export type LocalActions = { procedures: Journey[]; evidence: LocalEvidence[]; topics: { id: string; label: string; count: number }[]; unavailable: boolean };
export const localTopics = [
  { id: "building_permit", label: "Building and remodeling", terms: ["building permit", "construction permit", "building safety", "building and safety", "plan check"] },
  { id: "property", label: "Zoning and property", terms: ["zoning", "parcel", "recorded deed", "property records", "accessory dwelling"] },
  { id: "business", label: "Start a local business", terms: ["business license", "business registration", "business permit", "fictitious business"] },
  { id: "waste", label: "Trash and water services", terms: ["trash", "garbage", "water service", "sewer service", "recycling", "bulky item"] },
  { id: "reports", label: "Report a local problem", terms: ["pothole", "illegal dumping", "report a problem", "service request", "311"] },
  { id: "voting", label: "Voting and local records", terms: ["voter registration", "register to vote", "elections", "birth certificate", "vital records"] }
];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
export function topicForPage(title: string, url: string) {
  const text = normalize(title + " " + url);
  return localTopics.filter(t => t.terms.some(term => text.includes(normalize(term))));
}
// Extract verbatim passages from a task-specific page, never synthesize legal requirements.
export function extractLocalPassages(content: string, terms: string[]): string[] {
  const lines = content.split(/\n+/).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length >= 35 && s.length <= 700);
  const seen = new Set<string>();
  return lines.map((line, position) => ({ line, position, score: terms.filter(t => normalize(line).includes(normalize(t))).length * 4 + (/\b(apply|submit|must|required|application|inspection|document|fee|schedule|contact|call|online|appointment)\b/i.test(line) ? 2 : 0) }))
    .filter(row => row.score >= 2 && !/\b(cookie|copyright|privacy policy|all rights reserved|sign up for (?:our )?newsletter)\b/i.test(row.line))
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .filter(row => { const key = normalize(row.line); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 4).sort((a, b) => a.position - b.position).map(row => row.line);
}
export async function addressLocalActions(context: PlaceContext | undefined, task = ""): Promise<LocalActions> {
  const empty: LocalActions = { procedures: [], evidence: [], topics: [], unavailable: false };
  if (!context?.places.length) return { ...empty, unavailable: true };
  const selected = context.places.map(p => p.id);
  const state = context.places.find(p => p.state_code)?.state_code ?? undefined;
  let procedures: Journey[] = [];
  try {
    const catalog = await publishedProcesses(state, publicationPlaceIds(context, selected), context);
    procedures = catalog.journeys.filter(j => j.jurisdiction === "local");
  } catch { empty.unavailable = true; }
  try {
    const db = await openRegistry();
    if (!db || !db.prepare("SELECT 1 FROM sqlite_master WHERE name='directory_pages'").get()) return { ...empty, procedures, unavailable: true };
    // Only governments identified by the verified address context are eligible.
    // A matching city/county registration is directory evidence, not topic competence.
    const ids = context.places.filter(p => ["municipality", "county", "county_subdivision"].includes(p.kind) && p.government_status === "active").map(p => p.id).slice(0, 30);
    if (!ids.length) return { ...empty, procedures };
    const rows = db.prepare(`SELECT p.id,p.title,p.url,p.content,p.sha256,p.retrieved_at,d.domain,d.organization,g.name AS place_name,
      coalesce((SELECT status FROM directory_checks c WHERE c.url=p.url ORDER BY c.id DESC LIMIT 1),'not_checked') AS last_status
      FROM directory_pages p JOIN government_domains d ON p.domain=d.domain JOIN domain_places b ON b.domain=d.domain JOIN places g ON g.id=b.place_id
      WHERE b.place_id IN (${ids.map(() => "?").join(",")}) AND d.match_status='linked'
      ORDER BY p.retrieved_at DESC LIMIT 200`).all(...ids) as { id: number; title: string; url: string; content: string; sha256: string; retrieved_at: string; domain: string; organization: string; place_name: string; last_status: string }[];
    const wanted = normalize(task);
    const requested = localTopics.find(t => t.id === task || t.terms.some(term => wanted.includes(normalize(term))));
    const evidence: LocalEvidence[] = [];
    const used = new Set<string>();
    for (const row of rows) {
      const url = new URL(row.url);
      if (url.protocol !== "https:" || ![row.domain, "www." + row.domain].includes(url.hostname) || used.has(row.url)) continue;
      const topics = topicForPage(row.title, row.url);
      const topic = requested ? topics.find(t => t.id === requested.id) : topics[0];
      if (!topic) continue;
      const excerpts = extractLocalPassages(row.content.slice(0, 150000), topic.terms);
      if (!excerpts.length) continue;
      used.add(row.url);
      const old = !Number.isFinite(Date.parse(row.retrieved_at)) || Date.now() - Date.parse(row.retrieved_at) > 30 * 86400000;
      evidence.push({ id: "local-page:" + row.id, title: row.title, url: row.url, publisher: row.organization, placeName: row.place_name, topic: topic.id, indexedAt: row.retrieved_at,
        contentHash: row.sha256, status: "machine-indexed", excerpts,
        warning: ["Extracted from an official website linked to your address area; the office's responsibility for this task is not yet reviewed.", old ? "The indexed copy is over 30 days old; check the current page." : "Confirm current requirements on the linked page.", ["unavailable", "blocked"].includes(row.last_status) ? "The latest automated refresh failed; this is the previous retained copy." : ""].filter(Boolean).join(" ") });
      if (evidence.length >= 12) break;
    }
    return { procedures, evidence, topics: localTopics.map(t => ({ id: t.id, label: t.label, count: evidence.filter(e => e.topic === t.id).length })), unavailable: empty.unavailable };
  } catch { return { ...empty, procedures, unavailable: true }; }
}

export async function enrichAddressActions(context:PlaceContext|undefined,task=""):Promise<LocalActions> {
  const actions=await addressLocalActions(context,task);
  if(task)try {
    const {liveAddressSources}=await import("@/lib/local-live-sources");
    const requested=localTopics.find(t=>t.id===task||t.terms.some(term=>task.toLowerCase().includes(term)));
    const procedures=requested?actions.procedures.filter(j=>topicForPage(j.title,j.officialAction?.url??"").some(t=>t.id===requested.id)):actions.procedures;
    const seeds=procedures.flatMap(j=>j.sources.map(source=>({url:source.url,publisher:source.publisher,placeName:context?.places.find(p=>p.kind==="county")?.name??"Selected area"}))).filter(s=>{try{return new URL(s.url).hostname.endsWith(".gov");}catch{return false;}});
    const fresh=await liveAddressSources(context,task,seeds);
    const urls=new Set(fresh.map(page=>page.url));actions.evidence=[...fresh,...actions.evidence.filter(page=>!urls.has(page.url))].slice(0,12);
    actions.topics=localTopics.map(t=>({id:t.id,label:t.label,count:actions.evidence.filter(e=>e.topic===t.id).length}));
  }catch{/* Retained indexed evidence and published procedures remain usable. */}
  return actions;
}
