<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>Lumina P2P · NOC</title>
</svelte:head>

{@render children()}
