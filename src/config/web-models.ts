import { CUSTOMIZATION_MODELS } from './character-customization-assets.ts';
import { D1_ANIMATED_MODELS, D1_MODELS, GRASSY_ANIMATED_MODELS, GRASSY_CUSTOMIZATION_MODELS } from './grassy.ts';
import { ENEMY_KINDS, enemyModelPath } from './enemy-models.ts';
import { NPCS } from './npc.ts';
import { FLYING_ROADSTER_MODEL } from './flying-roadster.ts';

/** 原始模型及无损版本保留供近景对照；默认游戏资源同时压缩贴图与模型数据。[0] 是主角游戏档。 */
export const WEB_MODEL_SOURCES: readonly string[] = [
  GRASSY_ANIMATED_MODELS.find(model => model.id === 'game')!.path,
  ...D1_ANIMATED_MODELS.map(model => model.path),
  D1_MODELS.find(model => model.id === 'd1-base-modular')!.path,
  ...Object.values(NPCS).flatMap(npc => npc.forms.map(form => form.path)),
  ...ENEMY_KINDS.map(enemyModelPath),
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
  FLYING_ROADSTER_MODEL,
  ...WEB_MODEL_SOURCES.map(source => compactModelPath(source, 512)),
  ...GRASSY_CUSTOMIZATION_MODELS.map(model => model.path),
  ...Object.values(HAIR_MODEL_PATHS),
];
