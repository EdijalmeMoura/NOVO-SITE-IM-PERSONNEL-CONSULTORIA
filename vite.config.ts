import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'custom',
  server: { host: true, allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'], hmr: { overlay: true } },
  build: {
    sourcemap: true,
    rollupOptions: {
      // React, router e ícones mudam pouco: separados, o navegador reaproveita o cache
      // entre publicações e não baixa tudo de novo a cada ajuste de conteúdo.
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
