// svelte.config.js
import adapter from '@sveltejs/adapter-static'; // Use adapter-static
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            // Ensure output matches Netlify's expected publish directory:
            // This adapter outputs directly to the 'pages' path relative to project root.
            // BUT Netlify expects it inside .svelte-kit for its build cache.
            // Let's adjust Netlify *or* the adapter output.
            // Easiest might be to keep Netlify setting and use adapter-netlify?

            // Option A: Try adapter-netlify, force static
            // npm install -D @sveltejs/adapter-netlify
            // import adapter from '@sveltejs/adapter-netlify';
            // adapter: adapter({ edge: false }) // Force serverless/static, not edge

            // Option B: If sticking with adapter-static
            pages: 'build', // Default output dir for adapter-static
            assets: 'build',
            fallback: 'index.html', // Essential for SPA on Netlify
            precompress: false
        })
        // NO paths.base
    }
};
export default config;