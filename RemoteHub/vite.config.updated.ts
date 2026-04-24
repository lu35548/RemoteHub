import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  define: {
    // Removed AI-related environment variables
    // Previously contained: GEMINI_API_KEY and API_KEY
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});