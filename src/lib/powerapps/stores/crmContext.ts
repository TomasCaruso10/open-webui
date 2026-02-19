import { writable, derived } from 'svelte/store';

export interface CrmFolderContext {
	folderId: string;
	folderName: string;
}

export interface CrmContext {
	folder: CrmFolderContext;
	// Extensible: agregar entityType, entityId, etc. en el futuro
}

const SESSION_KEY = 'crmContext';

/**
 * Hydrate CRM context from sessionStorage on module load.
 * This allows the context to survive iframe reloads (F5) without
 * depending on URL params that are only set once by the PowerApps bridge.
 *
 * sessionStorage is per-tab, so two contacts open in parallel
 * each maintain their own independent context.
 */
function loadFromSession(): CrmContext | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

// Create writable store, initialized from sessionStorage (or null on first load)
const _crmContext = writable<CrmContext | null>(loadFromSession());

// Persist every change to sessionStorage automatically
if (typeof window !== 'undefined') {
	_crmContext.subscribe((value) => {
		try {
			if (value) {
				sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
			} else {
				sessionStorage.removeItem(SESSION_KEY);
			}
		} catch {
			/* sessionStorage full or unavailable — non-fatal */
		}
	});
}

export const crmContext = _crmContext;
export const isCrmEmbedded = derived(crmContext, ($ctx) => $ctx !== null);
