export interface CrmEventData {
	action: string; // "refresh_timeline", "refresh_form", "open_record"
	entity_name?: string;
	record_id?: string;
	extra?: Record<string, unknown>;
}

export class CrmEventBridge {
	static dispatch(data: CrmEventData): void {
		window.parent.postMessage({ type: 'crm:event', data }, '*');
	}
}
