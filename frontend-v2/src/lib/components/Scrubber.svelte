<script lang="ts">
  import { simulation } from '$lib/stores/simulation';
  import { sendCommand } from '$lib/stores/websocket';
  import { Clock } from 'lucide-svelte';

  const duration = 120; // Default max time for the scrubber
  
  let isDragging = $state(false);
  let scrubEl: HTMLDivElement;

  function handleScrub(e: MouseEvent) {
    if (!scrubEl) return;
    const rect = scrubEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const time = percent * duration;
    
    // Optimistically update UI time if needed, but the WS will confirm
    sendCommand('POST', '/sim/seek', { time });
  }

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    handleScrub(e);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (isDragging) handleScrub(e);
  }

  function onMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  const progress = $derived(($simulation.time / duration) * 100);
</script>

<div class="h-10 border-t border-border bg-surface/80 backdrop-blur-md flex items-center px-4 gap-4 z-40">
  <div class="flex items-center gap-2 text-muted shrink-0">
    <Clock size={12} />
    <span class="text-[10px] font-mono font-bold tracking-tighter uppercase">Timeline</span>
  </div>

  <div 
    bind:this={scrubEl}
    class="relative flex-1 h-1.5 bg-white/5 rounded-full cursor-pointer group"
    on:mousedown={onMouseDown}
  >
    <!-- Background Ticks -->
    <div class="absolute inset-0 flex justify-between px-1 pointer-events-none">
      {#each Array(13) as _, i}
        <div class="w-px h-1 bg-white/10 mt-0.5"></div>
      {/each}
    </div>

    <!-- Active Fill -->
    <div 
      class="absolute top-0 left-0 h-full bg-primary/40 rounded-full transition-all duration-75"
      style="width: {progress}%"
    ></div>

    <!-- Playhead -->
    <div 
      class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow-[0_0_8px_rgba(0,212,255,0.6)] transition-all duration-75 group-hover:scale-125
        {isDragging ? 'scale-150' : ''}"
      style="left: calc({progress}% - 6px)"
    ></div>
  </div>

  <div class="flex items-center gap-2 shrink-0 font-mono text-[11px]">
    <span class="text-primary text-glow-cyan font-bold">{$simulation.time.toFixed(2)}s</span>
    <span class="text-white/20">/</span>
    <span class="text-white/40">{duration}s</span>
  </div>
</div>
