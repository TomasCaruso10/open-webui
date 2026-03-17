<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { showSidebar } from '$lib/stores';

	import ReportEditor from '$lib/powerapps/components/ReportEditor.svelte';

	let loaded = false;

	$: chatId = $page.url.searchParams.get('chatId') || null;

	onMount(async () => {
		// Hide sidebar for report editor — maximize space
		showSidebar.set(false);
		loaded = true;
	});
</script>

{#if loaded}
	<div
		id="report-container"
		class="w-full h-full"
	>
		<ReportEditor id={$page.params.id} {chatId} />
	</div>
{/if}
