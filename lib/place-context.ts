// Pure functions shared by address resolution and its regression tests.
export type Geography = { GEOID?: string; NAME?: string; BASENAME?: string; STUSAB?: string };
export type CensusMatch = {
  matchedAddress: string;
  coordinates: { x: number; y: number };
  geographies: Record<string, Geography[]>;
};

export function censusMatches(value: unknown): CensusMatch[] {
  if (!value || typeof value !== "object") throw new Error("Invalid geocoder response");
  const result = (value as { result?: { addressMatches?: unknown } }).result;
  if (!Array.isArray(result?.addressMatches)) throw new Error("Missing geocoder matches");
  return result.addressMatches.map((item: CensusMatch) => {
    if (typeof item.matchedAddress !== "string" || !Number.isFinite(item.coordinates?.x) || !Number.isFinite(item.coordinates?.y)
      || Math.abs(item.coordinates.x) > 180 || Math.abs(item.coordinates.y) > 90 || !item.geographies || typeof item.geographies !== "object") {
      throw new Error("Invalid geocoder match");
    }
    for (const rows of Object.values(item.geographies)) {
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object")) throw new Error("Invalid geography collection");
    }
    return item;
  });
}

export function geographyReferences(match: CensusMatch) {
  return Object.entries(match.geographies).flatMap(([layer, rows]) => rows
    .filter((row) => typeof row.GEOID === "string")
    .map((row) => ({ layer, geoid: row.GEOID!, name: row.NAME ?? row.BASENAME ?? row.GEOID! })));
}

export function requiresParcelEvidence(query: string) {
  if (/\b(land|parcel|zoning|easement|setback|deed|covenant|fence|adu|boundary)\b/i.test(query)) return true;
  // Reporting damaged public objects does not ask for parcel or ownership rights.
  const serviceReport = /\breport\b/i.test(query) && /\b(damag(?:e|ed)|broken)\b/i.test(query);
  const propertyQuery = serviceReport ? query.replace(/\bpublic property\b/gi, "") : query;
  return /\bproperty\b/i.test(propertyQuery);
}

export const parcelRequirements = [
  "Confirm the parcel and property boundary with the local assessor or cadastral record.",
  "Check the zoning map, overlays, and current rules with the planning authority.",
  "Check recorded deeds, easements, and covenants through the recorder or registry of deeds."
];
