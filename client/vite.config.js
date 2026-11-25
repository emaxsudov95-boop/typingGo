import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.VITE_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // shared/ papkasi client/ dan tashqarida joylashgan
    fs: { allow: ['..'] },
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
