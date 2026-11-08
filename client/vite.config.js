import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Mock data may only exist in an explicit development/demo build — never in production.
  if (mode === 'production' && env.VITE_ENABLE_MOCKS === 'true') {
    throw new Error('VITE_ENABLE_MOCKS=true is not allowed in a production build.');
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Same-origin API in development (mirrors the Vercel /api rewrite in production).
      proxy: { '/api': { target: env.VITE_DEV_API_PROXY || 'http://localhost:4000', changeOrigin: true } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
