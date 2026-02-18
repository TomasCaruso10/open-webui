import { getFolderById, createNewFolder } from '$lib/apis/folders';
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
        const displayName = folderNameParam || folderIdParam; // Fallback name to ID if name not provided

        try {
            // 1. Try to find existing folder by ID
            const existingFolder = await getFolderById(token, folderIdParam);

            if (existingFolder) {
                console.log(`[CrmContextService] Found existing folder by ID: ${existingFolder.id}`);
                targetFolderId = existingFolder.id;
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
                }
            } catch (createError) {
                console.error('[CrmContextService] Error creating generic context folder:', createError);
            }
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
}
