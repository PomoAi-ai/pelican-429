import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { HARBOR_ART_FILES } from './src/config/harbor-perspective.ts';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  preview: { host: '127.0.0.1', port: 4186, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist/harbor',
    copyPublicDir: false,
    rolldownOptions: { input: fileURLToPath(new URL('./harbor-perspective.html', import.meta.url)) },
  },
  plugins: [{
    name: 'harbor-art-assets',
    generateBundle() {
      for (const file of HARBOR_ART_FILES) {
        const fileName = `scenes/ai-skyline-depth-v1/${file}`;
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(`./public/${fileName}`, import.meta.url)) });
      }
    },
  }],
});
