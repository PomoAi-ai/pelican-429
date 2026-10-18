import { D1_ANIMATED_MODELS } from '../config/grassy.ts';
import { characterModelPath } from '../render/character-model.ts';

export type BlenderHairStyle = 'blender-redrawn' | 'blender-flow' | 'blender-plait' | 'blender-eye-surface' | 'blender-hair-contact' | 'blender-d12' | 'blender-scalp-fit';
export type HairStyle = 'showcase' | 'game-detailed' | 'rodin-contour' | 'rodin-smooth-extracted' | 'rodin-ear-aligned' | 'rodin-source-remake' | 'rodin-snug-fit' | 'rodin-raw-head' | BlenderHairStyle;

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
};

export function isBlenderHair(value: string): value is BlenderHairStyle {
  return value === 'blender-redrawn' || value === 'blender-flow' || value === 'blender-plait' || value === 'blender-eye-surface' || value === 'blender-hair-contact' || value === 'blender-d12' || value === 'blender-scalp-fit';
}

export function readHairStyle(value: string): HairStyle {
  if (value !== 'showcase' && value !== 'game-detailed' && value !== 'rodin-contour' && value !== 'rodin-smooth-extracted' && value !== 'rodin-ear-aligned' && value !== 'rodin-source-remake' && value !== 'rodin-snug-fit' && value !== 'rodin-raw-head' && !isBlenderHair(value)) throw new Error(`未知头发版本：${value}`);
  return value;
}
