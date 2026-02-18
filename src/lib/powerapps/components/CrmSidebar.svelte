<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, getContext, tick, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';

	import {
		user,
		chatId,
		mobile,
		showSidebar,
		showArchivedChats,
		selectedFolder,
		temporaryChatEnabled,
		config,
		isApp,
		sidebarWidth,
		WEBUI_NAME
	} from '$lib/stores';
	import { crmContext } from '$lib/powerapps/stores/crmContext';

	import { getChatListByFolderId } from '$lib/apis/chats';
	import { getFolderById } from '$lib/apis/folders';

	import ChatItem from '$lib/components/layout/Sidebar/ChatItem.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Loader from '$lib/components/common/Loader.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import PencilSquare from '$lib/components/icons/PencilSquare.svelte';
	import SidebarIcon from '$lib/components/icons/Sidebar.svelte';
	import ArchivedChatsModal from '$lib/components/layout/ArchivedChatsModal.svelte';

	import { WEBUI_BASE_URL, WEBUI_API_BASE_URL } from '$lib/constants';

	const i18n = getContext('i18n');

	let folderChats: any[] | null = null;
	let chatListLoading = false;
	let allChatsLoaded = false;
	let page = 1;
	let selectedChatId: string | null = null;
	let shiftKey = false;
	let scrollTop = 0;

	const MIN_WIDTH = 220;
	const MAX_WIDTH = 480;
	let isResizing = false;
	let startWidth = 0;
	let startClientX = 0;

	let unsubscribers: (() => void)[] = [];

	// --- Chat list management ---

	const initFolderChatList = async () => {
		if (!$crmContext?.folder?.folderId) return;
		page = 1;
		allChatsLoaded = false;
		folderChats = await getChatListByFolderId(
			localStorage.token,
			$crmContext.folder.folderId,
			page
		).catch(() => []);
	};

	const loadMoreChats = async () => {
		if (!$crmContext?.folder?.folderId) return;
		chatListLoading = true;
		page += 1;
		const newChats = await getChatListByFolderId(
			localStorage.token,
			$crmContext.folder.folderId,
			page
		).catch(() => []);
		allChatsLoaded = newChats.length === 0;
		folderChats = [...(folderChats ?? []), ...newChats];
		chatListLoading = false;
	};

	// --- New chat handler (preserves CRM folder context) ---

	const crmNewChatHandler = async () => {
		selectedChatId = null;
		// DO NOT clear selectedFolder. Re-set it from crmContext if needed.
		if ($crmContext?.folder?.folderId && !$selectedFolder) {
			const folder = await getFolderById(localStorage.token, $crmContext.folder.folderId);
			if (folder) selectedFolder.set(folder);
		}

		if ($user?.role !== 'admin' && ($user as any)?.permissions?.chat?.temporary_enforced) {
			await temporaryChatEnabled.set(true);
		} else {
			await temporaryChatEnabled.set(false);
		}

		setTimeout(() => {
			if ($mobile) {
				showSidebar.set(false);
			}
		}, 0);
	};

	// --- Resize ---

	const resizeStartHandler = (e: MouseEvent) => {
		if ($mobile) return;
		isResizing = true;
		startClientX = e.clientX;
		startWidth = $sidebarWidth ?? 260;
		document.body.style.userSelect = 'none';
	};

	const resizeEndHandler = () => {
		if (!isResizing) return;
		isResizing = false;
		document.body.style.userSelect = '';
		localStorage.setItem('sidebarWidth', String($sidebarWidth));
	};

	const resizeSidebarHandler = (endClientX: number) => {
		const dx = endClientX - startClientX;
		const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
		sidebarWidth.set(newWidth);
		document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
	};

	// --- Touch gestures ---

	let touchstart: Touch;
	let touchend: Touch;

	function checkDirection() {
		const screenWidth = window.innerWidth;
		const swipeDistance = Math.abs(touchend.screenX - touchstart.screenX);
		if (touchstart.clientX < 40 && swipeDistance >= screenWidth / 8) {
			if (touchend.screenX < touchstart.screenX) {
				showSidebar.set(false);
			}
			if (touchend.screenX > touchstart.screenX) {
				showSidebar.set(true);
			}
		}
	}

	const onTouchStart = (e: TouchEvent) => {
		touchstart = e.changedTouches[0];
	};
	const onTouchEnd = (e: TouchEvent) => {
		touchend = e.changedTouches[0];
		checkDirection();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Shift') shiftKey = true;
	};
	const onKeyUp = (e: KeyboardEvent) => {
		if (e.key === 'Shift') shiftKey = false;
	};
	const onBlur = () => {
		shiftKey = false;
		selectedChatId = null;
	};

	// --- Lifecycle ---

	onMount(async () => {
		try {
			const width = Number(localStorage.getItem('sidebarWidth'));
			if (!Number.isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH) {
				sidebarWidth.set(width);
			}
		} catch {}

		document.documentElement.style.setProperty('--sidebar-width', `${$sidebarWidth}px`);
		sidebarWidth.subscribe((w) => {
			document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
		});

		await showSidebar.set(!$mobile ? localStorage.sidebar === 'true' : false);

		unsubscribers = [
			mobile.subscribe((value) => {
				if ($showSidebar && value) {
					showSidebar.set(false);
				}
			}),
			showSidebar.subscribe(async (value) => {
				localStorage.sidebar = value;
				if (value) {
					await initFolderChatList();
				}
			}),
			chatId.subscribe(() => {
				if ($showSidebar) initFolderChatList();
			})
		];

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('touchstart', onTouchStart);
		window.addEventListener('touchend', onTouchEnd);
		window.addEventListener('blur', onBlur);
	});

	onDestroy(() => {
		for (const unsub of unsubscribers) {
			unsub?.();
		}
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);
		window.removeEventListener('touchstart', onTouchStart);
		window.removeEventListener('touchend', onTouchEnd);
		window.removeEventListener('blur', onBlur);
	});

	const isWindows = /Windows/i.test(navigator.userAgent);
</script>

<ArchivedChatsModal
	bind:show={$showArchivedChats}
	onUpdate={async () => {
		await initFolderChatList();
	}}
/>

<!-- Hidden button for keyboard shortcut compatibility -->
<button
	id="sidebar-new-chat-button"
	class="hidden"
	on:click={() => {
		goto('/');
		crmNewChatHandler();
	}}
/>

<svelte:window
	on:mousemove={(e) => {
		if (!isResizing) return;
		resizeSidebarHandler(e.clientX);
	}}
	on:mouseup={() => {
		resizeEndHandler();
	}}
/>

<!-- Mobile overlay backdrop -->
{#if $showSidebar}
	<div
		class=" {$isApp
			? ' ml-[4.5rem] md:ml-0'
			: ''} fixed md:hidden z-40 top-0 right-0 left-0 bottom-0 bg-black/60 w-full min-h-screen h-screen flex justify-center overflow-hidden overscroll-contain"
		on:mousedown={() => {
			showSidebar.set(!$showSidebar);
		}}
	/>
{/if}

<!-- Collapsed sidebar (slim strip) -->
{#if !$mobile && !$showSidebar}
	<div
		class=" pt-[7px] pb-2 px-2 flex flex-col justify-between text-black dark:text-white hover:bg-gray-50/30 dark:hover:bg-gray-950/30 h-full z-10 transition-all border-e-[0.5px] border-gray-50 dark:border-gray-850/30"
		id="sidebar"
	>
		<button
			class="flex flex-col flex-1 {isWindows ? 'cursor-pointer' : 'cursor-[e-resize]'}"
			on:click={async () => {
				showSidebar.set(!$showSidebar);
			}}
		>
			<div class="pb-1.5">
				<Tooltip
					content={$i18n.t('Open Sidebar')}
					placement="right"
				>
					<button
						class="flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition group {isWindows
							? 'cursor-pointer'
							: 'cursor-[e-resize]'}"
						aria-label={$i18n.t('Open Sidebar')}
					>
						<div class=" self-center flex items-center justify-center size-9">
							<img
								src="{WEBUI_BASE_URL}/static/favicon.png"
								class="sidebar-new-chat-icon size-6 rounded-full group-hover:hidden"
								alt=""
							/>
							<SidebarIcon className="size-5 hidden group-hover:flex" />
						</div>
					</button>
				</Tooltip>
			</div>

			<div class="-mt-[0.5px]">
				<Tooltip content={$i18n.t('New Chat')} placement="right">
					<a
						class=" cursor-pointer flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition group"
						href="/"
						draggable="false"
						on:click={async (e) => {
							e.stopImmediatePropagation();
							e.preventDefault();
							goto('/');
							crmNewChatHandler();
						}}
						aria-label={$i18n.t('New Chat')}
					>
						<div class=" self-center flex items-center justify-center size-9">
							<PencilSquare className="size-4.5" />
						</div>
					</a>
				</Tooltip>
			</div>
		</button>

		<div>
			<div class=" py-2 flex justify-center items-center">
				{#if $user !== undefined && $user !== null}
					<UserMenu
						role={$user?.role}
						profile={$config?.features?.enable_user_status ?? true}
						showActiveUsers={false}
						on:show={(e) => {
							if (e.detail === 'archived-chat') {
								showArchivedChats.set(true);
							}
						}}
					>
						<div
							class=" cursor-pointer flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition group"
						>
							<div class="self-center relative">
								<img
									src={`${WEBUI_API_BASE_URL}/users/${$user?.id}/profile/image`}
									class=" size-7 object-cover rounded-full"
									alt={$i18n.t('Open User Profile Menu')}
									aria-label={$i18n.t('Open User Profile Menu')}
								/>
							</div>
						</div>
					</UserMenu>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Expanded sidebar -->
{#if $showSidebar}
	<div
		id="sidebar"
		class="h-screen max-h-[100dvh] min-h-screen select-none {$showSidebar
			? `${$mobile ? 'bg-gray-50 dark:bg-gray-950' : 'bg-gray-50/70 dark:bg-gray-950/70'} z-50`
			: ' bg-transparent z-0 '} {$isApp
			? `ml-[4.5rem] md:ml-0 `
			: ' transition-all duration-300 '} shrink-0 text-gray-900 dark:text-gray-200 text-sm fixed top-0 left-0 overflow-x-hidden"
		transition:slide={{ duration: 250, axis: 'x' }}
		data-state={$showSidebar}
	>
		<div
			class=" my-auto flex flex-col justify-between h-screen max-h-[100dvh] w-[var(--sidebar-width)] overflow-x-hidden scrollbar-hidden z-50 {$showSidebar
				? ''
				: 'invisible'}"
		>
			<!-- Header: Folder name + controls -->
			<div
				class="sidebar px-[0.5625rem] pt-2 pb-1.5 flex justify-between space-x-1 text-gray-600 dark:text-gray-400 sticky top-0 z-10 -mb-3"
			>
				<a
					class="flex items-center rounded-xl size-8.5 h-full justify-center hover:bg-gray-100/50 dark:hover:bg-gray-850/50 transition no-drag-region"
					href="/"
					draggable="false"
					on:click={crmNewChatHandler}
				>
					<img
						crossorigin="anonymous"
						src="{WEBUI_BASE_URL}/static/favicon.png"
						class="sidebar-new-chat-icon size-6 rounded-full"
						alt=""
					/>
				</a>

				<a href="/" class="flex flex-1 px-1.5" on:click={crmNewChatHandler}>
					<div
						id="sidebar-webui-name"
						class=" self-center font-medium text-gray-850 dark:text-white font-primary truncate"
					>
						{$crmContext?.folder?.folderName ?? $WEBUI_NAME}
					</div>
				</a>

				<Tooltip
					content={$showSidebar ? $i18n.t('Close Sidebar') : $i18n.t('Open Sidebar')}
					placement="bottom"
				>
					<button
						class="flex rounded-xl size-8.5 justify-center items-center hover:bg-gray-100/50 dark:hover:bg-gray-850/50 transition {isWindows
							? 'cursor-pointer'
							: 'cursor-[w-resize]'}"
						on:click={() => {
							showSidebar.set(!$showSidebar);
						}}
						aria-label={$showSidebar ? $i18n.t('Close Sidebar') : $i18n.t('Open Sidebar')}
					>
						<div class=" self-center p-1.5">
							<SidebarIcon />
						</div>
					</button>
				</Tooltip>

				<div
					class="{scrollTop > 0
						? 'visible'
						: 'invisible'} sidebar-bg-gradient-to-b bg-linear-to-b from-gray-50 dark:from-gray-950 to-transparent from-50% pointer-events-none absolute inset-0 -z-10 -mb-6"
				></div>
			</div>

			<!-- Scrollable content -->
			<div
				class="relative flex flex-col flex-1 overflow-y-auto scrollbar-hidden pt-3 pb-3"
				on:scroll={(e) => {
					scrollTop = e.target.scrollTop ?? 0;
				}}
			>
				<!-- New Chat button -->
				<div class="pb-1.5">
					<div class="px-[0.4375rem] flex justify-center text-gray-800 dark:text-gray-200">
						<a
							id="sidebar-new-chat-button-visible"
							class="group grow flex items-center space-x-3 rounded-2xl px-2.5 py-2 hover:bg-gray-100 dark:hover:bg-gray-900 transition outline-none"
							href="/"
							draggable="false"
							on:click={crmNewChatHandler}
							aria-label={$i18n.t('New Chat')}
						>
							<div class="self-center">
								<PencilSquare className=" size-4.5" strokeWidth="2" />
							</div>

							<div class="flex flex-1 self-center translate-y-[0.5px]">
								<div class=" self-center text-sm font-primary">{$i18n.t('New Chat')}</div>
							</div>
						</a>
					</div>
				</div>

				<!-- Folder chats list -->
				<div class="flex-1 flex flex-col overflow-y-auto scrollbar-hidden">
					<div class="pt-1.5">
						{#if folderChats !== null}
							{#if folderChats.length === 0}
								<div class="w-full flex justify-center py-4 text-xs text-gray-500">
									{$i18n.t('No chats yet')}
								</div>
							{:else}
								{#each folderChats as chat, idx (`crm-chat-${chat?.id ?? idx}`)}
									{#if idx === 0 || (idx > 0 && chat.time_range !== folderChats[idx - 1].time_range)}
										<div
											class="w-full pl-2.5 text-xs text-gray-500 dark:text-gray-500 font-medium {idx === 0
												? ''
												: 'pt-5'} pb-1.5"
										>
											{$i18n.t(chat.time_range)}
										</div>
									{/if}

									<ChatItem
										className=""
										id={chat.id}
										title={chat.title}
										createdAt={chat.created_at}
										{shiftKey}
										selected={selectedChatId === chat.id}
										on:select={() => {
											selectedChatId = chat.id;
										}}
										on:unselect={() => {
											selectedChatId = null;
										}}
										on:change={async () => {
											await initFolderChatList();
										}}
										on:tag={() => {}}
									/>
								{/each}

								{#if !allChatsLoaded}
									<Loader
										on:visible={() => {
											if (!chatListLoading) {
												loadMoreChats();
											}
										}}
									>
										<div
											class="w-full flex justify-center py-1 text-xs animate-pulse items-center gap-2"
										>
											<Spinner className=" size-4" />
											<div class=" ">{$i18n.t('Loading...')}</div>
										</div>
									</Loader>
								{/if}
							{/if}
						{:else}
							<div
								class="w-full flex justify-center py-1 text-xs animate-pulse items-center gap-2"
							>
								<Spinner className=" size-4" />
								<div class=" ">{$i18n.t('Loading...')}</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- User menu (bottom) -->
			<div class="px-1.5 pt-1.5 pb-2 sticky bottom-0 z-10 -mt-3 sidebar">
				<div
					class=" sidebar-bg-gradient-to-t bg-linear-to-t from-gray-50 dark:from-gray-950 to-transparent from-50% pointer-events-none absolute inset-0 -z-10 -mt-6"
				></div>
				<div class="flex flex-col font-primary">
					{#if $user !== undefined && $user !== null}
						<UserMenu
							role={$user?.role}
							profile={$config?.features?.enable_user_status ?? true}
							showActiveUsers={false}
							on:show={(e) => {
								if (e.detail === 'archived-chat') {
									showArchivedChats.set(true);
								}
							}}
						>
							<div
								class=" flex items-center rounded-2xl py-2 px-1.5 w-full hover:bg-gray-100/50 dark:hover:bg-gray-900/50 transition"
							>
								<div class=" self-center mr-3 relative">
									<img
										src={`${WEBUI_API_BASE_URL}/users/${$user?.id}/profile/image`}
										class=" size-7 object-cover rounded-full"
										alt={$i18n.t('Open User Profile Menu')}
										aria-label={$i18n.t('Open User Profile Menu')}
									/>

									{#if $config?.features?.enable_user_status}
										<div class="absolute -bottom-0.5 -right-0.5">
											<span class="relative flex size-2.5">
												<span
													class="relative inline-flex size-2.5 rounded-full {true
														? 'bg-green-500'
														: 'bg-gray-300 dark:bg-gray-700'} border-2 border-white dark:border-gray-900"
												></span>
											</span>
										</div>
									{/if}
								</div>
								<div class=" self-center font-medium">{$user?.name}</div>
							</div>
						</UserMenu>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Resize handle -->
	{#if !$mobile}
		<div
			class="relative flex items-center justify-center group border-l border-gray-50 dark:border-gray-850/30 hover:border-gray-200 dark:hover:border-gray-800 transition z-20"
			id="sidebar-resizer"
			on:mousedown={resizeStartHandler}
			role="separator"
		>
			<div
				class=" absolute -left-1.5 -right-1.5 -top-0 -bottom-0 z-20 cursor-col-resize bg-transparent"
			/>
		</div>
	{/if}
{/if}
