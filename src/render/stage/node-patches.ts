/**
 * 材质补丁的节点描述：每个 onBeforeCompile 补丁旁登记一条同一补丁所需的数据（共享 uniform 对象、纹理、选项），不含 TSL。
 * WebGPU 舞台（render/webgpu/webgpu-materials）按登记顺序把它们翻译成节点材质；WebGL 路径只登记不读取。
 */
import type * as THREE from 'three';
import type { DisturbUniforms } from '../flora/grass-disturb.ts';
import type { LightMapPatchOptions, LightMapUniforms } from './light-field-material.ts';
import type { PrecipUniforms } from '../sky/precip-surface.ts';
import type { WaterPaletteUniforms } from '../water/water-shading.ts';
import type { WindUniforms } from '../sky/wind.ts';

type Scalar = THREE.IUniform<number>;
export type JellyUniforms = Readonly<Record<'uJellyTime' | 'uJellyAmp' | 'uJellyFreq' | 'uJellySpeed', Scalar>>;
interface CaveWallUniforms {
  readonly uWallRooms: THREE.IUniform<THREE.DataTexture>;
  readonly uWallImage: THREE.IUniform<THREE.Texture | null>;
  readonly uWallMask: THREE.IUniform<THREE.DataTexture>;
  readonly uWallSize: THREE.IUniform<THREE.Vector2>;
}

export type NodePatch =
  | { readonly kind: 'tile-layers'; readonly texture: THREE.DataArrayTexture }
  | { readonly kind: 'light-map'; readonly uniforms: LightMapUniforms; readonly dynMax: number; readonly options: Required<LightMapPatchOptions> }
  | { readonly kind: 'cloud-shadow'; readonly uniforms: WindUniforms }
  | { readonly kind: 'depth-haze' }
  | {
      readonly kind: 'flora-wind';
      readonly wind: WindUniforms;
      readonly disturb: DisturbUniforms;
      readonly uniforms: { readonly time: Scalar; readonly amplitude: Scalar; readonly speed: Scalar; readonly windScale: Scalar; readonly disturbScale: Scalar };
    }
  | { readonly kind: 'tree-wind'; readonly wind: WindUniforms; readonly time: Scalar }
  | { readonly kind: 'tree-bark'; readonly bump: Scalar }
  | { readonly kind: 'shrub-disturb'; readonly disturb: DisturbUniforms; readonly scale: Scalar }
  | { readonly kind: 'variant-collapse' }
  | { readonly kind: 'instance-fade' }
  /** 变身羽毛：按 aFeatherStage 与相位分界 discard（bird = 鸟一侧保留 phase ≥ stage），喙部顶点向嘴根收拢。 */
  | { readonly kind: 'feather-surface-growth'; readonly phase: Scalar; readonly active: Scalar; readonly bird: boolean }
  /** 羽毛插画的负 HDR alpha 标记（后期据此减弱 AO）。 */
  | { readonly kind: 'pelican-plumage-occlusion' }
  | {
      readonly kind: 'pelican-scarf';
      readonly uniforms: { readonly phase: Scalar; readonly amplitude: Scalar; readonly lift: Scalar; readonly flow: Scalar; readonly ribbon: Scalar };
    }
  | { readonly kind: 'npc-form-fade'; readonly humanMix: Scalar; readonly human: boolean }
  | { readonly kind: 'teleport-dissolve'; readonly amount: Scalar }
  | { readonly kind: 'water-jelly'; readonly uniforms: JellyUniforms }
  | { readonly kind: 'fish-tail'; readonly wagY: number; readonly wagZ: number }
  /** 树影随风：登记在树的 customDepthMaterial 上（WebGPU 阴影通道按网格的深度材质补丁改写位置）。 */
  | { readonly kind: 'tree-shadow-wind'; readonly wind: WindUniforms; readonly time: Scalar }
  | { readonly kind: 'precip-surface'; readonly uniforms: PrecipUniforms }
  | { readonly kind: 'surface-rocks' }
  | { readonly kind: 'cave-decor-glow'; readonly time: Scalar }
  | { readonly kind: 'cave-wall'; readonly uniforms: CaveWallUniforms }
  | { readonly kind: 'facility-wall'; readonly background: THREE.Texture }
  | { readonly kind: 'water-surface'; readonly wind: WindUniforms; readonly time: Scalar; readonly palette: WaterPaletteUniforms; readonly ripple: Scalar }
  | { readonly kind: 'water-wave'; readonly wind: WindUniforms; readonly time: Scalar }
  | { readonly kind: 'water-ripples'; readonly wind: WindUniforms; readonly time: Scalar }
  | { readonly kind: 'hut-texture'; readonly texture: THREE.IUniform<THREE.Texture>; readonly wind: WindUniforms | null; readonly sway: { readonly lean: number; readonly flutter: number } }
  | { readonly kind: 'hut-smoke'; readonly wind: WindUniforms; readonly smoke: { readonly rate: number; readonly rise: number; readonly r0: number; readonly r1: number; readonly drift: number } }
  | { readonly kind: 'natural-building'; readonly grass: THREE.Texture | null; readonly period: number }
  | { readonly kind: 'furniture-fabric' }
  | { readonly kind: 'ai-city-finish'; readonly finish: 'ceramic' | 'wall' | 'ashlar' | 'alloy'; readonly variation: readonly [tone: number, warmth: number, roughness: number] }
  | { readonly kind: 'gate-dissolve'; readonly dissolve: Scalar }
  | { readonly kind: 'harbor-curtain-wall' }
  | { readonly kind: 'harbor-shore-haze'; readonly near: Scalar; readonly color: THREE.IUniform<THREE.Color>; readonly halfDistance: number }
  /** 住宅 3、4 的视距空气（色调映射前混合）；low 为住宅 4 贴近河面（世界 y = level）的低空雾。 */
  | {
      readonly kind: 'residence-air';
      readonly air: THREE.IUniform<THREE.Color>;
      readonly density: Scalar;
      readonly start: number;
      readonly scale: number;
      readonly power: number;
      readonly low: { readonly level: Scalar } | null;
    }
  /** 住宅 4 材质图集按世界尺寸三向投影；atlas 在环境 prepare 后才有值。 */
  | {
      readonly kind: 'river-surface';
      readonly atlas: THREE.IUniform<THREE.Texture | null>;
      readonly origin: readonly [number, number];
      readonly size: number;
      readonly strength: number;
      readonly gain: number;
    }
  /** 住宅 4 河城太阳深度图阴影（matrix：世界 → 深度图 [0, 1]³）。 */
  | { readonly kind: 'river-sun-shadow'; readonly matrix: THREE.IUniform<THREE.Matrix4>; readonly depth: THREE.DepthTexture; readonly size: number };

const registry = new WeakMap<THREE.Material, NodePatch[]>();

/** 追加一条补丁描述（与 onBeforeCompile 链同序：先挂接的先翻译）。 */
export function addNodePatch(material: THREE.Material, patch: NodePatch): void {
  const list = registry.get(material);
  if (list) list.push(patch);
  else registry.set(material, [patch]);
}

/** 撤掉补丁时同步移除描述。 */
export function removeNodePatch(material: THREE.Material, patch: NodePatch): void {
  const list = registry.get(material);
  const i = list ? list.indexOf(patch) : -1;
  if (!list || i < 0) throw new Error(`node-patches: material '${material.name || material.type}' has no '${patch.kind}' patch to remove`);
  list.splice(i, 1);
}

export function nodePatches(material: THREE.Material): readonly NodePatch[] {
  return registry.get(material) ?? [];
}
