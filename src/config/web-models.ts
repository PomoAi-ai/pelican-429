import { CUSTOMIZATION_MODELS } from './character-customization-assets.ts';

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
  ...CUSTOMIZATION_MODELS.map(model => model.path),
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

/** 独立发束各规格共用，构建保留原始轻量资产。 */
export const HAIR_MODEL_PATHS = {
  'sam-monster': './characters/hair/sam-monster.glb',
  'sam-human': './characters/hair/sam-human.glb',
  'tibo-monster': './characters/hair/tibo-monster.glb',
  'tibo-human': './characters/hair/tibo-human.glb',
} as const;

/** 构建与 CI 按需拉取共用同一份正式模型清单。 */
export const RELEASE_MODEL_PATHS: readonly string[] = [
  ...WEB_MODEL_SOURCES.map(source => compactModelPath(source, 512)),
  ...Object.values(HAIR_MODEL_PATHS),
];
