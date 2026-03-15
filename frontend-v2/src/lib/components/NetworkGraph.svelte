<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { nodes, edges, selectedNodeId, type PeerNode, type NodeStatus } from '$lib/stores/nodes';

  let svgEl: SVGSVGElement;
  let width = 0;
  let height = 0;

  const colorMap: Record<NodeStatus, string> = {
    idle: '#475569',      // Slate-600
    origin: '#00d4ff',    // Cyan (Lumina Primary)
    receiving: '#3b82f6', // Blue-500
    decoded: '#00ff9d',   // Green-400
    failed: '#ff3e3e',    // Red-500
    error: '#ff007a'      // Magenta
  };

  // D3 simulation
  let simulation: d3.Simulation<any, undefined>;
  let d3Nodes: any[] = [];
  let d3Links: any[] = [];

  $effect(() => {
    const nodeData = Array.from($nodes.values());
    const edgeData = $edges;

    // Sync D3 data with Svelte stores
    // We try to preserve existing D3 node objects for smooth transitions
    const existingNodes = new Map(d3Nodes.map(n => [n.id, n]));
    d3Nodes = nodeData.map(n => {
      const existing = existingNodes.get(n.id);
      return existing ? { ...existing, ...n } : { ...n };
    });

    d3Links = edgeData.map(e => ({
      source: e.source,
      target: e.target,
      category: e.category
    }));

    if (simulation) {
      simulation.nodes(d3Nodes);
      const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
      linkForce.links(d3Links);
      simulation.alpha(0.3).restart();
    }
  });

  onMount(() => {
    const svg = d3.select(svgEl);
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink(d3Links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        updateDOM();
      });

    function updateDOM() {
      const link = g.selectAll('.link').data(d3Links);
      link.exit().remove();
      const linkEnter = link.enter().append('line')
        .attr('class', 'link transition-all')
        .attr('stroke', 'rgba(255,255,255,0.08)')
        .attr('stroke-width', 1);
      
      const linkUpdate = linkEnter.merge(link as any)
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      const node = g.selectAll('.node').data(d3Nodes, (d: any) => d.id);
      node.exit().remove();

      const nodeEnter = node.enter().append('g')
        .attr('class', 'node cursor-pointer group')
        .on('click', (event, d) => {
          selectedNodeId.set(d.id);
        })
        .call(d3.drag<any, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any);

      nodeEnter.append('circle')
        .attr('r', 6)
        .attr('stroke', '#08090d')
        .attr('stroke-width', 2);

      nodeEnter.append('text')
        .attr('dy', 16)
        .attr('text-anchor', 'middle')
        .attr('class', 'text-[8px] fill-white/40 font-mono pointer-events-none group-hover:fill-white')
        .text(d => d.id.slice(0, 8));

      const nodeUpdate = nodeEnter.merge(node as any)
        .attr('transform', d => `translate(${d.x},${d.y})`);

      nodeUpdate.select('circle')
        .attr('fill', d => colorMap[d.status as NodeStatus] || colorMap.idle)
        .attr('filter', d => d.id === $selectedNodeId ? 'drop-shadow(0 0 4px currentColor)' : '');
    }

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => simulation.stop();
  });

  $effect(() => {
    if (simulation && width && height) {
      simulation.force('center', d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.1).restart();
    }
  });
</script>

<div class="w-full h-full" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svgEl}
    class="w-full h-full"
    viewBox="0 0 {width} {height}"
  ></svg>
</div>
