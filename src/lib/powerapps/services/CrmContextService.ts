import { getFolders, getFolderById, createNewFolder } from '$lib/apis/folders';
import { crmContext } from '$lib/powerapps/stores/crmContext';

export class CrmContextService {
    /**
     * Initializes the CRM context based on URL parameters.
     * Supports:
     * - folder_id: The CRM contact GUID (used as reference, NOT as OWUI folder ID).
     * - folder_name: Display name for the folder (optional).
     *
     * Logic:
     * 1. Checks for 'folder_id' (CRM contact GUID).
     * 2. Looks up the user's OWUI folder for this contact using a localStorage cache:
     *    - Cache hit: getFolderById(cachedId) — O(1), fast path.
     *    - Cache miss: getFolders() + filter by name — only on first access per browser.
     *    - Not found: create new folder with a OWUI-generated UUID (no custom ID).
     * 3. Ensures the folder has an associated Knowledge Base linked via folder.data.files.
     *
     * Design:
     * - 1 OWUI folder per orientador per contact (private, user-scoped)
     * - 1 KB per contact CRM (public read+write, shared across orientadores)
     * - KB named by contactGuid to survive contact name changes
     *
     * @param searchParams The URLSearchParams object from the current page.
     * @param token The user's authentication token.
     * @returns An object containing the folderId if a context was found/created.
     */
    static async initCrmContext(searchParams: URLSearchParams, token: string) {
        const folderIdParam = searchParams.get('folder_id'); // CRM contact GUID
        const folderNameParam = searchParams.get('folder_name');
        const noteIdParam = searchParams.get('note_id'); // Report note being edited
        const noteTitleParam = searchParams.get('note_title');

        if (!folderIdParam) {
            // Even without folder, preserve note context if available (report editor without CRM contact)
            if (noteIdParam) {
                console.log('[CrmContextService] No folder_id, but note_id found. Setting note context only.');
                crmContext.set({
                    folder: {
                        contactGuid: '',
                        folderId: '',
                        folderName: '',
                        noteId: noteIdParam,
                        noteTitle: noteTitleParam || undefined
                    }
                });
                return { folderId: '' };
            }
            console.log('[CrmContextService] No folder_id provided. Ignoring context.');
            return null;
        }

        const contactGuid = folderIdParam.replace(/\/$/, '').toLowerCase();
        const displayName = folderNameParam || contactGuid;
        const cacheKey = `serena_folder_${contactGuid}`;

        let targetFolderId: string | null = null;
        let folderData: Record<string, any> | null = null;

        // 1. Cache hit: getFolderById (O(1))
        const cachedFolderId = localStorage.getItem(cacheKey);
        if (cachedFolderId) {
            try {
                const cachedFolder = await getFolderById(token, cachedFolderId);
                if (cachedFolder) {
                    console.log(`[CrmContextService] Found folder from cache: ${cachedFolder.id}`);
                    targetFolderId = cachedFolder.id;
                    folderData = cachedFolder.data || null;
                }
            } catch {
                // Cache stale → continue with fallback
                localStorage.removeItem(cacheKey);
            }
        }

        // 2. Cache miss: getFolders() + filter by name
        if (!targetFolderId) {
            try {
                const allFolders = await getFolders(token);
                const existingFolder = (allFolders || []).find((f: any) => f.name === displayName);
                if (existingFolder) {
                    console.log(`[CrmContextService] Found folder by name: ${existingFolder.id}`);
                    const fullFolder = await getFolderById(token, existingFolder.id);
                    if (fullFolder) {
                        targetFolderId = fullFolder.id;
                        folderData = fullFolder.data || null;
                        localStorage.setItem(cacheKey, targetFolderId);
                    }
                }
            } catch (error) {
                console.warn('[CrmContextService] Error looking up folders:', error);
            }
        }

        // 3. Not found: create new folder with OWUI-generated UUID (no custom id)
        if (!targetFolderId) {
            console.log(`[CrmContextService] Creating new folder: ${displayName}`);
            try {
                const newFolder = await createNewFolder(token, {
                    name: displayName,
                    meta: { contact_id: contactGuid }
                });
                if (newFolder) {
                    targetFolderId = newFolder.id;
                    folderData = newFolder.data || null;
                    localStorage.setItem(cacheKey, targetFolderId);
                }
            } catch (error) {
                console.error('[CrmContextService] Error creating folder:', error);
            }
        }

        // 4. Ensure KB linked + trigger initial sync if KB was just linked
        if (targetFolderId) {
            // Backend handles KB creation + folder linking + initial sync in one call
            await CrmContextService.ensureKnowledgeBase(
                token,
                targetFolderId,
                contactGuid,
                displayName,
                folderData
            );
        }

        // 5. Set CRM context store (survives navigation, never cleared)
        if (targetFolderId) {
            crmContext.set({ folder: { contactGuid, folderId: targetFolderId, folderName: displayName, noteId: noteIdParam || undefined, noteTitle: noteTitleParam || undefined } });
        }

        return { folderId: targetFolderId };
    }

    /**
     * Ensures the folder has a Knowledge Base linked via folder.data.files.
     *
     * Delegates KB creation and folder linking to the backend endpoint
     * POST /serena-api/sync/ensure-contact-kb, which uses admin credentials.
     * This way users don't need workspace.knowledge permissions.
     *
     * The backend also triggers initial SharePoint sync automatically.
     */
    private static async ensureKnowledgeBase(
        token: string,
        folderId: string,
        contactGuid: string,
        contactName: string,
        folderData: Record<string, any> | null
    ): Promise<boolean> {
        try {
            // Quick local check — if KB already linked, skip
            const existingFiles: any[] = folderData?.files || [];
            if (existingFiles.some((f: any) => f.type === 'collection')) {
                console.log('[CrmContextService] KB already linked. Skipping.');
                return false;
            }

            // Delegate to backend (uses admin credentials + triggers sync)
            const baseUrl = window.location.port === '5173' ? 'https://localhost:3000' : '';
            const response = await fetch(`${baseUrl}/serena-api/sync/ensure-contact-kb`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    contact_id: contactGuid,
                    contact_name: contactName,
                    folder_id: folderId
                })
            });

            if (!response.ok) {
                const detail = await response.text();
                console.error(`[CrmContextService] ensure-contact-kb failed: ${response.status}`, detail);
                return false;
            }

            const result = await response.json();
            console.log(`[CrmContextService] KB ensured (${result.kb_id}) + sync started`);
            return true;
        } catch (error) {
            console.error('[CrmContextService] Error ensuring knowledge base:', error);
            return false;
        }
    }

}
