import { getTrustedParentOrigin } from './trustedOrigin';

export interface CrmEventData {
	action: string; // "refresh_timeline", "refresh_form", "open_record"
	entity_name?: string;
	record_id?: string;
	extra?: Record<string, unknown>;
}

export class CrmEventBridge {
	static dispatch(data: CrmEventData): void {
		const origin = getTrustedParentOrigin();
		if (!origin) return; // standalone mode — no bridge to talk to
		window.parent.postMessage({ type: 'crm:event', data }, origin);
	}
}
