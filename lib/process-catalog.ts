import { z } from "zod";
import manifest from "@/data/registry/processes.json";
import { journeySchema, type Journey } from "@/lib/schema";
import { withSourceFreshness } from "@/lib/source-freshness";

export const processPublicationSchema = z.object({
  authority_id: z.string().min(1),
  topic: z.string().min(1),
  territory: z.union([z.object({ id: z.string().min(1) }), z.object({ state_code: z.string().regex(/^[A-Z]{2}$/) }), z.object({geoid:z.string().regex(/^[0-9]{2,12}$/),kind:z.string().min(1)})]),
  journey: journeySchema
});

export const processPublications = z.array(processPublicationSchema).parse(manifest.processes);
export const processJourneys = processPublications.map((item) => withSourceFreshness(item.journey));

export function mergeProcessJourneys(records: Journey[]): Journey[] {
  const published = new Map(records.map((journey) => [journey.id, journey]));
  // Deploying a reviewed process updates both the bundled and older SQL catalog.
  for (const journey of processJourneys) published.set(journey.id, journey);
  return [...published.values()].map(journey=>withSourceFreshness(journey));
}

export function bundledProcessesForState(state?: string): Journey[] {
  return processPublications.filter(item=>{
    if(item.journey.jurisdiction==="local") return false;
    if("id" in item.territory && item.territory.id==="country:US") return item.journey.jurisdiction==="federal";
    if("state_code" in item.territory) return item.territory.state_code===state?.toUpperCase();
    return item.journey.jurisdiction==="state" && item.journey.state===state?.toUpperCase();
  }).map(item=>withSourceFreshness(item.journey));
}
