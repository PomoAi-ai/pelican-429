import { D1_ANIMATED_MODELS } from '../../config/grassy.ts';
import { characterModelPath } from '../../render/character/character-model.ts';

export type BlenderHairStyle = 'blender-redrawn' | 'blender-flow' | 'blender-plait' | 'blender-eye-surface' | 'blender-hair-contact' | 'blender-d12' | 'blender-scalp-fit' | 'blender-scalp-flow';
export type HairStyle = 'showcase' | 'game-detailed' | 'rodin-contour' | 'rodin-smooth-extracted' | 'rodin-ear-aligned' | 'rodin-source-remake' | 'rodin-snug-fit' | 'rodin-raw-head' | 'rodin-braid-y21' | 'procedural-braid' | BlenderHairStyle;

export const HAIR_ASSETS: Record<HairStyle, string> = {
  'game-detailed': characterModelPath(D1_ANIMATED_MODELS.find(model => model.id === 'detailed')!.path, 'web-1k'),
  'showcase': './characters/human/render-lab/d1-base-showcase.web-1k.glb',
  'rodin-contour': './characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb',
  'blender-redrawn': './characters/human/render-lab/d1-outfit-blender-redrawn-v1.glb',
  'blender-flow': './characters/human/render-lab/d1-outfit-blender-flow-v1.glb',
  'blender-plait': './characters/human/render-lab/d1-outfit-blender-plait-v1.glb',
  'blender-eye-surface': './characters/human/render-lab/d1-outfit-blender-eye-surface-v1.glb',
  'blender-hair-contact': './characters/human/render-lab/d1-outfit-blender-hair-contact-v1.glb',
  'blender-d12': './characters/human/render-lab/d1-outfit-blender-d12-v1.glb',
  'blender-scalp-fit': './characters/human/render-lab/d1-outfit-blender-scalp-fit-v1.glb',
  'rodin-smooth-extracted': './characters/human/render-lab/d1-outfit-rodin-smooth-extracted-v1.glb',
  'rodin-ear-aligned': './characters/human/render-lab/d1-outfit-rodin-ear-aligned-v1.glb',
  'rodin-source-remake': './characters/human/render-lab/d1-outfit-rodin-source-remake-v1.glb',
  'rodin-snug-fit': './characters/human/render-lab/d1-outfit-rodin-snug-fit-v1.glb',
  'rodin-raw-head': './characters/human/render-lab/d1-outfit-rodin-raw-head-v1.glb',
  'rodin-braid-y21': './characters/human/render-lab/d1-outfit-rodin-braid-y21-v1.glb',
  'procedural-braid': './characters/human/render-lab/d1-outfit-procedural-braid-v1.glb',
  'blender-scalp-flow': './characters/human/render-lab/d1-outfit-blender-scalp-flow-v1.glb',
};

export const HAIR_NUMBERS: Record<HairStyle, number> = {
  'showcase': 1,
  'game-detailed': 38,
  'rodin-contour': 5,
  'blender-redrawn': 13,
  'blender-flow': 17,
  'blender-plait': 22,
  'blender-eye-surface': 31,
  'blender-hair-contact': 34,
  'blender-d12': 35,
  'blender-scalp-fit': 39,
  'rodin-smooth-extracted': 40,
  'rodin-ear-aligned': 41,
  'rodin-source-remake': 42,
  'rodin-snug-fit': 43,
  'rodin-raw-head': 44,
  'rodin-braid-y21': 45,
  'procedural-braid': 46,
  'blender-scalp-flow': 47,
};

/** 两个 D1 预览页共用的头发目录名称；键顺序即页面上的展示顺序。 */
export const HAIR_LABELS: Record<HairStyle, string> = {
  'showcase': '展示场 · 白色基础服游戏标准版',
  'rodin-contour': 'Rodin · 自然收拢版（保留）',
  'blender-redrawn': 'Blender · 刘海与短卷重绘〔阶段稿〕',
  'blender-flow': 'Blender · 短发收束与沿束配色〔阶段稿〕',
  'blender-plait': 'Blender · 编辫逐瓣重塑〔阶段稿〕',
  'blender-eye-surface': 'Blender · 眼周连续与眨眼修复〔阶段稿〕',
  'blender-hair-contact': 'Blender · 冠发衔接与后脑补缝〔阶段稿〕',
  'blender-d12': 'Blender · D12 细发丝与内刘海衔接〔阶段稿〕',
  'game-detailed': '游戏正式版 · 精细检查（当前资源）',
  'blender-scalp-fit': 'Blender · 原画发束与头皮贴合〔新款〕',
  'rodin-smooth-extracted': 'Rodin · 整头拆分平滑发束〔阶段稿〕',
  'rodin-ear-aligned': 'Rodin · 整头配准〔修正版〕',
  'rodin-source-remake': 'Rodin · 原始整头重新拆分〔新款〕',
  'rodin-snug-fit': 'Rodin · 原始头发贴合头皮〔新款〕',
  'rodin-raw-head': 'Rodin · 原始整头未修改〔对照〕',
  'rodin-braid-y21': 'Rodin · 两股辫 y21 贴合头皮〔新款〕',
  'procedural-braid': '程序化 · 波波头两股辫〔新款〕',
  'blender-scalp-flow': 'Blender · 偏分发流与贴头三股辫〔新款〕',
};

/** 目录项的显示名：编号与名称。 */
export function hairTitle(hair: HairStyle): string {
  return `${String(HAIR_NUMBERS[hair]).padStart(2, '0')} · ${HAIR_LABELS[hair]}`;
}

export function isBlenderHair(value: string): value is BlenderHairStyle {
  return value === 'blender-redrawn' || value === 'blender-flow' || value === 'blender-plait' || value === 'blender-eye-surface' || value === 'blender-hair-contact' || value === 'blender-d12' || value === 'blender-scalp-fit' || value === 'blender-scalp-flow';
}

export function readHairStyle(value: string): HairStyle {
  if (value !== 'showcase' && value !== 'game-detailed' && value !== 'rodin-contour' && value !== 'rodin-smooth-extracted' && value !== 'rodin-ear-aligned' && value !== 'rodin-source-remake' && value !== 'rodin-snug-fit' && value !== 'rodin-raw-head' && value !== 'rodin-braid-y21' && value !== 'procedural-braid' && !isBlenderHair(value)) throw new Error(`未知头发版本：${value}`);
  return value;
}
