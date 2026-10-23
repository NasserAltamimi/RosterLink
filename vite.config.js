import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Backend NODE_ENV may be present in root .env; compile the correct React build explicitly.
  define: { 'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development') },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': process.env.API_TARGET || 'http://127.0.0.1:3001' },
  },
  build: { outDir: 'dist' },
}));
