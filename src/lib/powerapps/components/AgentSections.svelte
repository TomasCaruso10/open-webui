<script lang="ts">
	import type { AgentSection } from '../stores/agentSections';

	export let sections: Record<string, AgentSection> = {};

	let expandedCards: Record<string, boolean> = {};
	let expandedThinking: Record<string, boolean> = {};
	let expandedResult: Record<string, boolean> = {};

	function toggleCard(id: string) {
		expandedCards[id] = !expandedCards[id];
	}

	function toggleThinking(id: string) {
		expandedThinking[id] = !expandedThinking[id];
	}

	function toggleResult(id: string) {
		expandedResult[id] = !expandedResult[id];
	}

	// Auto-expand cards that are still running
	$: sectionList = Object.values(sections);
	$: {
		for (const s of sectionList) {
			if (s.status === 'running' && expandedCards[s.id] === undefined) {
				expandedCards[s.id] = true;
			}
		}
	}
</script>

{#if sectionList.length > 0}
	<div class="flex flex-col gap-2 my-2">
		{#each sectionList as section (section.id)}
			<div
				class="border rounded-lg text-sm transition-all
					{section.status === 'running'
					? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30'
					: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'}"
			>
				<!-- Header (clickable to toggle) -->
				<button
					class="w-full flex items-center justify-between p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
					on:click={() => toggleCard(section.id)}
				>
					<div class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
						<span class="transform transition-transform text-xs {expandedCards[section.id] ? 'rotate-90' : ''}">▶</span>
						{#if section.id.startsWith('web_search')}
							<span>🔍</span>
						{:else if section.id.startsWith('career_research')}
							<span>🎯</span>
						{:else if section.id.startsWith('kb_search')}
							<span>📚</span>
						{:else if section.id.startsWith('job_search')}
							<span>💼</span>
						{:else if section.id.startsWith('report_generator')}
							<span>📋</span>
						{:else}
							<span>⚡</span>
						{/if}
						<span>{section.name}</span>
					</div>
					<span class="text-xs">
						{#if section.status === 'running'}
							<span class="text-blue-500 dark:text-blue-400 animate-pulse">⏳</span>
						{:else}
							<span class="text-green-500 dark:text-green-400">✓</span>
						{/if}
					</span>
				</button>

				{#if expandedCards[section.id]}
					<div class="px-3 pb-3">
						<!-- Status -->
						{#if section.statusText}
							<div class="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
								{#if section.status === 'running'}
									<span class="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
								{/if}
								{section.statusText}
							</div>
						{/if}

						<!-- Thinking (collapsible) -->
						{#if section.thinking}
							<div class="mt-2">
								<button
									class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
									on:click|stopPropagation={() => toggleThinking(section.id)}
								>
									<span class="transform transition-transform {expandedThinking[section.id] ? 'rotate-90' : ''}">▶</span>
									Thinking
								</button>
								{#if expandedThinking[section.id]}
									<pre class="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{section.thinking}</pre>
								{/if}
							</div>
						{/if}

						<!-- Result (collapsible) -->
						{#if section.result}
							<div class="mt-2">
								<button
									class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
									on:click|stopPropagation={() => toggleResult(section.id)}
								>
									<span class="transform transition-transform {expandedResult[section.id] ? 'rotate-90' : ''}">▶</span>
									Agent result
								</button>
								{#if expandedResult[section.id]}
									<pre class="mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{section.result}</pre>
								{/if}
							</div>
						{/if}

						<!-- Citations -->
						{#if section.citations.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each section.citations as citation}
									{#if citation.url}
										<a
											href={citation.url}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full
												bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300
												hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
											on:click|stopPropagation
										>
											📎 {citation.title || citation.url}
										</a>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
