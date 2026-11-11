import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: vite on 5173 (exposed to LAN), game server on 3000 proxied for /ws and /api.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
});
