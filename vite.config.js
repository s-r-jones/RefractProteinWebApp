import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

export default defineConfig( {
	server: {
		port: 4000,
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
		watch: {
			// Don't watch template overlay files - they're for scaffolding, not part of the app
			ignored: [ '**/templates/**' ],
		},
		fs: {
			// Deny serving template files - they're for scaffolding, not part of the app
			deny: [ 'templates' ],
		},
	},
	preview: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
	},
	resolve: {
		alias: [
			{
				find: '@',
				replacement: fileURLToPath( new URL( './src', import.meta.url ) ),
			}
		],
		// CRITICAL: Force single instance of Three.js to prevent duplicate currentStack
		dedupe: [ 'three' ],
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
	},
	worker: {
		format: 'es',
	},
	optimizeDeps: {
		// three's Draco/KTX2 loaders locate their decoders with import.meta.url, which pre-bundling breaks
		exclude: [ 'three' ],
	},
	esbuild: {
		// DRACOLoader builds its decoder worker from Function.toString(), renamed identifiers break it
		minifyIdentifiers: false,
	},
} );
