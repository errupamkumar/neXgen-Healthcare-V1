import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // data.json is the server's datastore and is rewritten on every booking,
      // patient save and upload. It lives in the project root, so without this
      // ignore Vite sees each write as a source change and full-reloads the
      // page — throwing away React state and logging the user out mid-flow.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data.json'] },
    },
  };
});
