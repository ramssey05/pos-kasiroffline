import { defineConfig } from 'vite';
export default defineConfig({
  root: 'www',
  base: './',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false
  }
});
