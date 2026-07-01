import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // Use VITE_BASE_PATH for production base (e.g. '/attendx/' for GitHub Pages, '/' for Vercel)
  const base = command === 'build' ? (process.env.VITE_BASE_PATH || '/') : '/';
  return {
  plugins: [react()],
  base,
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  };
});
