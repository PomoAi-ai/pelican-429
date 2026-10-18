import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { RELEASE_MODEL_PATHS } from './src/config/web-models.ts';
import { NPCS } from './src/config/npc.ts';
import { HARBOR_PAINTED_FILES, HARBOR_PAINTED_PATH, HARBOR_LAKE_FILES, HARBOR_LAKE_PATH } from './src/config/harbor-painted.ts';

function configureMarkdownEncoding(server: Pick<ViteDevServer, 'middlewares'>) {
  server.middlewares.use((req, res, next) => {
    // 按 UTF-8 原文展示，避免浏览器猜错中文编码或将 Markdown 当成下载。
    if (/^\/concepts\/[^?]+\.md(?:\?|$)/.test(req.url!)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    next();
  });
}

export default defineConfig(({ command, mode }) => ({
  base: './',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  server: { host: '127.0.0.1', port: 5174 },
  preview: { host: '127.0.0.1', port: 4174 },
  build: {
    target: 'es2022', copyPublicDir: mode === 'full',
    ...(mode === 'full' ? { rolldownOptions: { input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      renderLab: fileURLToPath(new URL('./render-lab.html', import.meta.url)),
      hairGallery: fileURLToPath(new URL('./d1-hair-gallery.html', import.meta.url)),
    } } } : {}),
  },
  plugins: [{
    name: 'markdown-utf8',
    configureServer: configureMarkdownEncoding,
    configurePreviewServer: configureMarkdownEncoding,
  }, ...command === 'build' && mode !== 'full' ? [{
    name: 'release-assets',
    generateBundle() {
      const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
      const files = [
        'app.webmanifest', 'icons/pelican-192.png', 'icons/pelican-512.png', 'llms.txt',
        ...RELEASE_MODEL_PATHS,
        'models/white-vtol/preview.png', 'models/white-vtol/SOURCE.md',
        ...Object.values(NPCS).flatMap(npc => npc.forms.map(form => form.image)),
        'characters/luma/portrait.jpg', 'contact/x-avatar.jpg', 'ui/hud-icons.webp',
        'scenes/ai-city-background-v1/skyline.png', 'scenes/ai-city-background-v1/canyon.png',
        'scenes/ai-skyline-depth-v1/sky.jpg',
        ...HARBOR_PAINTED_FILES.map(file => `${HARBOR_PAINTED_PATH}/${file}`),
        ...HARBOR_LAKE_FILES.map(file => `${HARBOR_LAKE_PATH}/${file}`),
      ];
      for (const directory of ['resources/home', 'resources/free-world', 'concepts', 'ui/hud']) {
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
  } satisfies Plugin] : []],
}));
