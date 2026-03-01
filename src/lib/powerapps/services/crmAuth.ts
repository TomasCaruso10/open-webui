// crm_override: CRM authentication service.
// Handles pre-auth token relay from the iframe bridge (ChatWidgetJS)
// and token renewal via postMessage.

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
// Token renewal via postMessage
// ──────────────────────────────────────────────────────────────

/**
 * crm_override: Requests a fresh token from the iframe bridge.
 *
 * Sends { type: 'auth:renew' } to the parent window and waits for
 * the bridge to reply with { type: 'auth:token', token: string }.
 *
 * Returns the JWT string, or null if the bridge doesn't respond within timeoutMs.
 */
export function requestTokenRenewal(timeoutMs = 10000): Promise<string | null> {
    return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
            resolved = true;
            window.removeEventListener('message', handler);
        };

        const handler = (event: MessageEvent) => {
            if (resolved) return;
            if (event.data?.type !== 'auth:token') return;

            console.log('[pre-auth] Received renewed token from bridge');
            cleanup();
            resolve(event.data.token ?? null);
        };

        window.addEventListener('message', handler);

        // Request renewal from the bridge
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'auth:renew' }, '*');
            console.log('[pre-auth] Sent auth:renew to parent');
        } else {
            // Not in an iframe, cannot renew
            cleanup();
            resolve(null);
            return;
        }

        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                console.log('[pre-auth] Token renewal timed out');
                cleanup();
                resolve(null);
            }
        }, timeoutMs);
    });
}
