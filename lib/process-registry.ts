import { bundledProcessesForState, processPublications } from "@/lib/process-catalog";
import { openRegistry, type PlaceContext } from "@/lib/place-registry";
import { fitsServiceArea } from "@/lib/service-area";
import { withSourceFreshness } from "@/lib/source-freshness";
import { journeySchema } from "@/lib/schema";

export async function publishedProcesses(state?: string, placeIds: string[] = [], context?: PlaceContext) {
  const db = await openRegistry();
  if (!db || !db.prepare("SELECT 1 FROM sqlite_master WHERE name='process_publications'").get()) {
    return { journeys: bundledProcessesForState(state), storage: "bundled-process-catalog" as const };
  }
  const territories = new Set(["country:US", ...placeIds.slice(0, 60)]);
  if (state) {
    const rows = db.prepare("SELECT id FROM places WHERE kind='state' AND state_code=?").all(state) as { id: string }[];
    if (rows.length === 1) territories.add(rows[0].id);
  }
  // Ancestors do not confer topic competence: publications must match both an
  // explicit territory and a reviewed authority/topic service-provider scope.
  const rows = db.prepare(`SELECT DISTINCT pub.document_json FROM process_publications pub
    JOIN process_definitions p ON p.id=pub.process_id
    JOIN authority_scopes s ON s.authority_id=p.authority_id AND s.topic=p.topic
      AND s.territory_id=pub.territory_id AND s.role='service_provider'
    WHERE p.review_status='reviewed' AND pub.territory_id IN (${[...territories].map(() => "?").join(",")})
    ORDER BY p.title`).all(...territories) as { document_json: string }[];
  const current = new Map(rows.map(row => {const journey=journeySchema.parse(JSON.parse(row.document_json));return [journey.id,journey] as const;}));
  // A newly reviewed source manifest can deploy ahead of the next national refresh.
  // Resolve its selectors against the mounted registry, never a name or postal alias.
  for (const item of processPublications) {
    const selector=item.territory;
    let id:string|undefined;
    if ("id" in selector) id=selector.id;
    else if ("state_code" in selector) id=(db.prepare("SELECT id FROM places WHERE kind='state' AND state_code=?").get(selector.state_code) as {id:string}|undefined)?.id;
    else id=(db.prepare("SELECT id FROM places WHERE geoid=? AND kind=?").get(selector.geoid,selector.kind) as {id:string}|undefined)?.id;
    current.delete(item.journey.id);
    if(id && territories.has(id)) current.set(item.journey.id,{...item.journey,territoryIds:item.journey.jurisdiction==="federal"?undefined:[id]});
  }
  return { journeys: [...current.values()].filter(journey=>fitsServiceArea(journey,context,placeIds)).map(journey=>withSourceFreshness(journey)), storage: "registry-process-catalog" as const };
}
