import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
	// Load .env file into process.env so define: can access custom vars
	const env = loadEnv(mode, process.cwd(), '');
	Object.assign(process.env, env);
	return {
		plugins: [
			sveltekit(),
			viteStaticCopy({
				targets: [
					{
						src: 'node_modules/onnxruntime-web/dist/*.jsep.*',

						dest: 'wasm'
					}
				]
			})
		],
		define: {
			APP_VERSION: JSON.stringify(process.env.npm_package_version),
			APP_BUILD_HASH: JSON.stringify(process.env.APP_BUILD_HASH || 'dev-build'),
			// crm_override: Expose WEBUI_BASE_URL from env
			WEBUI_URL_OVERRIDE: JSON.stringify(process.env.WEBUI_BASE_URL || ''),
			// crm_override: Serena API base URL (Caddy proxy)
			SERENA_API_BASE_URL: JSON.stringify(process.env.SERENA_API_BASE_URL || '')
			// crm_override: end
		},
		build: {
			sourcemap: true
		},
		worker: {
			format: 'es'
		},
		esbuild: {
			pure: process.env.ENV === 'dev' ? [] : ['console.log', 'console.debug', 'console.error']
		}
	};
});
