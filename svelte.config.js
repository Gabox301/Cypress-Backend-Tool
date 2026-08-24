import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  vitePlugin: {
    inspector: true,
    dynamicCompileOptions: ({ filename }) => {
      if (!filename.includes('node_modules')) return { runes: true };
    },
  },
  onwarn: (warning, handler) => {
    if (warning.code === 'a11y_click_events_have_key_events') return;
    if (warning.code === 'a11y_no_static_element_interactions') return;
    handler(warning);
  },
};
