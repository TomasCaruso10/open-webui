import { writable, derived } from 'svelte/store';

export interface CrmFolderContext {
	folderId: string;
	folderName: string;
}

export interface CrmContext {
	folder: CrmFolderContext;
	// Extensible: agregar entityType, entityId, etc. en el futuro
}

export const crmContext = writable<CrmContext | null>(null);
export const isCrmEmbedded = derived(crmContext, ($ctx) => $ctx !== null);
