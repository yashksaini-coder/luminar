<script lang="ts">
  import { events } from '$lib/stores/events';
  import { selectedNodeId, nodes } from '$lib/stores/nodes';
  import { Filter, Search, Terminal } from 'lucide-svelte';
  import { afterUpdate } from 'svelte';

  let filter = $state('all');
  let search = $state('');
  let logEl: HTMLDivElement;

  const filteredEvents = $derived(() => {
    return $events
      .filter(e => {
        if (filter !== 'all' && e.category !== filter) return false;
        if (search && !JSON.stringify(e).toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .slice(-200); // Limit visible for performance
  });

  const categoryColors: Record<string, string> = {
    gossip: 'text-primary',
    dht: 'text-secondary',
    fault: 'text-danger',
    sim: 'text-success',
    connection: 'text-warning'
  };

  afterUpdate(() => {
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
</script>

<aside class="w-80 border-l border-border bg-surface/30 flex flex-col h-full overflow-hidden">
  <!-- Header & Filters -->
  <div class="p-3 border-b border-border space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 text-white/80">
        <Terminal size={14} />
        <h3 class="text-[10px] font-bold uppercase tracking-wider">Live Event Stream</h3>
      </div>
      <span class="text-[10px] font-mono text-muted bg-white/5 px-1.5 py-0.5 rounded">
        {$events.length} TOTAL
      </span>
    </div>

    <div class="flex flex-col gap-2">
      <div class="relative">
        <Search size={12} class="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
        <input 
          type="text" 
          placeholder="Filter events..." 
          bind:value={search}
          class="w-full bg-black/40 border border-border rounded py-1 pl-7 pr-2 text-[11px] outline-none focus:border-primary/50 transition-colors"
        />
      </div>
      
      <div class="flex flex-wrap gap-1">
        {#each ['all', 'gossip', 'dht', 'fault', 'sim'] as cat}
          <button 
            class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight transition-all border
              {filter === cat ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-transparent text-muted hover:text-white/60'}"
            on:click={() => filter = cat}
          >
            {cat}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Event List -->
  <div 
    bind:this={logEl}
    class="flex-1 overflow-y-auto font-mono text-[10px] p-2 space-y-1 scrollbar-none"
  >
    {#each filteredEvents() as event}
      <div 
        class="group flex flex-col p-1.5 rounded hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5
          {event.peer_id === $selectedNodeId ? 'bg-primary/5 border-primary/20' : ''}"
      >
        <div class="flex items-center justify-between mb-0.5">
          <span class="text-white/20">[{event.at.toFixed(3)}s]</span>
          <span class="px-1 rounded bg-black/40 text-[9px] font-bold {categoryColors[event.category] || 'text-muted'}">
            {event.event_type}
          </span>
        </div>
        <div class="flex gap-2">
          {#if event.peer_id}
            <span class="text-primary/60 shrink-0">@{event.peer_id.slice(0, 8)}</span>
          {/if}
          <span class="text-white/70 break-all">{event.message || event.event_type}</span>
        </div>
      </div>
    {/each}
  </div>

  <!-- Node Inspector (Integrated) -->
  {#if $selectedNodeId}
    {@const node = $nodes.get($selectedNodeId)}
    {#if node}
      <div class="p-4 border-t border-border bg-black/40 animate-in slide-in-from-bottom-2 duration-200">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[10px] font-bold uppercase tracking-wider text-primary">Node Inspector</h3>
          <button class="text-muted hover:text-white" on:click={() => selectedNodeId.set(null)}>✕</button>
        </div>
        <div class="space-y-2 font-mono text-[11px]">
          <div class="flex justify-between border-b border-white/5 pb-1">
            <span class="text-white/40 uppercase">ID</span>
            <span class="text-white truncate max-w-[120px]">{node.id}</span>
          </div>
          <div class="flex justify-between border-b border-white/5 pb-1">
            <span class="text-white/40 uppercase">Status</span>
            <span class="capitalize" style="color: {node.status === 'idle' ? '#94a3b8' : node.status === 'decoded' ? '#00ff9d' : '#00d4ff'}">
              {node.status}
            </span>
          </div>
          <div class="flex justify-between border-b border-white/5 pb-1">
            <span class="text-white/40 uppercase">Location</span>
            <span class="text-white/80">{node.x.toFixed(0)}, {node.y.toFixed(0)}</span>
          </div>
          
          <div class="pt-2 grid grid-cols-2 gap-2">
            <button class="w-full py-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 rounded text-[10px] font-bold uppercase transition-colors">
              Drop Node
            </button>
            <button class="w-full py-1.5 bg-warning/10 hover:bg-warning/20 text-warning border border-warning/30 rounded text-[10px] font-bold uppercase transition-colors">
              Isolate
            </button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</aside>
