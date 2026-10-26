import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
const root = process.cwd();
const outputPath = path.join(root, "data/generated/govroute-knowledge-graph.html");
const graph = JSON.parse(await readFile(path.join(root, "data/generated/graph.json"), "utf8"));
const gnn = JSON.parse(await readFile(path.join(root, "data/generated/gnn-neighbors.json"), "utf8"));
const nodes = graph.nodes.map((node: { id: string; kind: string; label: string }) => ({ id: node.id, kind: node.kind, label: node.label }));
const links = graph.edges.map((edge: { from: string; to: string; relation: string }) => ({ source: edge.from, target: edge.to, relation: edge.relation, predicted: false }));
const nodeIds = new Set(nodes.map((node: { id: string }) => node.id));
for (const suggestion of gnn.suggestions.slice(0, 12)) {
  if (nodeIds.has(suggestion.from) && nodeIds.has(suggestion.to)) links.push({ source: suggestion.from, target: suggestion.to, relation: "GNN suggestion", predicted: true, score: suggestion.score });
}
const data = JSON.stringify({ nodes, links });

const fragment = `<div id="govroute-network">
  <h2>Govroute knowledge graph</h2>
  <div class="viz-row text-small text-muted" aria-label="Graph totals">
    <span><strong class="tabular-nums">${nodes.length}</strong> nodes</span>
    <span><strong class="tabular-nums">${graph.edges.length}</strong> verified edges</span>
    <span><strong class="tabular-nums">${gnn.suggestions.length}</strong> GNN suggestions awaiting review</span>
  </div>
  <div class="viz-controls">
    <label class="form-label" for="gg-focus">Focus a journey
      <select class="form-select" id="gg-focus"><option value="">Whole graph</option></select>
    </label>
    <button type="button" class="btn btn-ghost" id="gg-reset">Reset view</button>
  </div>
  <div class="gg-legend" aria-label="Toggle node types"></div>
  <div class="gg-stage">
    <svg role="img" aria-labelledby="gg-title gg-desc"><title id="gg-title">Govroute evidence network</title><desc id="gg-desc">An interactive network of journeys, ordered steps, official source pages, government publishers, and review-only GNN relationship suggestions.</desc></svg>
    <div class="tooltip" role="tooltip" hidden></div>
  </div>
  <p class="gg-selected text-small" aria-live="polite">Select a node to inspect its immediate evidence neighborhood.</p>
</div>
<style>
  #govroute-network { width: 100%; color: var(--foreground); }
  #govroute-network h2 { margin-bottom: .35rem; }
  #govroute-network .viz-row { gap: 1rem; justify-content: flex-start; margin-bottom: .8rem; }
  #govroute-network .viz-row strong { color: var(--foreground); font-weight: 500; }
  #govroute-network .viz-controls { margin-block: .7rem .5rem; }
  #govroute-network .form-label { min-width: min(100%, 320px); }
  #govroute-network .gg-legend { display: flex; flex-wrap: wrap; gap: .25rem .9rem; margin-block: .4rem .6rem; }
  #govroute-network .gg-legend button { display: inline-flex; align-items: center; gap: .35rem; border: 0; background: transparent; color: var(--foreground); padding: .3rem 0; font: inherit; cursor: pointer; }
  #govroute-network .gg-legend button[aria-pressed="false"] { color: var(--muted-foreground); text-decoration: line-through; }
  #govroute-network .gg-swatch { width: .65rem; height: .65rem; border-radius: 50%; background: var(--swatch); }
  #govroute-network .gg-swatch[data-edge="true"] { width: 1.1rem; height: 0; border-radius: 0; border-top: 2px dashed var(--viz-series-6); background: transparent; }
  #govroute-network .gg-stage { position: relative; width: 100%; }
  #govroute-network svg { display: block; width: 100%; min-height: 440px; border: 1px solid var(--border); background: color-mix(in srgb, var(--card) 28%, transparent); touch-action: none; }
  #govroute-network .gg-link { stroke: var(--border); stroke-width: 1; opacity: .52; }
  #govroute-network .gg-link[data-predicted="true"] { stroke: var(--viz-series-6); stroke-width: 1.4; stroke-dasharray: 4 4; opacity: .8; }
  #govroute-network .gg-node { cursor: pointer; stroke: var(--background); stroke-width: 1.5; }
  #govroute-network .gg-node[data-kind="journey"] { fill: var(--viz-series-1); }
  #govroute-network .gg-node[data-kind="step"] { fill: var(--viz-series-2); }
  #govroute-network .gg-node[data-kind="source"] { fill: var(--viz-series-3); }
  #govroute-network .gg-node[data-kind="agency"] { fill: var(--viz-series-4); }
  #govroute-network .gg-node[data-kind="program"], #govroute-network .gg-node[data-kind="requirement"] { fill: var(--viz-series-5); }
  #govroute-network .gg-node.is-muted, #govroute-network .gg-link.is-muted { opacity: .07; }
  #govroute-network .gg-node.is-neighbor { stroke: var(--foreground); stroke-width: 2.5; }
  #govroute-network .gg-label { fill: var(--foreground); font-size: 12px; font-weight: 500; pointer-events: none; paint-order: stroke; stroke: var(--background); stroke-width: 3px; stroke-linejoin: round; }
  #govroute-network .gg-selected { min-height: 1.5rem; margin-top: .55rem; color: var(--muted-foreground); }
  #govroute-network .tooltip { position: absolute; max-width: 260px; pointer-events: none; background: var(--popover); color: var(--popover-foreground); border: 1px solid var(--border); padding: .45rem .55rem; z-index: 2; }
  @media (max-width: 520px) { #govroute-network svg { min-height: 520px; } #govroute-network .gg-legend { gap-inline: .65rem; } }
</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script>
(() => {
  const root = document.getElementById('govroute-network');
  const raw = ${data};
  const kinds = ['journey','step','source','agency'];
  const kindNames = { journey:'Journeys', step:'Ordered steps', source:'Official sources', agency:'Publishers' };
  const colors = { journey:'var(--viz-series-1)', step:'var(--viz-series-2)', source:'var(--viz-series-3)', agency:'var(--viz-series-4)' };
  const enabled = new Set(kinds);
  const svg = d3.select(root.querySelector('svg'));
  const stage = root.querySelector('.gg-stage');
  const tooltip = root.querySelector('.tooltip');
  const readout = root.querySelector('.gg-selected');
  const select = root.querySelector('#gg-focus');
  const journeyNodes = raw.nodes.filter(d => d.kind === 'journey').sort((a,b) => a.label.localeCompare(b.label));
  journeyNodes.forEach(node => { const option = document.createElement('option'); option.value = node.id; option.textContent = node.label; select.appendChild(option); });
  const legend = root.querySelector('.gg-legend');
  kinds.forEach(kind => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed','true');
    button.innerHTML = '<span class="gg-swatch" style="--swatch:'+colors[kind]+'"></span>'+kindNames[kind];
    button.addEventListener('click', () => { enabled.has(kind) ? enabled.delete(kind) : enabled.add(kind); button.setAttribute('aria-pressed', String(enabled.has(kind))); applyVisibility(); });
    legend.appendChild(button);
  });
  const predictionKey = document.createElement('span'); predictionKey.className = 'text-small'; predictionKey.innerHTML = '<span class="gg-swatch" data-edge="true"></span> GNN suggestion'; predictionKey.style.display='inline-flex'; predictionKey.style.alignItems='center'; predictionKey.style.gap='.35rem'; legend.appendChild(predictionKey);
  const zoomLayer = svg.append('g');
  const linkLayer = zoomLayer.append('g');
  const nodeLayer = zoomLayer.append('g');
  let width = 736; let height = 500; let focused = '';
  const nodes = raw.nodes.map(d => ({...d}));
  const links = raw.links.map(d => ({...d}));
  const degree = new Map(); links.forEach(link => { degree.set(link.source, (degree.get(link.source)||0)+1); degree.set(link.target, (degree.get(link.target)||0)+1); });
  const radius = d => d.kind === 'journey' ? 7 : d.kind === 'step' ? 4.5 : d.kind === 'source' ? 4 : 5;
  const link = linkLayer.selectAll('line').data(links).join('line').attr('class','gg-link').attr('data-predicted',d => d.predicted);
  const node = nodeLayer.selectAll('circle').data(nodes).join('circle').attr('class','gg-node').attr('data-kind',d=>d.kind).attr('r',radius)
    .on('pointerenter', (event,d) => { tooltip.hidden=false; tooltip.textContent = d.label+' · '+(kindNames[d.kind]||d.kind); const box=stage.getBoundingClientRect(); tooltip.style.left=(event.clientX-box.left+10)+'px'; tooltip.style.top=(event.clientY-box.top+10)+'px'; })
    .on('pointerleave',()=>{tooltip.hidden=true;})
    .on('click',(event,d)=>focusNode(d.id));
  const labels = nodeLayer.selectAll('text').data(nodes.filter(d => d.kind === 'journey')).join('text').attr('class','gg-label').text(d => d.label.length>25?d.label.slice(0,24)+'…':d.label).attr('dx',10).attr('dy',4);
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(d=>d.predicted?110:(d.source.kind==='journey'?55:38)).strength(d=>d.predicted?.05:.35))
    .force('charge', d3.forceManyBody().strength(d=>d.kind==='journey'?-170:-34))
    .force('collide', d3.forceCollide().radius(d=>radius(d)+3))
    .force('center', d3.forceCenter(width/2,height/2))
    .on('tick',()=>{ link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y); node.attr('cx',d=>d.x).attr('cy',d=>d.y); labels.attr('x',d=>d.x).attr('y',d=>d.y); });
  node.call(d3.drag().on('start',(event,d)=>{if(!event.active)simulation.alphaTarget(.2).restart();d.fx=d.x;d.fy=d.y;}).on('drag',(event,d)=>{d.fx=event.x;d.fy=event.y;}).on('end',(event,d)=>{if(!event.active)simulation.alphaTarget(0);d.fx=null;d.fy=null;}));
  const zoomBehavior = d3.zoom().scaleExtent([.35,4]).on('zoom',event=>zoomLayer.attr('transform',event.transform));
  svg.call(zoomBehavior);
  function applyVisibility(){ node.style('display',d=>enabled.has(d.kind)?null:'none'); labels.style('display',d=>enabled.has(d.kind)?null:'none'); link.style('display',d=>enabled.has(d.source.kind)&&enabled.has(d.target.kind)?null:'none'); }
  function focusNode(id){ focused=id; select.value = nodes.find(d=>d.id===id&&d.kind==='journey')?id:''; const neighbors=new Set([id]); links.forEach(l=>{const a=l.source.id||l.source,b=l.target.id||l.target;if(a===id)neighbors.add(b);if(b===id)neighbors.add(a);}); node.classed('is-muted',d=>!neighbors.has(d.id)).classed('is-neighbor',d=>neighbors.has(d.id)); link.classed('is-muted',d=>!neighbors.has(d.source.id||d.source)||!neighbors.has(d.target.id||d.target)); labels.classed('is-muted',d=>!neighbors.has(d.id)); const chosen=nodes.find(d=>d.id===id); readout.textContent=chosen?chosen.label+' · '+(kindNames[chosen.kind]||chosen.kind)+' · '+(degree.get(chosen.id)||0)+' direct connections':'Select a node to inspect its immediate evidence neighborhood.'; }
  select.addEventListener('change',()=> select.value ? focusNode(select.value) : reset());
  function reset(){focused='';select.value='';node.classed('is-muted',false).classed('is-neighbor',false);link.classed('is-muted',false);labels.classed('is-muted',false);readout.textContent='Select a node to inspect its immediate evidence neighborhood.';svg.transition().duration(250).call(zoomBehavior.transform,d3.zoomIdentity);}
  root.querySelector('#gg-reset').addEventListener('click',reset);
  const resize = () => { width=Math.max(320,stage.clientWidth);height=width<520?520:500;svg.attr('viewBox',[0,0,width,height]);simulation.force('center',d3.forceCenter(width/2,height/2)).alpha(.25).restart(); };
  new ResizeObserver(resize).observe(stage); resize();
})();
</script>`;

await writeFile(outputPath, fragment);
process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
