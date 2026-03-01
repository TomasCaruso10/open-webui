import type { AgentEventData, AgentSection } from '../stores/agentSections';

export class AgentEventHandler {
	static handle(data: AgentEventData, message: any): void {
		if (!message.agentSections) {
			message.agentSections = {} as Record<string, AgentSection>;
		}

		const sections = message.agentSections as Record<string, AgentSection>;

		switch (data.type) {
			case 'start':
				sections[data.id] = {
					id: data.id,
					name: data.name ?? data.id,
					status: 'running',
					thinking: '',
					statusText: '',
					citations: [],
					result: ''
				};
				break;

			case 'thinking_start':
				if (sections[data.id]) {
					sections[data.id].thinking += data.content ?? '';
				}
				break;

			case 'thinking_delta':
				if (sections[data.id]) {
					sections[data.id].thinking += data.content ?? '';
				}
				break;

			case 'thinking_end':
				// No-op, thinking is accumulated
				break;

			case 'status':
				if (sections[data.id]) {
					sections[data.id].statusText = data.description ?? '';
				}
				break;

			case 'citations':
				if (sections[data.id] && data.sources) {
					sections[data.id].citations.push(...data.sources);
				}
				break;

			case 'result':
				if (sections[data.id]) {
					sections[data.id].result = data.content ?? '';
				}
				break;

			case 'end':
				if (sections[data.id]) {
					sections[data.id].status = 'completed';
					sections[data.id].statusText = '';
				}
				break;
		}

		// Trigger Svelte reactivity by creating a new reference
		message.agentSections = { ...sections };
	}
}
