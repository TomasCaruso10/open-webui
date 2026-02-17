import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import path from 'path';

import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	return {
		server: {
			fs: {
				allow: [
					// Allow serving files from the project root
					searchForWorkspaceRoot(process.cwd()),
					// Explicitly allow the .power directory
					path.resolve(__dirname, '.power')
				]
			}
		},

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
			CRM_BASE_URL: JSON.stringify(process.env.CRM_BASE_URL || 'https://inefop-anii.crm.dynamics.com'),
			// crm_override: Expose WEBUI_BASE_URL from env
			WEBUI_URL_OVERRIDE: JSON.stringify(env.WEBUI_BASE_URL || '')
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
