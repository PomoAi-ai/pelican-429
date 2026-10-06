/** 原始模型及无损版本保留供近景对照；默认游戏资源同时压缩贴图与模型数据。 */
export const WEB_MODEL_SOURCES: readonly string[] = [
  './characters/human/models-equipped/grassy-equipped-game.glb',
  './characters/sam/sam.glb',
  './characters/sam/human/sam-human.glb',
  './characters/tibo/tibo.glb',
  './characters/tibo/human/tibo-human.glb',
  './characters/enemies/line-hound/model.glb',
  './characters/enemies/watch-wasp/model.glb',
  './characters/enemies/loadmaster/model.glb',
  './characters/enemies/gatekeeper/model.glb',
];

export function webModelPath(source: string): string {
  return source.replace(/\.glb$/, '.web.glb');
}

export function web1kModelPath(source: string): string {
  return source.replace(/\.glb$/, '.web-1k.glb');
}

export function ktxModelPath(source: string): string {
  return source.replace(/\.glb$/, '.ktx2.glb');
}

export function ktx256ModelPath(source: string): string {
  return source.replace(/\.glb$/, '.ktx2-256.glb');
}

export function compactModelPath(source: string, textureSize: 512 | 256): string {
  return source.replace(/\.glb$/, textureSize === 512 ? '.ktx2-compact.glb' : '.ktx2-256-compact.glb');
}
