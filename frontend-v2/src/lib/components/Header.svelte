<script lang="ts">
  import { Play, Pause, RotateCcw, Activity, Wifi, WifiOff } from 'lucide-svelte';
  import { simulation } from '$lib/stores/simulation';
  import { sendCommand } from '$lib/stores/websocket';
  import { events } from '$lib/stores/events';
  import { clearGraph } from '$lib/stores/nodes';

  async function togglePlay() {
    const endpoint = $simulation.state === 'running' ? '/sim/pause' : '/sim/play';
    await sendCommand('POST', endpoint);
  }

  async function resetSim() {
    await sendCommand('POST', '/sim/reset');
    events.clear();
    clearGraph();
  }

  async function changeSpeed(e: Event) {
    const speed = parseFloat((e.target as HTMLSelectElement).value);
    await sendCommand('POST', '/sim/speed', { speed });
  }
</script>

<header class="h-12 border-b border-border bg-surface/50 flex items-center justify-between px-4 z-50">
  <!-- Brand -->
  <div class="flex items-center gap-3">
    <div class="w-6 h-6 bg-primary/20 rounded-sm border border-primary/40 flex items-center justify-center">
      <div class="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(0,212,255,0.8)]"></div>
    </div>
    <div class="flex flex-col">
      <span class="font-bold tracking-widest text-[14px] leading-none">LUMINA · P2P</span>
      <span class="text-[9px] text-muted tracking-tighter uppercase">NOC Operations Center</span>
    </div>
  </div>

  <!-- Simulation Controls -->
  <div class="flex items-center gap-4">
    <div class="flex items-center bg-black/40 rounded-md p-0.5 border border-border">
      <button 
        class="p-1.5 hover:bg-white/5 rounded transition-colors text-white/70 hover:text-white"
        title="Reset Simulation"
        on:click={resetSim}
      >
        <RotateCcw size={16} />
      </button>
      <div class="w-px h-4 bg-border mx-0.5"></div>
      <button 
        class="flex items-center gap-2 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded transition-all active:scale-95"
        on:click={togglePlay}
      >
        {#if $simulation.state === 'running'}
          <Pause size={14} fill="currentColor" />
          <span class="text-[11px] font-bold">PAUSE</span>
        {:else}
          <Play size={14} fill="currentColor" />
          <span class="text-[11px] font-bold">START</span>
        {/if}
      </button>
    </div>

    <div class="flex items-center gap-2 px-2 h-8 bg-black/20 border border-border rounded">
      <span class="text-[10px] text-muted font-mono">SPEED:</span>
      <select 
        class="bg-transparent text-[11px] font-mono outline-none border-none cursor-pointer"
        on:change={changeSpeed}
        value={$simulation.speed}
      >
        <option value="0.25">0.25×</option>
        <option value="0.5">0.5×</option>
        <option value="1">1.0× (Realtime)</option>
        <option value="2">2.0×</option>
        <option value="4">4.0×</option>
        <option value="8">8.0×</option>
      </select>
    </div>
  </div>

  <!-- Telemetry Strip -->
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-4">
      <div class="flex flex-col items-end">
        <span class="text-[9px] text-muted uppercase leading-none">System Time</span>
        <span class="text-[13px] font-mono font-medium leading-tight tracking-tight text-glow-cyan">
          {$simulation.time.toFixed(2)}s
        </span>
      </div>
      <div class="h-6 w-px bg-border"></div>
      <div class="flex flex-col items-end">
        <span class="text-[9px] text-muted uppercase leading-none">Active Nodes</span>
        <span class="text-[13px] font-mono font-medium leading-tight tracking-tight">
          {$simulation.nodeCount}
        </span>
      </div>
    </div>

    <!-- Connection Status -->
    <div class="flex items-center gap-2 px-3 py-1 rounded-full border border-border {$simulation.connected ? 'bg-success/5 text-success/80 border-success/20' : 'bg-danger/5 text-danger/80 border-danger/20'}">
      {#if $simulation.connected}
        <Wifi size={12} />
        <span class="text-[10px] font-bold uppercase tracking-wider">ONLINE</span>
      {:else}
        <WifiOff size={12} />
        <span class="text-[10px] font-bold uppercase tracking-wider">OFFLINE</span>
      {/if}
    </div>
  </div>
</header>
