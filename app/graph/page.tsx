import type { Metadata } from "next";
import { GraphExplorer } from "@/components/GraphExplorer";
import { journeys } from "@/data/curated/journeys";
import { govGraph } from "@/lib/graph";
import gnn from "@/data/generated/gnn-neighbors.json";
import { discoveredGuides } from "@/lib/discovered-guides";

export const metadata: Metadata = { title: "Knowledge graph" };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const counts = ["journey", "step", "source", "agency"].map((kind) => ({ kind, count: govGraph.nodes.filter((node) => node.kind === kind).length }));
  return (
    <div className="page-shell shell graph-page">
      <header className="page-intro">
        <p className="eyebrow">Inspectable by design</p>
        <h1>The knowledge graph</h1>
        <p>The network maps every published government task to its topic, official source, agency, and ordered steps when the source provides them.</p>
      </header>
      <div className="graph-stats" aria-label="Graph totals">
        {counts.map(({ kind, count }) => <div key={kind}><strong>{count}</strong><span>{count === 1 ? kind : kind === "agency" ? "agencies" : kind + "s"}</span></div>)}
        <div><strong>{govGraph.edges.length}</strong><span>typed edges</span></div>
      </div>
      <GraphExplorer nodes={govGraph.nodes} edges={govGraph.edges} journeys={[...journeys.map(({ id, title, slug }) => ({ id, title, slug })), ...discoveredGuides.map(({ id, title, slug }) => ({ id, title, slug }))]} suggestions={gnn.suggestions.map(({ from, to, score, status }) => ({ from, to, score, status, relation: "related-to" as const }))} initialFocus={focus} />
      <section className="graph-rules">
        <div><h2>One publication standard</h2><p>Every public guide must resolve to a concrete government task and pass automated checks for its source, title, useful content, and crawl freshness. Broader agency pages remain evidence nodes instead of becoming guides.</p></div>
        <div><h2>Where a GNN can help</h2><p>An experimental GraphSAGE model can suggest similar journeys or missing <em>related-to</em> edges for human review. It cannot create or verify a step, source, deadline, fee, or eligibility rule.</p></div>
      </section>
    </div>
  );
}

