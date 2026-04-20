// Centralized trusted parent origin for postMessage security.
// Set once during auth handshake (when bridge sends first auth:token),
// used by crmAuth.ts and CrmEventBridge.ts to restrict postMessage targets.
//
// In standalone mode (no CRM iframe), this stays null and postMessages
// to the parent are silently skipped.

let _origin: string | null = null;

export function setTrustedParentOrigin(origin: string): void {
	_origin = origin;
}

export function getTrustedParentOrigin(): string | null {
	return _origin;
}

// ──────────────────────────────────────────────────────────────
// Origin whitelist validation (used during auth handshake)
// ──────────────────────────────────────────────────────────────

// Microsoft-owned domains that host CRM / Power Apps iframes. The wildcard
// subdomains cover every tenant / region / product surface that may embed us
// (e.g. *.crm.dynamics.com, make.powerapps.com, <tenant>.sharepoint.com).
const MICROSOFT_ORIGIN_PATTERNS: readonly RegExp[] = [
	/^https:\/\/([a-z0-9-]+\.)*(dynamics|powerapps|microsoft|office|sharepoint)\.com$/i
];

// Dev-only origins. Included unconditionally: nobody should be loading the
// SPA from localhost/ngrok in production, and if someone does, they are
// exploiting their own browser — not a vector for cross-origin attacks.
const DEV_ORIGIN_PATTERNS: readonly RegExp[] = [
	/^https?:\/\/localhost(:\d+)?$/i,
	/^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
	/^https:\/\/([a-z0-9-]+\.)*ngrok-free\.app$/i
];

/**
 * crm_override: Returns true iff `origin` is in the trusted whitelist.
 *
 * Whitelist composition:
 * - Microsoft-hosted CRM / Power Apps surfaces (wildcard subdomains of
 *   dynamics.com, powerapps.com, microsoft.com, office.com, sharepoint.com).
 * - The SPA's own origin (same-origin iframe is fine — this is the normal
 *   case in production where OWUI and the bridge are both served from the
 *   configured domain).
 * - Dev origins (localhost / ngrok-free.app) — harmless in production.
 *
 * This is the GATE for `setTrustedParentOrigin` during the auth handshake.
 * Do NOT use it to validate messages AFTER the trusted origin has been
 * pinned — once pinned, compare directly against `getTrustedParentOrigin()`.
 */
export function isOriginTrusted(origin: string): boolean {
	if (!origin || typeof origin !== 'string') return false;

	// Same-origin is always trusted (e.g. OWUI <-> OWUI served from one domain).
	if (typeof window !== 'undefined' && origin === window.location.origin) {
		return true;
	}

	for (const pattern of MICROSOFT_ORIGIN_PATTERNS) {
		if (pattern.test(origin)) return true;
	}
	for (const pattern of DEV_ORIGIN_PATTERNS) {
		if (pattern.test(origin)) return true;
	}

	return false;
}
