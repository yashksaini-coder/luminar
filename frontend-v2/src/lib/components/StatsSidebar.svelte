<script lang="ts">
  import { nodes } from '$lib/stores/nodes';
  import { Activity, Database, Network } from 'lucide-svelte';

  const stats = $derived(() => {
    const nodeData = Array.from($nodes.values());
    return {
      total: nodeData.length,
      idle: nodeData.filter(n => n.status === 'idle').length,
      origin: nodeData.filter(n => n.status === 'origin').length,
      receiving: nodeData.filter(n => n.status === 'receiving').length,
      decoded: nodeData.filter(n => n.status === 'decoded').length,
      failed: nodeData.filter(n => n.status === 'failed' || n.status === 'error').length
    };
  });
</script>

<aside class="w-64 border-r border-border bg-surface/30 flex flex-col h-full overflow-hidden">
  <div class="flex-1 overflow-y-auto scrollbar-none p-4 space-y-6">
    
    <!-- Nodes Overview -->
    <section>
      <div class="flex items-center gap-2 mb-3 text-muted">
        <Network size={14} />
        <h3 class="text-[10px] font-bold uppercase tracking-wider">Node Distribution</h3>
      </div>
      
      <div class="space-y-1.5">
        <div class="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5">
          <span class="text-white/60">Total Peers</span>
          <span class="font-mono font-bold">{stats().total}</span>
        </div>
        
        <div class="grid grid-cols-2 gap-1.5">
          <div class="p-2 rounded bg-black/10 border border-white/5">
            <div class="flex items-center gap-1.5 mb-1">
              <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
              <span class="text-[9px] text-white/40 uppercase">Decoded</span>
            </div>
            <span class="font-mono text-[14px] text-success font-bold">{stats().decoded}</span>
          </div>
          <div class="p-2 rounded bg-black/10 border border-white/5">
            <div class="flex items-center gap-1.5 mb-1">
              <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
              <span class="text-[9px] text-white/40 uppercase">Receiving</span>
            </div>
            <span class="font-mono text-[14px] text-primary font-bold">{stats().receiving}</span>
          </div>
          <div class="p-2 rounded bg-black/10 border border-white/5">
            <div class="flex items-center gap-1.5 mb-1">
              <div class="w-1.5 h-1.5 rounded-full bg-danger"></div>
              <span class="text-[9px] text-white/40 uppercase">Failed</span>
            </div>
            <span class="font-mono text-[14px] text-danger font-bold">{stats().failed}</span>
          </div>
          <div class="p-2 rounded bg-black/10 border border-white/5">
            <div class="flex items-center gap-1.5 mb-1">
              <div class="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
              <span class="text-[9px] text-white/40 uppercase">Idle</span>
            </div>
            <span class="font-mono text-[14px] text-slate-400 font-bold">{stats().idle}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Simulation Health -->
    <section>
      <div class="flex items-center gap-2 mb-3 text-muted">
        <Activity size={14} />
        <h3 class="text-[10px] font-bold uppercase tracking-wider">Protocol Telemetry</h3>
      </div>
      
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-[10px] mb-1">
            <span class="text-muted uppercase">Gossip Propagation</span>
            <span class="text-success">84%</span>
          </div>
          <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
            <div class="h-full bg-success shadow-[0_0_8px_rgba(0,255,157,0.4)]" style="width: 84%"></div>
          </div>
        </div>
        
        <div>
          <div class="flex justify-between text-[10px] mb-1">
            <span class="text-muted uppercase">DHT Query Latency</span>
            <span class="text-warning">142ms</span>
          </div>
          <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
            <div class="h-full bg-warning" style="width: 62%"></div>
          </div>
        </div>

        <div>
          <div class="flex justify-between text-[10px] mb-1">
            <span class="text-muted uppercase">Bandwidth (Global)</span>
            <span class="text-primary">12.4 MB/s</span>
          </div>
          <div class="h-10 w-full bg-black/40 rounded border border-white/5 mt-2 flex items-end px-1 pb-1 gap-0.5">
            <!-- Mock Sparkline -->
            {#each Array(20) as _, i}
              <div 
                class="flex-1 bg-primary/40 rounded-t-sm" 
                style="height: {Math.random() * 80 + 20}%"
              ></div>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <!-- Data Chunks -->
    <section>
      <div class="flex items-center gap-2 mb-3 text-muted">
        <Database size={14} />
        <h3 class="text-[10px] font-bold uppercase tracking-wider">Storage & Cache</h3>
      </div>
      
      <div class="space-y-2 font-mono text-[11px]">
        <div class="flex justify-between border-b border-white/5 pb-1">
          <span class="text-white/40">Total Blocks</span>
          <span>1,248</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-1">
          <span class="text-white/40">Cache Size</span>
          <span>64.2 MB</span>
        </div>
        <div class="flex justify-between border-b border-white/5 pb-1">
          <span class="text-white/40">Duplicate Chunks</span>
          <span class="text-danger">124 (9.8%)</span>
        </div>
      </div>
    </section>

  </div>

  <!-- Footer Stats -->
  <div class="p-3 border-t border-border bg-black/20 font-mono text-[10px]">
    <div class="flex items-center justify-between text-white/40">
      <span>REFRESH RATE</span>
      <span class="text-primary">20 HZ</span>
    </div>
  </div>
</aside>
