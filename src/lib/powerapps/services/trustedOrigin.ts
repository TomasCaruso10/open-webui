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
