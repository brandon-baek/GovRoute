import type { LocalActions } from "./local-evidence";
import type { CensusMatch } from "./place-context";

export type AddressFinding = {
  id: string; label: string; status: "matched" | "no_match" | "unavailable" | "ambiguous";
  values: Record<string, string>; candidates?: { id: string; label: string }[]; source: string; publisher: string; checkedAt: string; note: string;
};
export type AddressGuide = {
  id: string; title: string; why: string;
  steps: { title: string; detail: string; url: string }[];
};
export type AddressWorkspace = {
  localActions?: LocalActions; checkedAt: string; precision: "address_range"; findings: AddressFinding[]; guides: AddressGuide[]; limitations: string[];
};
// Audited connector endpoints, never visitor-controlled URLs.
export const addressLayers = {
  flood: { url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28", fields: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF"], publisher: "FEMA", label: "Mapped flood zone" },
  parcel: { url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0", fields: ["AIN", "APN", "UseDescription"], publisher: "Los Angeles County", label: "Candidate assessor parcel" },
  zoning: { url: "https://arcgis.gis.lacounty.gov/arcgis/rest/services/DRP/GISNET_Public/MapServer/346", fields: ["ZONE", "Z_DESC", "PLNG_AREA", "TITLE_22"], publisher: "Los Angeles County Planning", label: "Mapped zoning at the address point" }
} as const;

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("Map service unavailable");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
    if (bytes > 512 * 1024) { await reader.cancel(); throw new Error("Map response too large"); }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export async function pointFinding(id: keyof typeof addressLayers, match: CensusMatch, fetcher: typeof fetch = fetch, polygon?: { rings: number[][][] }): Promise<AddressFinding> {
  const layer = addressLayers[id];
  const base = { id, label: layer.label, values: {}, source: layer.url, publisher: layer.publisher, checkedAt: new Date().toISOString() };
  const { x, y } = match.coordinates;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) throw new Error("Invalid coordinates");
  try {
    const response = await fetcher(layer.url + "/query", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7000),
      body: new URLSearchParams({ f: "json", where: "1=1", geometry: polygon ? JSON.stringify(polygon) : x + "," + y, geometryType: polygon ? "esriGeometryPolygon" : "esriGeometryPoint", inSR: "4326",
        spatialRel: "esriSpatialRelIntersects", outFields: layer.fields.join(","), returnGeometry: "false", resultRecordCount: "5" })
    });
    const data = await boundedJson(response);
    if (!isRecord(data) || data.error || data.exceededTransferLimit || !Array.isArray(data.features)) throw new Error("Incomplete map response");
    if (!data.features.length) return { ...base, status: "no_match", note: "No polygon returned at this interpolated point. This does not establish absence of a hazard, parcel, or rule." };
    const candidates: Record<string, string>[] = data.features.map((feature: unknown) => {
      if (!isRecord(feature) || !isRecord(feature.attributes)) throw new Error("Invalid map attributes");
      const attributes = feature.attributes;
      const result: Record<string, string> = {};
      for (const field of layer.fields) {
        const value = attributes[field];
        if (typeof value === "string" && value.trim()) result[field] = value.trim().slice(0, 240);
      }
      const required = id === "flood" ? ["FLD_ZONE"] : id === "zoning" ? ["ZONE"] : ["AIN", "APN"];
      if (!required.some(key => result[key])) throw new Error("Missing expected map fields");
      return result;
    });
    const distinct = [...new Map(candidates.map(c => [JSON.stringify(c), c])).values()];
    if (distinct.length !== 1) return { ...base, status: "ambiguous", note: "Multiple map records intersect the point. Confirm the location in the official map; no record was selected." };
    return { ...base, status: "matched", values: distinct[0], note: polygon ? "Official map intersection with the candidate parcel polygon. Confirm the parcel identity; overlapping zones are not resolved automatically." : "Live official map intersection at an address-range point. Confirm the actual parcel and boundaries before acting." };
  } catch {
    return { ...base, status: "unavailable", note: "The official map service could not be read. No conclusion was inferred; use the official lookup below." };
  }
}

function normalizedStreet(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9 -]/g, " ").replace(/\bBOULEVARD\b/g,"BLVD").replace(/\bAVENUE\b/g,"AVE").replace(/\bSTREET\b/g,"ST").replace(/\bROAD\b/g,"RD").replace(/\bDRIVE\b/g,"DR").replace(/\bLANE\b/g,"LN").replace(/\s+/g," ").trim();
}
export async function parcelByAddress(match: CensusMatch, fetcher: typeof fetch = fetch, selectedParcel?: string): Promise<{ finding: AddressFinding; polygon?: { rings: number[][][] } }> {
  const layer=addressLayers.parcel;
  const base={id:"parcel",label:"Candidate assessor parcel",values:{},source:layer.url,publisher:layer.publisher,checkedAt:new Date().toISOString()};
  const street=normalizedStreet(match.matchedAddress.split(",")[0]);
  if(!/^[0-9][A-Z0-9 -]{4,120}$/.test(street)) return {finding:{...base,status:"no_match",note:"The street address could not be matched conservatively to assessor records. Use the official parcel lookup."}};
  if(selectedParcel && !/^[0-9]{10}$/.test(selectedParcel))throw new Error("Invalid parcel ID");
  try {
    // Only a bounded, normalized Census street is used; no raw SQL or URL comes from the visitor.
    // Situs may include a city/ZIP, so compare a prefix and validate each returned street again.
    const response=await fetcher(layer.url+"/query",{
      method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000),
      body:new URLSearchParams({f:"json",where:selectedParcel?"AIN='"+selectedParcel+"'":"UPPER(SitusFullAddress) LIKE '"+street+"%'",outFields:"AIN,APN,SitusFullAddress,SitusAddress",returnGeometry:"true",outSR:"4326",resultRecordCount:"10",
        ...(selectedParcel?{geometry:match.coordinates.x+","+match.coordinates.y,geometryType:"esriGeometryPoint",inSR:"4326",spatialRel:"esriSpatialRelIntersects",distance:"150",units:"esriSRUnit_Meter"}:{})})
    });
    const data=await boundedJson(response);
    if(!isRecord(data)||data.error||data.exceededTransferLimit||!Array.isArray(data.features))throw new Error();
    const candidates=data.features.filter((f:unknown)=>{
      if(!isRecord(f)||!isRecord(f.attributes))throw new Error();
      if(selectedParcel)return f.attributes.AIN===selectedParcel;
      if(typeof f.attributes.SitusFullAddress!=="string")return false;
      const candidate=normalizedStreet(f.attributes.SitusFullAddress);
      return Boolean(selectedParcel) || candidate===street||candidate.startsWith(street+" ");
    }) as {attributes:Record<string,unknown>;geometry?:{rings?:unknown}}[];
    if(!candidates.length && !selectedParcel) return nearbyParcels(match,fetcher);
    if(!candidates.length)return {finding:{...base,status:"no_match",note:"That parcel was not found within 150 meters of the matched address. Select a nearby candidate again."}};
    const keyed=new Map<string,typeof candidates[number]>();
    for(const f of candidates) {
      const id=typeof f.attributes.AIN==="string"?f.attributes.AIN:typeof f.attributes.APN==="string"?f.attributes.APN:null;
      if(!id||!/^[0-9-]{5,20}$/.test(id))throw new Error();
      keyed.set(id,f);
    }
    if(keyed.size!==1)return {finding:{...base,status:"ambiguous",note:"This street address matches multiple assessor parcels. Select the actual property in the official map; none was chosen automatically."}};
    const feature=[...keyed.values()][0];const values:Record<string,string>={};
    for(const key of ["AIN","APN"])if(typeof feature.attributes[key]==="string")values[key]=String(feature.attributes[key]).slice(0,30);
    const raw=feature.geometry?.rings;
    const valid=Array.isArray(raw)&&raw.length>0&&raw.length<=100&&raw.every(r=>Array.isArray(r)&&r.length>=4&&r.length<=10000&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90));
    return {finding:{...base,status:"matched",values,note:selectedParcel?"You selected this nearby assessor parcel. Confirm the identity against your records; ownership has not been established.":"One assessor parcel matched the Census street address. Confirm it against your records; unit-level identity and ownership have not been established."},polygon:valid?{rings:raw as number[][][]}:undefined};
  }catch{return {finding:{...base,status:"unavailable",note:"The assessor address lookup was unavailable or incomplete. Use the official parcel lookup; no parcel was inferred."}};}
}

export async function nearbyParcels(match:CensusMatch,fetcher:typeof fetch=fetch):Promise<{finding:AddressFinding}> {
  const layer=addressLayers.parcel;
  const base={id:"parcel",label:"Choose the property",values:{},source:layer.url,publisher:layer.publisher,checkedAt:new Date().toISOString()};
  try {
    const response=await fetcher(layer.url+"/query",{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000),body:new URLSearchParams({f:"json",where:"1=1",geometry:match.coordinates.x+","+match.coordinates.y,geometryType:"esriGeometryPoint",inSR:"4326",spatialRel:"esriSpatialRelIntersects",distance:"75",units:"esriSRUnit_Meter",outFields:"AIN,APN,SitusAddress",returnGeometry:"false",resultRecordCount:"10"})});
    const data=await boundedJson(response);
    if(!isRecord(data)||data.error||!Array.isArray(data.features))throw new Error();
    const candidates:{id:string;label:string}[]=[];
    for(const feature of data.features){if(!isRecord(feature)||!isRecord(feature.attributes))continue;const a=feature.attributes;
      if(typeof a.AIN!=="string"||!/^[0-9]{10}$/.test(a.AIN))continue;
      candidates.push({id:a.AIN,label:(typeof a.SitusAddress==="string"?a.SitusAddress+" · ":"")+"Parcel "+String(a.APN??a.AIN)});
    }
    return {finding:{...base,status:candidates.length?"ambiguous":"no_match",candidates:[...new Map(candidates.map(c=>[c.id,c])).values()],note:candidates.length?"The assessor may use a different address. Choose your property from these nearby parcels only if its identity matches your records. No nearest parcel was selected automatically.":"No nearby assessor parcel was returned. Use the official assessor lookup."}};
  }catch{return {finding:{...base,status:"unavailable",note:"Nearby parcel lookup is temporarily unavailable. No parcel was inferred."}};}
}

export function addressGeographies(match: CensusMatch): AddressFinding[] {
  return Object.entries(match.geographies).filter(([layer]) => /school district|counties|incorporated places/i.test(layer))
    .flatMap(([layer, rows]) => rows.filter(r => typeof r.NAME === "string" && typeof r.GEOID === "string").map(r => ({
      id: "census:" + layer + ":" + r.GEOID, label: layer, status: "matched" as const,
      values: { name: r.NAME!, GEOID: r.GEOID! }, source: "https://geocoding.geo.census.gov/geocoder/", publisher: "US Census Bureau", checkedAt: new Date().toISOString(),
      note: /school/i.test(layer) ? "District geography, not an assigned school or enrollment eligibility determination." : "Address-range geographic context; service responsibility must be checked by task."
    })));
}
export function assembleAddressGuides(findings: AddressFinding[]): AddressGuide[] {
  const flood = findings.find(f => f.id === "flood");
  const parcel = findings.find(f => f.id === "parcel");
  const zoning = findings.find(f => f.id === "zoning");
  const schools = findings.filter(f => /school district/i.test(f.label));
  const guides: AddressGuide[] = [];
  if (parcel || zoning) guides.push({
    id: "property", title: "Prepare a property or building inquiry for this address",
    why: zoning?.status === "matched" ? "The county map returned zone " + zoning.values.ZONE + (zoning.values.PLNG_AREA ? " in " + zoning.values.PLNG_AREA : "") + ". Confirm it against your parcel before choosing an application."
      : "This address is in Los Angeles County. Resolve the parcel and planning jurisdiction before starting a project.",
    steps: [
      { title: "Confirm the actual parcel", detail: parcel?.status === "matched"
          ? "The lookup returned candidate parcel " + (parcel.values.APN ?? parcel.values.AIN) + ". Compare it with property records: a street interpolation may land on a neighboring parcel or road."
          : "No single parcel was confirmed by the map lookup. Search the official map by the street address, then compare with property records.",
        url: "https://portal.assessor.lacounty.gov/" },
      { title: "Confirm zoning and the responsible planning office", detail: zoning?.status === "matched"
          ? "Ask the planning office to confirm " + zoning.values.ZONE + (zoning.values.Z_DESC ? " (" + zoning.values.Z_DESC + ")" : "") + ", overlays, setbacks, and requirements for the proposed work. County planning serves unincorporated areas; incorporated cities use their city planning office."
          : "Check whether the parcel is inside a city or unincorporated county territory. Use that jurisdiction's planning office and map; a missing county zone is not an exemption.",
        url: zoning?.status === "matched" && zoning.values.TITLE_22 && /^[A-Z0-9_]+$/i.test(zoning.values.TITLE_22) ? "https://library.municode.com/ca/los_angeles_county/codes/code_of_ordinances?nodeId=TIT22PLZO_"+encodeURIComponent(zoning.values.TITLE_22) : "https://planning.lacounty.gov/how-do-i/find-my-zoning/" },
      { title: "Prepare your project review", detail: "Bring the confirmed parcel number, proposed-work description and sketch, and zoning findings. Ask which planning approvals and building permits are required before filing or paying. This report does not establish that an ADU, fence, addition, or business use is permitted.",
        url: "https://planning.lacounty.gov/" }
    ]
  });
  if (flood) {
    const mapped = flood.status === "matched";
    const high = mapped && (flood.values.SFHA_TF === "T" || /^[AV]/.test(flood.values.FLD_ZONE ?? ""));
    guides.push({ id: "flood", title: high ? "Check floodplain requirements before building or buying" : "Check the official flood map for this address",
      why: mapped ? "FEMA returned zone " + flood.values.FLD_ZONE + (flood.values.ZONE_SUBTY ? ": " + flood.values.ZONE_SUBTY : "") + ". " + (high ? "The mapped point indicates a special flood hazard area." : "This is a screening result, not a statement that the property cannot flood.")
        : "The automated check did not establish one flood zone. An empty or failed response is not a low-risk result.",
      steps: [
        { title: "Locate the building on the effective map", detail: "Search the exact address in FEMA's Flood Map Service Center. Check the building footprint and effective map date; the address-range point may be on the road rather than the structure. Review applicable map amendments or revisions.",
          url: "https://msc.fema.gov/portal/home" },
        { title: high ? "Contact the local floodplain administrator" : "Confirm local floodplain rules",
          detail: high ? "Ask the city or county floodplain administrator about development permits, elevation requirements, and documentation for the proposed work. Ask your lender or insurer whether flood insurance is required for your situation."
            : "Ask the city or county about floodplain development requirements and additional local hazards. A zone X result does not mean zero flood risk or that no local rules apply.",
          url: "https://www.fema.gov/flood-maps" }
      ]
    });
  }
  if (schools.length) guides.push({ id: "schools", title: "Find enrollment instructions for the district at this address",
    why: schools.map(f => f.values.name).join("; "), steps: [
      { title: "Confirm the district and attendance boundary", detail: "Use the named district's official address locator or enrollment office. Elementary, secondary, and unified districts may overlap. District membership does not identify an assigned campus or guarantee enrollment.",
        url: "https://nces.ed.gov/ccd/districtsearch/" },
      { title: "Get the district's enrollment checklist", detail: "Ask the confirmed district which school serves your grade and address, what residence and student records to prepare, and how to apply. Submit personal records only through the district's official channel.",
        url: "https://nces.ed.gov/ccd/districtsearch/" }
    ]
  });
  return guides;
}
export async function buildAddressWorkspace(match: CensusMatch, fetcher: typeof fetch = fetch, selectedParcel?: string): Promise<AddressWorkspace> {
  const inLA = Object.entries(match.geographies).some(([layer, rows]) => /counties/i.test(layer) && rows.some(r => r.GEOID === "06037"));
  const floodPromise=pointFinding("flood",match,fetcher);
  const local:AddressFinding[]=[];
  if(inLA) {
    const parcel=await parcelByAddress(match,fetcher,selectedParcel);
    local.push(parcel.finding);
    local.push(parcel.finding.status==="matched"&&!parcel.polygon?{id:"zoning",label:addressLayers.zoning.label,source:addressLayers.zoning.url,publisher:addressLayers.zoning.publisher,checkedAt:new Date().toISOString(),status:"unavailable",values:{},note:"The selected parcel has no usable polygon. Zoning was not inferred from a different street point."}:await pointFinding("zoning",match,fetcher,parcel.polygon));
  }
  const findings=[...addressGeographies(match),await floodPromise,...local];
  return { checkedAt: new Date().toISOString(), precision: "address_range", findings, guides: assembleAddressGuides(findings), limitations: [
    "Census interpolates along an address range. This is not a rooftop, parcel survey, ownership check, or legal determination.",
    "Point-specific zoning and parcel adapters currently cover Los Angeles County. FEMA screening is attempted nationally; official data and service availability vary.",
    "Map findings are machine-retrieved screening evidence. No permission, fee, deadline, school assignment, or absence of risk is inferred from them."
  ] };
}

