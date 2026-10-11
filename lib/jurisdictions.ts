import { states } from "@/data/curated/states";

export { states };
export function stateByCode(code?: string) {
  return states.find((state) => state.code === code?.toUpperCase());
}

export function statesInText(text: string) {
  // Short abbreviations must be uppercase: ordinary words like "in" and "or"
  // are not Indiana and Oregon.
  return states.filter((state) => new RegExp(`\\b${state.name}\\b`, "i").test(text)
    || new RegExp(`\\b${state.code}\\b`).test(text));
}

export type LocationGuide = { jurisdiction: string; state?: string; locality?: string; publisher?: string; territoryIds?: string[] };
export function jurisdictionLabel(guide: LocationGuide) {
  return [guide.locality, stateByCode(guide.state)?.name ?? (guide.jurisdiction === "california" ? "California" : undefined)]
    .filter(Boolean).join(", ") || (guide.jurisdiction === "federal" ? "Federal" : guide.publisher ?? "Location not confirmed");
}

export function matchesLocation(guide: LocationGuide, state?: string, locality?: string, placeIds: string[] = []) {
  if (guide.jurisdiction === "local" && guide.territoryIds?.length) {
    return (!state || !guide.state || guide.state === state.toUpperCase()) && guide.territoryIds.some(id=>placeIds.includes(id));
  }
  if (!state) return true;
  if (guide.jurisdiction === "federal") return true;
  const guideState = guide.state ?? (["california", "federal-and-state"].includes(guide.jurisdiction) ? "CA" : undefined);
  if (guideState !== state.toUpperCase()) return false;
  // Do not treat a town's guide as a statewide service.
  if (guide.jurisdiction === "local") return Boolean(locality?.trim())
    && guide.locality?.toLowerCase() === locality?.trim().toLowerCase();
  return true;
}
