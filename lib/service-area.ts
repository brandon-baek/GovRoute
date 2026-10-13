import type { PlaceContext } from "@/lib/place-registry";
import type { Journey } from "@/lib/schema";

export function fitsServiceArea(journey: Journey, context?: PlaceContext, selectedIds: string[] = []) {
  if (journey.serviceArea !== "unincorporated") return true;
  if (!context || context.places.some(p => p.kind === "municipality" && p.government_status === "active") || context.places.some(p => p.kind === "tribal_area")) return false;
  // Explicit county selection alone cannot certify unincorporated territory.
  return context.places.some(p => p.kind === "cdp" && p.government_status === "none" && selectedIds.includes(p.id)
    && (context.relations.some(r=>r.child_id===p.id && r.relation==="contained_by" && journey.territoryIds?.includes(r.parent_id))
      || (context.precision==="address_range" && context.places.some(area=>area.kind==="county" && journey.territoryIds?.includes(area.id)))));
}
