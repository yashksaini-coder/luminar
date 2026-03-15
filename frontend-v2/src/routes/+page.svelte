<script lang="ts">
  import { onMount } from 'svelte';
  import { connect } from '$lib/stores/websocket';
  import { simulation } from '$lib/stores/simulation';
  import Header from '$lib/components/Header.svelte';
  import NetworkGraph from '$lib/components/NetworkGraph.svelte';
  import Scrubber from '$lib/components/Scrubber.svelte';
  import StatsSidebar from '$lib/components/StatsSidebar.svelte';
  import EventSidebar from '$lib/components/EventSidebar.svelte';

  onMount(() => {
    connect();
  });
</script>

<div class="flex flex-col h-screen w-full overflow-hidden bg-background text-white select-none">
  <!-- Top Navigation / Status -->
  <Header />

  <!-- Main Dashboard Area -->
  <main class="flex flex-1 w-full overflow-hidden">
    <!-- Left: Telemetry & Network Stats -->
    <StatsSidebar />

    <!-- Center: Primary Visualization -->
    <div class="relative flex-1 flex flex-col min-w-0 bg-black/20">
      <div class="flex-1 w-full h-full relative overflow-hidden">
        <NetworkGraph />
      </div>
      
      <!-- Bottom Scrubber / Timeline -->
      <Scrubber />
    </div>

    <!-- Right: Event Stream & Controls -->
    <EventSidebar />
  </main>

  <!-- Global Fault Overlay (when active) -->
  <!-- <FaultOverlay /> -->
</div>
