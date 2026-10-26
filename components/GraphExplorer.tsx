"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { GraphEdge, GraphNode } from "@/lib/schema";

type JourneyOption = { id: string; title: string; slug: string };
type Suggestion = { from: string; to: string; relation: "related-to"; score: number; status: string };
type VizNode = GraphNode & d3.SimulationNodeDatum;
type VizLink = d3.SimulationLinkDatum<VizNode> & { relation: GraphEdge["relation"]; suggested?: boolean };

const labels: Record<string, string> = { journey: "Guides", program: "Topics", step: "Steps", source: "Official sources", agency: "Agencies" };
const kinds: GraphNode["kind"][] = ["journey", "program", "step", "source", "agency"];

function neighborhood(root: string, edges: GraphEdge[]) {
  const ids = new Set([root]); let frontier = [root];
  for (let depth = 0; depth < 4; depth += 1) {
    const next: string[] = [];
    frontier.forEach((id) => edges.forEach((edge) => { if (edge.from === id && !ids.has(edge.to)) { ids.add(edge.to); next.push(edge.to); } }));
    frontier = next;
  }
  return ids;
}

function endpoint(value: string | number | VizNode) { return typeof value === "object" ? value.id : String(value); }

export function GraphExplorer({ nodes, edges, journeys, suggestions, initialFocus }: { nodes: GraphNode[]; edges: GraphEdge[]; journeys: JourneyOption[]; suggestions: Suggestion[]; initialFocus?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const centerRef = useRef<(id: string) => void>(() => undefined);
  const savedPositions = useRef(new Map<string, { x: number; y: number }>());
  const validFocus = initialFocus && journeys.some((journey) => journey.id === initialFocus) ? initialFocus : "all";
  const [scope, setScope] = useState(validFocus || "all");
  const [selectedId, setSelectedId] = useState(initialFocus ?? "");
  const [enabled, setEnabled] = useState<Set<GraphNode["kind"]>>(new Set(["journey", "program"]));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [query, setQuery] = useState("");
  const [size, setSize] = useState({ width: 900, height: 680 });

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const scoped = useMemo(() => scope === "all" ? new Set(nodes.map((node) => node.id)) : neighborhood(scope, edges), [scope, nodes, edges]);
  const activeNodes = useMemo(() => nodes.filter((node) => scoped.has(node.id) && enabled.has(node.kind)), [nodes, scoped, enabled]);
  const ids = useMemo(() => new Set(activeNodes.map((node) => node.id)), [activeNodes]);
  const activeEdges = useMemo(() => {
    const base: VizLink[] = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).map((edge) => ({ source: edge.from, target: edge.to, relation: edge.relation }));
    if (showSuggestions && scope === "all") base.push(...suggestions.slice(0, 12).filter((edge) => ids.has(edge.from) && ids.has(edge.to)).map((edge) => ({ source: edge.from, target: edge.to, relation: edge.relation, suggested: true })));
    return base;
  }, [edges, ids, showSuggestions, scope, suggestions]);
  const selected = selectedId ? nodeMap.get(selectedId) : undefined;
  const relations = selected ? edges.filter((edge) => edge.from === selected.id || edge.to === selected.id) : [];
  const journey = selected?.kind === "journey" ? journeys.find((item) => item.id === selected.id) : undefined;

  useEffect(() => {
    if (!frameRef.current) return;
    const frame = frameRef.current;
    const resize = () => setSize({ width: Math.max(320, frame.clientWidth), height: frame.clientWidth < 620 ? 550 : 680 });
    resize(); const observer = new ResizeObserver(resize); observer.observe(frame); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const { width, height } = size; const svg = d3.select(svgRef.current); svg.selectAll("*").remove();
    const graphNodes: VizNode[] = activeNodes.map((node, index) => {
      const saved = savedPositions.current.get(node.id); const angle = index / Math.max(1, activeNodes.length) * Math.PI * 2;
      return { ...node, x: saved?.x ?? width / 2 + Math.cos(angle) * 150, y: saved?.y ?? height / 2 + Math.sin(angle) * 150 };
    });
    const graphEdges: VizLink[] = activeEdges.map((edge) => ({ ...edge }));
    const connected = new Set<string>(selectedId ? [selectedId] : []);
    graphEdges.forEach((edge) => { const a = endpoint(edge.source), b = endpoint(edge.target); if (a === selectedId) connected.add(b); if (b === selectedId) connected.add(a); });
    const viewport = svg.append("g");
    const link = viewport.append("g").attr("class", "network-links").selectAll("line").data(graphEdges).join("line").attr("data-suggested", (edge) => edge.suggested ? "true" : "false").attr("opacity", (edge) => !selectedId || connected.has(endpoint(edge.source)) && connected.has(endpoint(edge.target)) ? 1 : .07);
    const node = viewport.append("g").attr("class", "network-nodes").selectAll<SVGGElement, VizNode>("g").data(graphNodes).join("g").attr("data-kind", (item) => item.kind).attr("data-selected", (item) => item.id === selectedId ? "true" : "false").attr("opacity", (item) => !selectedId || connected.has(item.id) ? 1 : .12);
    node.append("circle").attr("r", (item) => item.kind === "program" ? 12 : item.kind === "journey" ? 7 : item.kind === "step" ? 6.5 : 5.5);
    node.append("text").attr("x", 13).attr("y", 4).text((item) => item.label.length > 35 ? `${item.label.slice(0, 34)}…` : item.label).attr("display", (item) => item.id === selectedId || scope !== "all" ? null : "none");
    const tooltip = d3.select(tooltipRef.current);
    node.on("pointerenter", function (event, item) {
      d3.select(this).raise().select("text").attr("display", null); tooltip.style("opacity", "1");
      tooltip.selectAll("*").remove();tooltip.append("span").text(labels[item.kind] ?? item.kind);tooltip.append("strong").text(item.label);
      const box = frameRef.current?.getBoundingClientRect(); if (box) tooltip.style("left", `${Math.max(12, Math.min(event.clientX - box.left + 12, box.width - 265))}px`).style("top", `${Math.max(12, event.clientY - box.top - 12)}px`);
    }).on("pointerleave", function (_event, item) { d3.select(this).select("text").attr("display", item.id === selectedId || scope !== "all" ? null : "none"); tooltip.style("opacity", "0"); }).on("click", (_event, item) => setSelectedId(item.id));
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([.3, 4]).on("zoom", (event) => viewport.attr("transform", event.transform)); svg.call(zoom).on("dblclick.zoom", null);
    const simulation = d3.forceSimulation(graphNodes)
      .force("link", d3.forceLink<VizNode, VizLink>(graphEdges).id((item) => item.id).distance((edge) => edge.suggested ? 150 : edge.relation === "next" ? 42 : 72).strength((edge) => edge.suggested ? .06 : .3))
      .force("charge", d3.forceManyBody().strength(scope === "all" ? -48 : -145)).force("collide", d3.forceCollide<VizNode>().radius((item) => item.kind === "program" ? 27 : item.kind === "journey" ? 13 : 14).iterations(2)).force("x", d3.forceX(width / 2).strength(.045)).force("y", d3.forceY(height / 2).strength(.055)).alphaDecay(.045)
      .on("tick", () => { link.attr("x1", (edge) => (edge.source as VizNode).x ?? 0).attr("y1", (edge) => (edge.source as VizNode).y ?? 0).attr("x2", (edge) => (edge.target as VizNode).x ?? 0).attr("y2", (edge) => (edge.target as VizNode).y ?? 0); node.attr("transform", (item) => `translate(${item.x ?? 0},${item.y ?? 0})`); });
    node.call(d3.drag<SVGGElement, VizNode>().on("start", (event, item) => { if (!event.active) simulation.alphaTarget(.2).restart(); item.fx = item.x; item.fy = item.y; }).on("drag", (event, item) => { item.fx = event.x; item.fy = event.y; }).on("end", (event, item) => { if (!event.active) simulation.alphaTarget(0); item.fx = null; item.fy = null; }));
    resetRef.current = () => svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
    centerRef.current = (id) => { const item = graphNodes.find((candidate) => candidate.id === id); if (item?.x && item?.y) svg.transition().duration(320).call(zoom.transform, d3.zoomIdentity.translate(width / 2 - item.x * 1.5, height / 2 - item.y * 1.5).scale(1.5)); };
    const positionCache=savedPositions.current;
    return () => { graphNodes.forEach((item) => positionCache.set(item.id, { x: item.x ?? width / 2, y: item.y ?? height / 2 })); simulation.stop(); };
  }, [activeNodes, activeEdges, size, scope, selectedId]);

  function toggle(kind: GraphNode["kind"]) { setEnabled((current) => { const next = new Set(current); if (next.has(kind) && next.size > 1) next.delete(kind); else next.add(kind); return next; }); }
  function find(event: FormEvent) { event.preventDefault(); const clean = query.trim().toLowerCase(); const match = activeNodes.find((node) => node.label.toLowerCase().includes(clean)); if (match && clean) { setSelectedId(match.id); window.setTimeout(() => centerRef.current(match.id), 80); } }
  function changeScope(value: string) { setScope(value); setSelectedId(value === "all" ? "" : value); setEnabled(value === "all" ? new Set(["journey", "program"]) : new Set(kinds)); savedPositions.current.clear(); }

  return <section className="graph-workbench" aria-label="Interactive knowledge graph">
    <div className="graph-toolbar">
      <label className="graph-field"><span>View</span><select value={scope} onChange={(event) => changeScope(event.target.value)}><option value="all">Entire knowledge graph</option>{journeys.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <form className="graph-search" onSubmit={find}><label htmlFor="graph-query">Find a node</label><div><input id="graph-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “passport”" /><button type="submit">Find</button></div></form>
      <button className="graph-reset" type="button" onClick={() => { setSelectedId(""); resetRef.current(); }}>Reset view</button>
    </div>
    <div className="graph-kindbar">{kinds.map((kind) => <button type="button" key={kind} aria-pressed={enabled.has(kind)} onClick={() => toggle(kind)}><i data-kind={kind} />{labels[kind]}</button>)}<span /><button type="button" aria-pressed={showSuggestions} onClick={() => setShowSuggestions((value) => !value)} disabled={scope !== "all"}><i data-kind="suggestion" />GNN suggestions</button></div>
    <div className="graph-canvas-layout">
      <div className="graph-canvas" ref={frameRef}><div className="graph-canvas__hint">Select a guide, step, source, or agency to inspect its connections</div><svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Interactive graph with ${activeNodes.length} nodes and ${activeEdges.length} connections`} /><div className="network-tooltip" ref={tooltipRef} role="tooltip" /></div>
      <aside className="graph-inspector" aria-live="polite">{selected ? <><div className="inspector-kicker"><i data-kind={selected.kind} />{(labels[selected.kind] ?? selected.kind).replace(/s$/, "")}</div><h2>{selected.label}</h2><p>{selected.description}</p><dl>{selected.params.jurisdiction && <><dt>Jurisdiction</dt><dd>{selected.params.jurisdiction.replaceAll("-", " ")}</dd></>}{selected.params.category && <><dt>Category</dt><dd>{selected.params.category}</dd></>}{selected.params.catalogSource && <><dt>Catalog</dt><dd>Government directory</dd></>}<dt>Connections</dt><dd>{relations.length}</dd><dt>Status</dt><dd>{selected.kind === "journey" ? "published guide" : selected.params.status === "machine-indexed" ? "indexed evidence" : selected.params.status.replaceAll("-", " ")}</dd></dl>{journey && <Link className="inspector-action" href={`/guides/${journey.slug}`}>Open this guide <span>→</span></Link>}{selected.params.sourceUrl && <a className="inspector-action" href={selected.params.sourceUrl} target="_blank" rel="noreferrer">Open official source <span>↗</span></a>}<button className="inspector-neighborhood" type="button" onClick={() => centerRef.current(selected.id)}>Center this node</button></> : <div className="inspector-empty"><span>{nodes.length} pathway graph nodes</span><h2>Select anything.</h2><p>Choose a guide, source, step, or agency to inspect its status and connections.</p></div>}</aside>
    </div>
    <div className="graph-status"><span>{activeNodes.length} visible nodes</span><span>{activeEdges.length} connections</span>{showSuggestions && scope === "all" && <span>Dashed lines require human review</span>}</div>
  </section>;
}

