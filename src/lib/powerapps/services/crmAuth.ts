// crm_override: CRM authentication service for Power Apps Code App context.
// Calls the Dataverse Custom API (AuthPlugin) to obtain a JWT
// compatible with Open WebUI, using the generated MicrosoftDataverseService.

import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from './MicrosoftDataverseService';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface CrmAuthResult {
    token: string;
    expiresAt: string;
    userId: string;
}

// crm_override: Custom API name registered in Dataverse.
const CRM_CUSTOM_API_NAME = 'aut_GetSsoToken';

// ──────────────────────────────────────────────────────────────
// Pre-auth: receive token from iframe bridge (parent)
// ──────────────────────────────────────────────────────────────

/**
 * crm_override: Listens for a pre-auth token sent by the iframe bridge (ChatWidgetJS).
 *
 * The bridge starts fetching the SSO token in parallel with the SPA load.
 * This function signals readiness via postMessage('auth:ready') and waits
 * for the bridge to reply with { type: 'auth:token', token: string }.
 *
 * Returns the JWT string, or null if the bridge doesn't respond within timeoutMs.
 */
export function listenForPreAuthToken(timeoutMs = 5000): Promise<string | null> {
    return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
            resolved = true;
            window.removeEventListener('message', handler);
        };

        const handler = (event: MessageEvent) => {
            if (resolved) return;
            if (event.data?.type !== 'auth:token') return;

            console.log('[pre-auth] Received token from bridge');
            cleanup();
            resolve(event.data.token ?? null);
        };

        window.addEventListener('message', handler);

        // Signal to the bridge that we're ready to receive the token
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'auth:ready' }, '*');
            console.log('[pre-auth] Sent auth:ready to parent');
        }

        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                console.log('[pre-auth] Timed out waiting for bridge token');
                cleanup();
                resolve(null);
            }
        }, timeoutMs);
    });
}

// ──────────────────────────────────────────────────────────────
// Context detection
// ──────────────────────────────────────────────────────────────

/**
 * crm_override: Detects if we are running inside the Power Apps Code App context.
 *
 * We rely on the public SDK's getContext() which communicates via the bridge.
 * If we're not inside the Power Apps host, it will timeout.
 */
export async function isCodeAppContext(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Quick check: Code Apps run in an iframe inside the player
    if (window === window.parent) return false;

    try {
        // Try getting context using the public SDK
        // This will fail (timeout) if not in the host
        const ctx = await Promise.race([
            getContext(),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 1000)
            )
        ]);
        return !!ctx;
    } catch {
        return false;
    }
}

// ──────────────────────────────────────────────────────────────
// Custom API call via MicrosoftDataverseService
// ──────────────────────────────────────────────────────────────

/**
 * crm_override: Calls the Dataverse Custom API (aut_GetSsoToken) to obtain a JWT.
 *
 * Uses the generated MicrosoftDataverseService which internally handles:
 * 1. Token acquisition via AppIdentityServicePlugin
 * 2. Batch header construction
 * 3. HTTP proxy via AppHttpClientPlugin.sendHttpAsync
 */
export async function requestCrmToken(): Promise<CrmAuthResult> {
    console.log(`[crm_override] Calling Custom API: ${CRM_CUSTOM_API_NAME}`);

    const result = await MicrosoftDataverseService.PerformUnboundActionWithOrganization(
        CRM_BASE_URL,
        CRM_CUSTOM_API_NAME
    );

    console.log('[crm_override] PerformUnboundAction result:', result);

    // The result shape is IOperationResult<Record<string, unknown>>
    // The actual response data may be in result.value or directly in result
    const data = result.data;

    // The Custom API returns EntraSessionToken (PascalCase from C# plugin)
    const entraToken = (data?.EntraSessionToken ?? data?.entraSessionToken) as string | undefined;

    if (!entraToken) {
        console.error('[crm_override] Full response:', JSON.stringify(result));
        throw new Error('[crm_override] Response missing EntraSessionToken');
    }

    const expiresAt = (data?.expiresAt as string) ?? '';
    const userId = (data?.impersonatedUserId as string) ?? '';

    console.log('[crm_override] CRM token obtained successfully');
    return { token: entraToken, expiresAt, userId };
}
