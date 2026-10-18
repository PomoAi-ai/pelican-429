import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: {
    target: 'es2022', outDir: 'dist/maglev', copyPublicDir: false,
    rolldownOptions: { input: fileURLToPath(new URL('./maglev-track.html', import.meta.url)) },
  },
  plugins: [{
    name: 'maglev-model-files',
    generateBundle() {
      const directory = new URL('./public/models/maglev/', import.meta.url);
      for (const file of readdirSync(directory)) {
        if (!file.endsWith('.glb')) continue;
        this.emitFile({ type: 'asset', fileName: `models/maglev/${file}`, source: readFileSync(new URL(file, directory)) });
      }
    },
  }],
});
