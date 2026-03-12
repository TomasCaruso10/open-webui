import { getFolders, getFolderById, createNewFolder, updateFolderById } from '$lib/apis/folders';
import { createNewKnowledge, getKnowledgeBases } from '$lib/apis/knowledge';
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

        if (!folderIdParam) {
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

        // 4. Ensure KB linked
        if (targetFolderId) {
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
            crmContext.set({ folder: { contactGuid, folderId: targetFolderId, folderName: displayName } });
        }

        return { folderId: targetFolderId };
    }

    /**
     * Ensures the folder has a Knowledge Base linked via folder.data.files.
     * Uses Open WebUI's native folder-knowledge mechanism:
     * - KBs are stored in folder.data.files as { type: "collection", id: kb_id, name: kb_name }
     * - The middleware automatically injects folder.data.files into every chat request
     * - If a KB is already linked, this is a no-op
     * - If no KB exists for this contactGuid, creates one and links it
     *
     * KB naming: name is the contact's display name (readable), description is
     * `contact:${contactGuid}` (stable GUID-based matching key).
     *
     * Access strategy (Feature 5.1):
     * KBs are created with public read+write access (principal_id: "*").
     * - Read grant: makes the KB visible to all authenticated users.
     * - Write grant: allows any user to upload/edit/delete files in the KB.
     * Requires "sharing.public_knowledge" enabled in Open WebUI admin settings.
     *
     * @param token Auth token
     * @param folderId The OWUI folder ID
     * @param contactGuid CRM contact GUID (used for KB name — stable identifier)
     * @param contactName Display name for the KB description
     * @param folderData Current folder.data (may be null)
     */
    private static async ensureKnowledgeBase(
        token: string,
        folderId: string,
        contactGuid: string,
        contactName: string,
        folderData: Record<string, any> | null
    ): Promise<void> {
        try {
            const existingFiles: any[] = folderData?.files || [];

            // Check 1: KB already linked in folder.data.files
            const linkedKb = existingFiles.find((f: any) => f.type === 'collection');
            if (linkedKb) {
                console.log('[CrmContextService] Knowledge base already linked to folder. Skipping creation.');
                return;
            }

            // Check 2: KB exists in OWUI but not linked (update may have silently failed before)
            // Match by description "contact:{guid}" for stable GUID-based lookup
            const expectedKbDesc = `contact:${contactGuid}`;
            const legacyKbName = `Docs: ${contactGuid}`;
            let existingKb: any = null;
            try {
                const allKbs = await getKnowledgeBases(token);
                const kbList: any[] = Array.isArray(allKbs) ? allKbs : (allKbs?.items || []);
                existingKb = kbList.find((kb: any) => kb.description === expectedKbDesc);
                // Fallback: match by legacy name for KBs created before this change
                if (!existingKb) {
                    existingKb = kbList.find((kb: any) => kb.name === legacyKbName);
                }
            } catch (e) {
                console.warn('[CrmContextService] Could not fetch knowledge bases:', e);
            }

            let kbToLink = existingKb;

            if (!kbToLink) {
                // Create new Knowledge Base
                console.log(`[CrmContextService] Creating knowledge base for: ${contactName}`);
                const kb = await createNewKnowledge(
                    token,
                    contactName,
                    expectedKbDesc,
                    [
                        // Public read + write: all authenticated users can see and upload files to CRM KBs.
                        // Read is required for visibility; write enables file uploads.
                        // IMPORTANT: Requires "sharing.public_knowledge" permission enabled in Open WebUI admin settings,
                        // otherwise the backend silently strips all grants (see knowledge.py create endpoint).
                        // See Feature 5.1 in .CRM_EMBEDDED.md for full rationale.
                        { principal_type: 'user', principal_id: '*', permission: 'read' },
                        { principal_type: 'user', principal_id: '*', permission: 'write' }
                    ]
                );

                if (!kb || !kb.id) {
                    console.error('[CrmContextService] Failed to create knowledge base.');
                    return;
                }

                console.log(`[CrmContextService] Knowledge base created with ID: ${kb.id}`);
                kbToLink = kb;
            } else {
                console.log(`[CrmContextService] Found existing unlinked KB: ${kbToLink.id}`);
            }

            // Link KB to folder via native folder.data.files mechanism
            const updatedFiles = [
                ...existingFiles,
                { type: 'collection', id: kbToLink.id, name: kbToLink.name }
            ];

            const updatedFolder = await updateFolderById(token, folderId, {
                data: {
                    ...(folderData || {}),
                    files: updatedFiles
                }
            });

            if (!updatedFolder) {
                console.error('[CrmContextService] updateFolderById returned null — folder.data may not have persisted.');
            } else {
                console.log('[CrmContextService] Knowledge base linked to folder via data.files.');
            }
        } catch (error) {
            console.error('[CrmContextService] Error ensuring knowledge base:', error);
            // Non-fatal: folder context still works without KB
        }
    }
}
