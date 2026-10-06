import { defineConfig } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { WEB_MODEL_SOURCES, compactModelPath } from './src/config/web-models.ts';
import { NPCS } from './src/config/npc.ts';

export default defineConfig(({ command, mode }) => ({
  base: './',
  server: { host: '127.0.0.1', port: 5174 },
  preview: { host: '127.0.0.1', port: 4174 },
  build: { target: 'es2022', copyPublicDir: mode === 'full' },
  plugins: command === 'build' && mode !== 'full' ? [{
    name: 'release-assets',
    generateBundle() {
      const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
      const files = [
        ...WEB_MODEL_SOURCES.map(source => compactModelPath(source, 512)),
        ...Object.values(NPCS).flatMap(npc => npc.forms.map(form => form.image)),
        'characters/luma/portrait.jpg', 'contact/x-avatar.jpg', 'ui/hud-icons.webp',
      ];
      for (const directory of ['resources/home', 'resources/free-world']) {
        for (const entry of readdirSync(join(publicDir, directory), { recursive: true, withFileTypes: true })) {
          if (entry.isFile()) files.push(relative(publicDir, join(entry.parentPath, entry.name)));
        }
      }
      for (const file of files) {
        const source = readFileSync(join(publicDir, file));
        if (file.endsWith('.glb') && source.toString('ascii', 0, 4) !== 'glTF') {
          throw new Error(`发布模型不是 GLB 文件，请先拉取 Git LFS 资源：${file}`);
        }
        this.emitFile({ type: 'asset', fileName: file.replace(/^\.\//, '').replaceAll('\\', '/'), source });
      }
    },
  }] : [],
}));
