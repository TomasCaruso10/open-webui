<script lang="ts">
	/**
	 * ReportEditor — two-panel layout for editing reports.
	 *
	 * Left panel: NoteEditor (full OWUI note editor with all features)
	 * Right panel: Chat via iframe (per-orientador: owner sees original chat,
	 *              others get their own persistent chat stored in note.meta.editor_chats)
	 * Top bar: Finalize button, status badge
	 *
	 * Auth relay: The ReportEditor acts as an auth bridge for the chat iframe.
	 * When the iframe sends 'auth:ready' or 'auth:renew', we reply with the
	 * current localStorage token — same protocol as the CRM bridge.
	 */
	import { onMount, onDestroy, getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { SERENA_API_URL } from '$lib/constants';
	import { user } from '$lib/stores';
	import { getNoteById, updateNoteById } from '$lib/apis/notes';
	import { createNewChat } from '$lib/apis/chats';

	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';

	export let id: string;
	export let chatId: string | null = null;

	let finalizing = false;
	let status: 'borrador' | 'finalizado' = 'borrador';
	let chatIframe: HTMLIFrameElement;
	let resolvedChatId: string | null = null;
	let chatReady = false;

	const i18n = getContext('i18n');

	// ── Resolve which chat to show per-orientador ──
	async function resolveEditorChat(token: string): Promise<string | null> {
		if (!chatId) return null;

		try {
			const note = await getNoteById(token, id);
			if (!note) return chatId;

			const userId = $user?.id;
			if (!userId) return chatId;

			// Owner of the note → use original chat
			if (note.user_id === userId) return chatId;

			// Non-owner: check for existing editor chat
			const editorChats = note.meta?.editor_chats as Record<string, string> | undefined;
			if (editorChats?.[userId]) return editorChats[userId];

			// First time: create a new chat for this orientador
			const newChat = await createNewChat(token, { chat: {} }, null);
			if (!newChat?.id) return null;

			// Persist the association in note meta
			await updateNoteById(token, id, {
				meta: {
					editor_chats: { ...(editorChats || {}), [userId]: newChat.id }
				}
			});

			return newChat.id;
		} catch (e) {
			console.warn('[report-editor] Could not resolve editor chat:', e);
			return chatId;
		}
	}

	// ── Auth relay: act as bridge for the chat iframe ──
	// When the chat iframe sends auth:ready/auth:renew, we reply with our token.
	// This mimics the CRM bridge protocol so the iframe authenticates normally.
	function handleMessage(event: MessageEvent) {
		const type = event.data?.type;
		if (type !== 'auth:ready' && type !== 'auth:renew') return;

		const token = localStorage.getItem('token');
		if (!token) {
			console.warn('[report-editor] No token in localStorage to relay');
			return;
		}

		// Reply to the iframe that sent the message
		const source = event.source as WindowProxy;
		if (source) {
			console.log(`[report-editor] Relaying ${type} → auth:token`);
			source.postMessage(
				{ type: 'auth:token', token, theme: localStorage.getItem('theme') || 'light' },
				'*'
			);
		}
	}

	onMount(async () => {
		window.addEventListener('message', handleMessage);

		const token = localStorage.getItem('token') || '';

		// Resolve per-orientador chat + fetch report status in parallel
		const [editorChatId] = await Promise.all([
			resolveEditorChat(token),
			(async () => {
				try {
					const res = await fetch(`${SERENA_API_URL}/report/${id}/status`, {
						headers: { 'Authorization': `Bearer ${token}` }
					});
					if (res.ok) {
						const data = await res.json();
						status = data.status === 'finalizado' ? 'finalizado' : 'borrador';
					}
				} catch (e) {
					console.warn('[report-editor] Could not fetch report status:', e);
				}
			})()
		]);

		resolvedChatId = editorChatId;
		chatReady = true;
	});

	onDestroy(() => {
		window.removeEventListener('message', handleMessage);
	});

	// ── Finalize handler ──
	async function handleFinalize() {
		if (finalizing) return;
		finalizing = true;

		try {
			const token = localStorage.getItem('token') || '';
			const res = await fetch(`${SERENA_API_URL}/report/${id}/finalize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ oauth_token: token })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
				throw new Error(err.detail || `HTTP ${res.status}`);
			}

			status = 'finalizado';
			toast.success('Informe finalizado. PDF generado y guardado en el CRM.');
		} catch (e) {
			toast.error(`Error al finalizar: ${e.message}`);
		} finally {
			finalizing = false;
		}
	}
</script>

<div class="report-editor h-screen w-full flex flex-col bg-white dark:bg-gray-900">
	<!-- Top action bar -->
	<div class="report-topbar flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
		<div class="flex items-center gap-3">
			<span class="text-sm font-medium text-gray-600 dark:text-gray-300">
				Informe de Orientacion
			</span>
			<span
				class="text-xs px-2 py-0.5 rounded-full {status === 'finalizado'
					? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
					: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}"
			>
				{status === 'finalizado' ? 'Finalizado' : 'Borrador'}
			</span>
		</div>

		<div class="flex items-center gap-2">
			<button
				class="px-4 py-1.5 text-sm font-medium rounded-lg transition-colors
					{finalizing
						? 'bg-gray-300 text-gray-500 cursor-wait'
						: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'}"
				on:click={handleFinalize}
				disabled={finalizing}
			>
				{#if finalizing}
					Finalizando...
				{:else}
					Finalizar y exportar PDF
				{/if}
			</button>
		</div>
	</div>

	<!-- Two-panel layout -->
	<div class="flex-1 flex min-h-0">
		<!-- Left: Note editor -->
		<div class="flex-1 min-w-0 overflow-hidden">
			<NoteEditor {id} {chatId} collaboration={false} />
		</div>

		<!-- Right: Chat via iframe (per-orientador, auth relayed by this component) -->
		{#if chatReady && resolvedChatId}
			<div class="w-[400px] shrink-0 border-l border-gray-200 dark:border-gray-700">
				<iframe
					bind:this={chatIframe}
					src="/c/{resolvedChatId}?embed=true"
					title="Chat"
					class="w-full h-full border-0"
					allow="clipboard-write"
				/>
			</div>
		{/if}
	</div>
</div>
