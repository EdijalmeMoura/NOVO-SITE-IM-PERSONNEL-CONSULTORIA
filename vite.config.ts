import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'custom',
  server: { host: true, allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'], hmr: { overlay: true } },
  build: { sourcemap: true },
});
