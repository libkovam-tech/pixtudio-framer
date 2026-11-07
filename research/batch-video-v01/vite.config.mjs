import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./.vite-cache/', import.meta.url)),
  server: { host: '127.0.0.1', port: 5177, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
};
