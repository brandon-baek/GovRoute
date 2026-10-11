import { bundledProcessesForState } from "@/lib/process-catalog";
import { openRegistry } from "@/lib/place-registry";
import { withSourceFreshness } from "@/lib/source-freshness";
import { journeySchema } from "@/lib/schema";

export async function publishedProcesses(state?: string, placeIds: string[] = []) {
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
  return { journeys: rows.map((row) => withSourceFreshness(journeySchema.parse(JSON.parse(row.document_json)))), storage: "registry-process-catalog" as const };
}
