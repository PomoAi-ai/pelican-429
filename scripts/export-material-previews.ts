import { RESIDENCE_RESOURCES } from '../src/config/residence.ts';
import { createResourceThumbnailRenderer } from '../src/render/resource/resource-thumbnail.ts';
import { generateTileTextures, tileLayerIndex } from '../src/render/tile/tile-textures.ts';

/** 在 Vite 页面导入并调用，将返回的 PNG data URL 按文件名保存到 public/concepts/material-previews/。 */
export async function exportMaterialPreviews(): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  const renderer = createResourceThumbnailRenderer(480);
  const families = Map.groupBy(RESIDENCE_RESOURCES, resource => resource.label.split(' · ')[0]!);
  try {
    for (const variants of families.values()) {
      const resource = variants[0]!;
      images[`${resource.id}.png`] = renderer.render(resource.id);
      if (resource.kind === 'wall' || resource.kind === 'solid' && ['ceramic', 'alloy', 'ashlar'].includes(resource.material)) {
        images[`${resource.id}-surface.png`] = renderer.renderSurface(resource.id);
      }
      // 文档批量导出时让出主线程；游戏中的选择器仍按可见项生成缩略图。
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  } finally {
    renderer.dispose();
  }

  const textures = generateTileTextures(256);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = textures.size;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(textures.size, textures.size);
  const stride = textures.size * 4;
  for (const layer of ['dirt', 'grassTop', 'stone', 'sand', 'sandstone', 'planks']) {
    const offset = tileLayerIndex(layer) * textures.size * stride;
    // GPU 数据从底边开始，PNG 从顶边开始。
    for (let y = 0; y < textures.size; y++) {
      const start = offset + (textures.size - 1 - y) * stride;
      pixels.data.set(textures.data.subarray(start, start + stride), y * stride);
    }
    context.putImageData(pixels, 0, 0);
    images[`texture-${layer}.png`] = canvas.toDataURL('image/png');
  }
  return images;
}
