// render-* 测试共享辅助（原 render-surface 拆出）。
import * as THREE from 'three';
import { TREE_SHAPES } from '../../src/config/worldgen-rules.ts';
import { TILE_TEXTURE_LAYERS } from '../../src/render/tile-textures.ts';
import type { TileTextureData } from '../../src/render/tile-textures.ts';
import type { TreeInstance, TreeKind, TreePlatform } from '../../src/world/level.ts';

export const L = (name: (typeof TILE_TEXTURE_LAYERS)[number]): number => TILE_TEXTURE_LAYERS.indexOf(name);

// ---------- 纹理 ----------

export function layerStats(t: TileTextureData, name: (typeof TILE_TEXTURE_LAYERS)[number]) {
  const n = t.size * t.size;
  const off = L(name) * n * 4;
  let lum = 0;
  let chroma = 0;
  for (let i = 0; i < n; i++) {
    const r = t.data[off + 4 * i] as number;
    const g = t.data[off + 4 * i + 1] as number;
    const b = t.data[off + 4 * i + 2] as number;
    lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  return { lum: lum / n, chroma: chroma / n };
}

/** 第 layer 层 (x,y) 像素（y=0 为 v=0 底边）。 */
export function texel(t: TileTextureData, layer: number, x: number, y: number) {
  const o = ((layer * t.size + y) * t.size + x) * 4;
  return { r: t.data[o] as number, g: t.data[o + 1] as number, b: t.data[o + 2] as number, a: t.data[o + 3] as number };
}

export function blockInstances(root: THREE.Object3D) {
  const out: Array<{ key: string; x: number; y: number; layers: number[]; color: THREE.Color }> = [];
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !(m.name.startsWith('tiles-block') || m.name.startsWith('tiles-inner'))) return;
    const keys = m.userData.tileKeys as string[];
    const layers = m.geometry.getAttribute('aLayers');
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      // 方块网格不带实例色（无逐格亮度抖动）：缺省视为白色。
      const c = new THREE.Color(1, 1, 1);
      if (m.instanceColor) m.getColorAt(i, c);
      out.push({ key: keys[i] as string, x: p.x - 0.5, y: p.y - 0.5, layers: [layers.getX(i), layers.getY(i), layers.getZ(i)], color: c });
    }
  });
  return out;
}

/** 地表花草实例位置（tiles-flora-<物种>-* 网格；species 缺省为全部物种）。 */
export function floraPositions(root: THREE.Object3D, species?: string): Array<THREE.Vector3 & { species: string }> {
  const out: Array<THREE.Vector3 & { species: string }> = [];
  const mat = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('tiles-flora-')) return;
    const sp = m.userData.species as string;
    if (species !== undefined && sp !== species) return;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      out.push(Object.assign(new THREE.Vector3().setFromMatrixPosition(mat), { species: sp }));
    }
  });
  return out;
}

export function waterVertices(root: THREE.Object3D, prefix: string) {
  const out: Array<{ x: number; y: number; z: number; s: number }> = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.startsWith(prefix)) return;
    const pos = m.geometry.getAttribute('position');
    const s = m.geometry.getAttribute('aSurface');
    for (let i = 0; i < pos.count; i++) out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), s: s.getX(i) });
  });
  return out;
}

export function makeTree(kind: TreeKind, id = 1, x = 20, baseY = 30): TreeInstance {
  const s = TREE_SHAPES[kind];
  const T = s.trunkHeight.max;
  const C = s.canopyHeight.max;
  const platforms: TreePlatform[] = s.platforms.map((p) => ({
    x0: x + p.dx0,
    x1: x + p.dx1,
    ty: p.anchor === 'crown' ? baseY + T + C - 1 + p.dy : baseY + T + p.dy,
    role: p.role,
  }));
  return {
    id,
    kind,
    x,
    baseY,
    trunkHeight: T,
    trunkRadius: s.trunkRadius.max,
    canopyHalfWidth: s.canopyHalfWidth.max,
    canopyHeight: C,
    visualSeed: 1234 + id,
    crownDx: 0,
    platforms,
  };
}
