import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const API_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [devtools(), tailwindcss(), tanstackRouter({}), react()],
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        secure: false,
      },
      '/rpc': {
        target: API_URL,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
