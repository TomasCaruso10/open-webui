import { getFolderById, createNewFolder, updateFolderById } from '$lib/apis/folders';
import { createNewKnowledge } from '$lib/apis/knowledge';
import { crmContext } from '$lib/powerapps/stores/crmContext';

export class CrmContextService {
    /**
     * Initializes the context based on generic URL parameters.
     * Supports:
     * - folder_id: The explicit ID to use for the folder.
     * - folder_name: The display name for the folder (optional).
     *
     * Logic:
     * 1. Checks for 'folder_id'.
     * 2. If missing, logs to console and returns null (context ignored).
     * 3. If present:
     *    - Try to find folder by this exact ID.
     *    - If not found, create new folder with this ID.
     *    - Name defaults to 'folder_name' param, or falls back to the ID itself.
     * 4. Ensures the folder has an associated Knowledge Base:
     *    - If folder.data.files already has a type="collection" item, KB exists — do nothing.
     *    - If no KB linked, create a new one and link it via folder.data.files (native mechanism).
     *
     * @param searchParams The URLSearchParams object from the current page.
     * @param token The user's authentication token.
     * @returns An object containing the folderId if a context was found/created.
     */
    static async initCrmContext(searchParams: URLSearchParams, token: string) {
        let folderIdParam = searchParams.get('folder_id'); // Pure generic approach
        const folderNameParam = searchParams.get('folder_name');

        if (!folderIdParam) {
            console.log('[CrmContextService] No folder_id provided. Ignoring context.');
            return null;
        }

        // Sanitize ID (remove trailing slashes)
        folderIdParam = folderIdParam.replace(/\/$/, '');

        console.log(`[CrmContextService] Initializing with folder_id: ${folderIdParam}`);
        console.log('[CrmContextService] All params:', Object.fromEntries(searchParams.entries()));

        let targetFolderId = null;
        let folderData: Record<string, any> | null = null;
        const displayName = folderNameParam || folderIdParam; // Fallback name to ID if name not provided

        try {
            // 1. Try to find existing folder by ID
            const existingFolder = await getFolderById(token, folderIdParam);

            if (existingFolder) {
                console.log(`[CrmContextService] Found existing folder by ID: ${existingFolder.id}`);
                targetFolderId = existingFolder.id;
                folderData = existingFolder.data || null;
            }
        } catch (error) {
            // getFolderById might throw if 404/error, or return null.
            // We proceed to create if not found.
        }

        // 2. If not found, create it
        if (!targetFolderId) {
            console.log(`[CrmContextService] Creating new folder with ID: ${folderIdParam} and Name: ${displayName}`);
            try {
                const newFolder = await createNewFolder(token, {
                    id: folderIdParam,
                    name: displayName
                });

                if (newFolder) {
                    targetFolderId = newFolder.id;
                    folderData = newFolder.data || null;
                }
            } catch (createError) {
                console.error('[CrmContextService] Error creating generic context folder:', createError);
            }
        }

        // 3. Ensure folder has an associated Knowledge Base
        if (targetFolderId) {
            await CrmContextService.ensureKnowledgeBase(token, targetFolderId, displayName, folderData);
        }

        // Set permanent CRM context store (survives navigation, never cleared)
        if (targetFolderId) {
            crmContext.set({
                folder: { folderId: targetFolderId, folderName: displayName }
            });
        }

        return {
            folderId: targetFolderId
        };
    }

    /**
     * Ensures the folder has a Knowledge Base linked via folder.data.files.
     * Uses Open WebUI's native folder-knowledge mechanism:
     * - KBs are stored in folder.data.files as { type: "collection", id: kb_id, name: kb_name }
     * - The middleware automatically injects folder.data.files into every chat request
     * - If a KB is already linked, this is a no-op
     * - If no KB exists, creates one and links it
     *
     * Access strategy (Feature 5.1):
     * KBs are created with public read+write access (principal_id: "*").
     * - Read grant: makes the KB visible to all authenticated users.
     * - Write grant: allows any user to upload/edit/delete files in the KB.
     * Requires "sharing.public_knowledge" enabled in Open WebUI admin settings.
     * See .CRM_EMBEDDED.md Feature 5.1 for the full rationale and trade-off analysis.
     *
     * @param token Auth token
     * @param folderId The folder ID
     * @param contactName Display name for the KB
     * @param folderData Current folder.data (may be null)
     */
    private static async ensureKnowledgeBase(
        token: string,
        folderId: string,
        contactName: string,
        folderData: Record<string, any> | null
    ): Promise<void> {
        try {
            const existingFiles: any[] = folderData?.files || [];

            // Check if a knowledge base (type="collection") is already linked
            const hasKnowledge = existingFiles.some(
                (file: any) => file.type === 'collection'
            );

            if (hasKnowledge) {
                console.log('[CrmContextService] Knowledge base already linked to folder. Skipping creation.');
                return;
            }

            // Create new Knowledge Base
            console.log(`[CrmContextService] Creating knowledge base for: ${contactName}`);
            const kb = await createNewKnowledge(
                token,
                `Docs: ${contactName}`,
                `Documentos del contacto ${contactName}`,
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

            // Link KB to folder via native folder.data.files mechanism
            const updatedFiles = [
                ...existingFiles,
                { type: 'collection', id: kb.id, name: kb.name }
            ];

            await updateFolderById(token, folderId, {
                data: {
                    ...(folderData || {}),
                    files: updatedFiles
                }
            });

            console.log(`[CrmContextService] Knowledge base linked to folder via data.files.`);
        } catch (error) {
            console.error('[CrmContextService] Error ensuring knowledge base:', error);
            // Non-fatal: folder context still works without KB
        }
    }
}
