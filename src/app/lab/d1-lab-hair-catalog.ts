import { D1_ANIMATED_MODELS } from '../../config/grassy.ts';
import { characterModelPath } from '../../render/character/character-model.ts';

const LAB = './characters/human/render-lab';

/**
 * 两个 D1 预览页共用的头发目录，数组顺序即页面上的展示顺序。
 * eyes：supported 可切换球形眼睛，default 在渲染实验里默认启用球形眼睛（头发预览页只给 scalp-flow 配球眼，不读此项）。
 */
const HAIRS = [
  { key: 'showcase', number: 1, label: '展示场 · 白色基础服游戏标准版', asset: `${LAB}/d1-base-showcase.web-1k.glb`, blender: false },
  { key: 'rodin-contour', number: 5, label: 'Rodin · 自然收拢版（保留）', asset: `${LAB}/d1-outfit-rodin-hair.web-1k.glb`, blender: false },
  { key: 'blender-redrawn', number: 13, label: 'Blender · 刘海与短卷重绘〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-redrawn-v1.glb`, blender: true },
  { key: 'blender-flow', number: 17, label: 'Blender · 短发收束与沿束配色〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-flow-v1.glb`, blender: true },
  { key: 'blender-plait', number: 22, label: 'Blender · 编辫逐瓣重塑〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-plait-v1.glb`, blender: true },
  { key: 'blender-eye-surface', number: 31, label: 'Blender · 眼周连续与眨眼修复〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-eye-surface-v1.glb`, blender: true, eyes: 'supported' },
  { key: 'blender-hair-contact', number: 34, label: 'Blender · 冠发衔接与后脑补缝〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-hair-contact-v1.glb`, blender: true, eyes: 'supported' },
  { key: 'blender-d12', number: 35, label: 'Blender · D12 细发丝与内刘海衔接〔阶段稿〕', asset: `${LAB}/d1-outfit-blender-d12-v1.glb`, blender: true, eyes: 'supported' },
  { key: 'game-detailed', number: 38, label: '游戏正式版 · 精细检查（当前资源）', asset: characterModelPath(D1_ANIMATED_MODELS.find(model => model.id === 'detailed')!.path, 'web-1k'), blender: false },
  { key: 'blender-scalp-fit', number: 39, label: 'Blender · 原画发束与头皮贴合〔新款〕', asset: `${LAB}/d1-outfit-blender-scalp-fit-v1.glb`, blender: true, eyes: 'default' },
  { key: 'rodin-smooth-extracted', number: 40, label: 'Rodin · 整头拆分平滑发束〔阶段稿〕', asset: `${LAB}/d1-outfit-rodin-smooth-extracted-v1.glb`, blender: false, eyes: 'default' },
  { key: 'rodin-ear-aligned', number: 41, label: 'Rodin · 整头配准〔修正版〕', asset: `${LAB}/d1-outfit-rodin-ear-aligned-v1.glb`, blender: false, eyes: 'default' },
  { key: 'rodin-source-remake', number: 42, label: 'Rodin · 原始整头重新拆分〔新款〕', asset: `${LAB}/d1-outfit-rodin-source-remake-v1.glb`, blender: false, eyes: 'default' },
  { key: 'rodin-snug-fit', number: 43, label: 'Rodin · 原始头发贴合头皮〔新款〕', asset: `${LAB}/d1-outfit-rodin-snug-fit-v1.glb`, blender: false, eyes: 'default' },
  { key: 'rodin-raw-head', number: 44, label: 'Rodin · 原始整头未修改〔对照〕', asset: `${LAB}/d1-outfit-rodin-raw-head-v1.glb`, blender: false, eyes: 'default' },
  { key: 'rodin-braid-y21', number: 45, label: 'Rodin · 两股辫 y21 贴合头皮〔新款〕', asset: `${LAB}/d1-outfit-rodin-braid-y21-v1.glb`, blender: false, eyes: 'default' },
  { key: 'procedural-braid', number: 46, label: '程序化 · 波波头两股辫〔新款〕', asset: `${LAB}/d1-outfit-procedural-braid-v1.glb`, blender: false, eyes: 'default' },
  { key: 'blender-scalp-flow', number: 47, label: 'Blender · 偏分发流与贴头三股辫〔新款〕', asset: `${LAB}/d1-outfit-blender-scalp-flow-v1.glb`, blender: true, eyes: 'default' },
] as const;

type Hair = typeof HAIRS[number];
export type HairStyle = Hair['key'];
type BlenderHairStyle = Extract<Hair, { blender: true }>['key'];

export const HAIR_ASSETS = Object.fromEntries(HAIRS.map(hair => [hair.key, hair.asset])) as Record<HairStyle, string>;
export const HAIR_LABELS = Object.fromEntries(HAIRS.map(hair => [hair.key, hair.label])) as Record<HairStyle, string>;
export const SPHERICAL_EYE_HAIRS: readonly HairStyle[] = HAIRS.filter(hair => 'eyes' in hair).map(hair => hair.key);
export const DEFAULT_SPHERICAL_EYE_HAIRS: readonly HairStyle[] = HAIRS.filter(hair => 'eyes' in hair && hair.eyes === 'default').map(hair => hair.key);

/** 目录项的显示名：编号与名称。 */
export function hairTitle(hair: HairStyle): string {
  const { number, label } = HAIRS.find(item => item.key === hair)!;
  return `${String(number).padStart(2, '0')} · ${label}`;
}

export function isBlenderHair(value: HairStyle): value is BlenderHairStyle {
  return HAIRS.find(hair => hair.key === value)!.blender;
}

export function readHairStyle(value: string): HairStyle {
  const hair = HAIRS.find(item => item.key === value);
  if (!hair) throw new Error(`未知头发版本：${value}`);
  return hair.key;
}
