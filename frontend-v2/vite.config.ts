import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	server: {
		proxy: {
			'/api': 'http://localhost:8000',
			'/ws': {
				target: 'ws://localhost:8000',
				ws: true
			}
		}
	}
});
