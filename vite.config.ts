import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative so the build works on GitHub Pages
// under any repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  // peerjs references Node's `global`
  define: { global: 'globalThis' },
});
