// svelte.config.js
import adapter from '@sveltejs/adapter-auto'; // Use adapter-auto
// OR: import adapter from '@sveltejs/adapter-netlify'; // If using adapter-netlify explicitly
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    kit: {
        // Use adapter-auto (automatically detects Netlify)
        adapter: adapter(),
    }
};

export default config;