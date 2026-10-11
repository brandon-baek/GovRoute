import type { Metadata } from "next";
import { govGraph } from "@/lib/graph";
import { journeys } from "@/data/curated/journeys";
import { discoveredGuides } from "@/lib/discovered-guides";
import { registryCoverage } from "@/lib/place-registry";
import { processJourneys } from "@/lib/process-catalog";

export const metadata: Metadata = { title: "Data and sourcing" };
export const dynamic = "force-dynamic";

export default async function DataPage() {
  let registry;
  try { registry = await registryCoverage(); } catch { registry = { status: "unavailable", placeCount: 0, sourceCount: 0 }; }
  const agencies = govGraph.nodes.filter((node) => node.kind === "agency").length;
  const sources = govGraph.nodes.filter((node) => node.kind === "source").length;
  return (
    <div className="page-shell shell article-page">
      <header className="page-intro"><p className="eyebrow">Data and sourcing</p><h1>Every guide shows<br />what supports it.</h1><p>The same generated pathway catalog powers browsing, guidance matching, permanent guide pages, and the knowledge graph.</p></header>
      <div className="data-totals" aria-label="Current graph totals"><div><strong>{journeys.length + discoveredGuides.length}</strong><span>total government guides</span></div><div><strong>{sources}</strong><span>official source pages</span></div><div><strong>{agencies}</strong><span>publishers and services</span></div></div>
      <section><h2>Two guide levels</h2><p>{journeys.length} reviewed guides contain ordered steps checked against official sources. {discoveredGuides.length} discovered guides expose official outcomes and destinations immediately while their detailed instructions await review.</p></section>
      <section><h2>Structured pathways</h2><p>{processJourneys.length} reviewed pathways now use the new process model, with documents, fees, timing, dependencies, and citations attached to individual steps. The small publication catalog works without the national place database. Publication review and automated source indexing are separate checks; an unavailable page is never counted as successfully indexed.</p></section>
      <section><h2>Autonomous expansion</h2><p>Twice-monthly jobs advance through federal and state site inventories, preserve earlier discoveries, rank action-oriented pages, generate guide records and graph links, build the site, and publish the new snapshot when every gate passes.</p></section>
      <section><h2>Search-quality gate</h2><p>Every discovered path is browsable. Thin or administrative pages remain out of the XML sitemap and carry a no-index directive until the crawler has enough useful title and summary detail for a worthwhile search result.</p></section>
      <section><h2>Coverage is measurable</h2><p>Government changes too quickly for a truthful claim of permanent completeness. govroute exposes current counts and statuses while the scheduled crawler steadily expands coverage within each site’s robots rules and rate limits.</p></section>
      <section><h2>Place and jurisdiction coverage</h2><p>{registry.status === "available" ? `${registry.placeCount.toLocaleString()} geographic records and ${registry.sourceCount.toLocaleString()} explicitly scoped procedure or legal sources are published in the location registry.` : "The national place registry has not been published in this application yet. Federal and existing state pathways remain available."} Place coverage and pathway coverage are separate. A named community may have no government of its own, and a geographic parent is not automatically the authority for every task.</p></section>
      <section><h2>Local government starting points</h2><p>{registry.status === "available" && "registeredDomainCount" in registry ? `${registry.registeredDomainCount.toLocaleString()} registered .gov domains, ${registry.linkedDirectoryPlaceCount.toLocaleString()} places with an unambiguous organization match, and ${registry.indexedDirectoryPageCount.toLocaleString()} crawled local pages are available.` : "The official local directory is being connected to the application."} The <a href="https://get.gov/about/data/">CISA registration inventory</a> establishes the registrant. It does not establish a department’s topic authority, service boundary, fees, or application requirements. Ambiguous names remain unlinked, and websites outside .gov need additional official evidence.</p></section>
      <section><h2>Official and informal names</h2><p>Locations draw on <a href="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer">Census legal and statistical areas</a> and <a href="https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data">USGS geographic names</a>. Non-official variants remain labeled unofficial. Census functional status distinguishes functioning governments from statistical or inactive entities.</p></section>
      <section><h2>Property-specific questions</h2><p>Address lookup uses Census address ranges, which do not verify a home’s parcel boundary. Land-use and rights pathways need local parcel records, zoning and overlays, applicable law, and recorded deeds or restrictions. Missing sources remain visible.</p></section>
    </div>
  );
}
