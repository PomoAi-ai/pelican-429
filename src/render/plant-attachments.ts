import * as THREE from 'three';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z } from './tile-geometry.ts';
import { createClimberAtlas, createClimberMaterial, createClimberMesh } from './face-climbers.ts';
import type { ClimberInstance, ClimberVariant } from './face-climbers.ts';

export const PLANT_ATTACHMENT_KINDS = ['front', 'back', 'edge', 'underside-moss', 'underside-vine', 'underside-flower', 'mixed', 'woodland'] as const;
export type PlantAttachmentKind = (typeof PLANT_ATTACHMENT_KINDS)[number];
export const PLANT_ATTACHMENT_LABELS: Record<PlantAttachmentKind, string> = {
  front: '正面苔毯与攀藤', back: '背面苔毯与攀藤', edge: '沿边下垂',
  'underside-moss': '底面内部 · 苔须', 'underside-vine': '底面内部 · 垂藤',
  'underside-flower': '底面内部 · 垂花', mixed: '顶面 / 前后 / 底面组合', woodland: '树木与灌木 · 前侧留空',
};
export const PLANT_ATTACHMENT_DESCRIPTIONS: Record<PlantAttachmentKind, string> = {
  front: '草覆盖整格顶面；苔毯贴正面，短藤由草沿向下延伸 0.8 格。旋转检查其贴面厚度。',
  back: '草覆盖整格顶面；苔毯与攀藤附着真实背面，前后互相独立，旋转到背面查看。',
  edge: '从顶面的前后边缘翻下，垂藤约 1.5 格；根点仍在边缘，与底面内部生根分开。',
  'underside-moss': '每格底面内部六个根点，细密苔须向下 0.6–0.9 格；仰视查看中间两排根点。',
  'underside-vine': '每格底面内部六个根点，分枝与叶串向下 1.05–1.5 格；不把整藤横转贴底。',
  'underside-flower': '每格底面内部六个根点，带花垂茎向下 0.88–1.25 格；花位于下半段。',
  mixed: '同一宿主的整格草、正背面苔毯、沿边垂藤与底面内部苔须 / 垂藤 / 垂花同时存在。',
  woodland: '复用游戏树木和灌木，木本主体放在角色后方；前侧至少留 0.25 格，低草仍覆盖整格。',
};

/** 原点为一格顶面中心；宿主高一格，底面根点在内部两排，不依赖边缘。 */
export function createPlantAttachments(kind: PlantAttachmentKind, time: THREE.IUniform<number>) {
  const root = new THREE.Group();
  const atlas = createClimberAtlas('attachment');
  const material = createClimberMaterial(time);
  const meshes: THREE.BatchedMesh[] = [];
  const item = (variant: ClimberVariant, x: number, y: number, z: number, scale = 1): ClimberInstance =>
    ({ variant, x, y, z, scale, flip: false, rot: 0, tint: [1, 1, 1] });
  const add = (plan: ClimberInstance[], back = false): void => {
    const mesh = createClimberMesh('attachment', plan, atlas, material, `plants-${kind}`)!;
    if (back) mesh.rotation.y = Math.PI;
    root.add(mesh); meshes.push(mesh);
  };
  if (kind === 'front' || kind === 'back' || kind === 'mixed') {
    const sides = kind === 'mixed' ? [false, true] : [kind === 'back'];
    for (const back of sides) {
      const z = back ? -BLOCK_BACK_Z : BLOCK_FRONT_Z;
      add([item('mat0', 0, -0.12, z, 0.6), item('diag0', -0.14, -0.12, z + 0.008, 0.7)], back);
    }
  }
  if (kind === 'edge' || kind === 'mixed') {
    add([item('hang0', -0.22, -0.06, BLOCK_FRONT_Z + 0.025, 0.9)]);
    add([item('hang0', -0.2, -0.06, -BLOCK_BACK_Z + 0.025, 0.9)], true);
  }
  if (kind.startsWith('underside') || kind === 'mixed') {
    const variants: readonly ClimberVariant[] = kind === 'mixed' ? ['bottomMoss0', 'bottomVine0', 'bottomFlower0']
      : [kind === 'underside-moss' ? 'bottomMoss0' : kind === 'underside-flower' ? 'bottomFlower0' : 'bottomVine0'];
    const plan: ClimberInstance[] = [];
    for (const z of [-0.7, 0.12]) for (let i = 0; i < 3; i++) {
      plan.push(item(variants[i % variants.length]!, (i - 1) * 0.28, -1.012, z));
    }
    add(plan);
  }
  return { root, dispose() {
    root.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    atlas.dispose(); material.dispose();
  } };
}
