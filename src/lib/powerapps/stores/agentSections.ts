export interface Citation {
	url: string;
	title: string;
	content?: string;
}

export interface AgentSection {
	id: string;
	name: string;
	status: 'running' | 'completed';
	thinking: string;
	statusText: string;
	citations: Citation[];
	result: string;
}

export interface AgentEventData {
	type: 'start' | 'thinking_start' | 'thinking_delta' | 'thinking_end' | 'status' | 'citations' | 'result' | 'end';
	id: string;
	name?: string;
	content?: string;
	description?: string;
	sources?: Citation[];
}
