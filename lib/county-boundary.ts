// Whole-boundary containment, never a ZIP, mailing name, or centroid crosswalk.
export const censusService = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";
type FeatureSet = { error?: unknown; exceededTransferLimit?: boolean; features?: { attributes: { GEOID?: string }; geometry?: { rings: number[][][]; spatialReference?: { wkid: number } } }[] };

async function query(layer: string, parameters: Record<string, string>, fetcher: typeof fetch) {
  if (!new RegExp("^" + censusService.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/[0-9]+$").test(layer)) throw new Error("Untrusted Census layer");
  const response = await fetcher(layer + "/query", { method: "POST", body: new URLSearchParams({ f: "json", ...parameters }), signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Census boundary service unavailable");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length;
    if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Boundary response too large"); } chunks.push(part.value); }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as FeatureSet;
  if (data.error || data.exceededTransferLimit || !Array.isArray(data.features)) throw new Error("Incomplete Census boundary response");
  return data.features;
}

export async function containingCounty(placeLayer: string, countyLayer: string, geoid: string, fetcher: typeof fetch = fetch) {
  if (!/^[0-9]{7}$/.test(geoid)) throw new Error("Invalid place GEOID");
  const features = await query(placeLayer, { where: `GEOID='${geoid}'`, outFields: "GEOID", returnGeometry: "true", outSR: "4326" }, fetcher);
  if (features.length !== 1 || features[0].attributes.GEOID !== geoid) throw new Error("Ambiguous community boundary");
  const polygon = features[0].geometry;
  if (!polygon?.rings?.length || polygon.rings.some(ring => !Array.isArray(ring) || ring.length < 4 || ring.some(point => point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90))) throw new Error("Invalid community polygon");
  // ArcGIS applies this relationship to the input polygon: the community must
  // be WITHIN a county feature. CONTAINS asks for counties inside the community.
  const counties = await query(countyLayer, { where: "1=1", geometry: JSON.stringify(polygon), geometryType: "esriGeometryPolygon", inSR: "4326", spatialRel: "esriSpatialRelWithin", outFields: "GEOID", returnGeometry: "false" }, fetcher);
  // Spanning more than one county must be resolved with an address instead.
  if (counties.length !== 1 || !/^[0-9]{5}$/.test(counties[0].attributes.GEOID ?? "") || !counties[0].attributes.GEOID!.startsWith(geoid.slice(0, 2))) return null;
  return counties[0].attributes.GEOID!;
}
