import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    // Bind to all interfaces so the dev server is reachable from other devices on the LAN
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      // Serve the participant world client through the telao origin too, so
      // both http://<host>:5173/agent and http://<host>:3000/agent work.
      '/agent': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
