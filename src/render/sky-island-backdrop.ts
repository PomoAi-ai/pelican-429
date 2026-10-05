/**
 * 远景浮空岛剪影（021）：远山之后、云层之间（z ∈ [BACKDROP_Z_NEAR, BACKDROP_Z_FAR]）的几座扁平倒锥形剪影，
 * 带一点挂在底下的碎块；颜色按距离混入天空雾色（越远越淡）。一个网格（1 draw call），不挂光照图（userData.noLightMap）、不投影。
 * 位置由种子哈希确定（确定性）；高度取地表均值之上 BACKDROP_RISE。
 */
import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';

export const BACKDROP_ISLANDS = Object.freeze({ COUNT_PER_1000: 6, Z_NEAR: -95, Z_FAR: -150, RISE: [34, 58] as const, WIDTH: [14, 26] as const });

export interface BackdropInput {
  readonly width: number;
  /** 每列地表（厚实心）高度。 */
  readonly surface: ArrayLike<number>;
  readonly seed: number;
  /** 天空/雾色（与 stage 远山 haze 一致）。 */
  readonly haze?: string;
}

export function planBackdropIslands(input: BackdropInput): Array<{ x: number; y: number; z: number; w: number; seed: number }> {
  const { width, surface, seed } = input;
  if (!(Number.isInteger(width) && width > 0) || surface.length !== width) throw new Error(`sky-island-backdrop: invalid width ${width} / surface ${surface.length}`);
  const B = BACKDROP_ISLANDS;
  let mean = 0;
  for (let x = 0; x < width; x++) mean += surface[x] as number;
  mean /= width;
  const n = Math.max(2, Math.round((width / 1000) * B.COUNT_PER_1000));
  const out: Array<{ x: number; y: number; z: number; w: number; seed: number }> = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.15 + 0.7 * hash01(k, 1, seed)) / n;
    const far = hash01(k, 2, seed);
    out.push({
      x: u * width,
      y: mean + B.RISE[0] + (B.RISE[1] - B.RISE[0]) * hash01(k, 3, seed),
      z: B.Z_NEAR + (B.Z_FAR - B.Z_NEAR) * far,
      w: B.WIDTH[0] + (B.WIDTH[1] - B.WIDTH[0]) * hash01(k, 4, seed),
      seed: (seed ^ (k * 0x9e3779b1)) >>> 0,
    });
  }
  return out;
}

/** 剪影轮廓：平顶（带树丛鼓包）+ 倒锥底（噪声），扇形三角化；顶点色顶部偏绿、底部偏暗，整体按 haze 混色。 */
export function buildBackdropGeometry(input: BackdropInput): THREE.BufferGeometry {
  const plan = planBackdropIslands(input);
  const haze = new THREE.Color(input.haze ?? '#cfe3ea');
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const p of plan) {
    const fog = 0.72 + 0.18 * ((p.z - BACKDROP_ISLANDS.Z_NEAR) / (BACKDROP_ISLANDS.Z_FAR - BACKDROP_ISLANDS.Z_NEAR));
    const topC = new THREE.Color('#6f9a6a').lerp(haze, fog);
    const botC = new THREE.Color('#6b5d58').lerp(haze, fog);
    const segs = 24;
    const depth = p.w * (0.45 + 0.2 * hash01(1, 1, p.seed));
    const ring: Array<[number, number, THREE.Color]> = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const bump = 0.6 * Math.max(0, Math.sin(t * Math.PI * (3 + Math.floor(hash01(2, 2, p.seed) * 3)) + hash01(3, 3, p.seed) * 6)) * (0.5 + hash01(i, 4, p.seed));
      ring.push([p.x - p.w / 2 + p.w * t, p.y + bump + (t < 0.08 || t > 0.92 ? -0.6 : 0), topC]);
    }
    for (let i = segs - 1; i >= 1; i--) {
      const t = i / segs;
      const prof = Math.pow(1 - Math.abs(2 * t - 1), 1.6);
      const jag = 0.25 * depth * (hash01(i, 5, p.seed) - 0.5) * prof;
      ring.push([p.x - p.w / 2 + p.w * t, p.y - 0.8 - depth * prof + jag, botC]);
    }
    const n = pos.length / 3;
    pos.push(p.x, p.y - depth * 0.35, p.z);
    const mid = topC.clone().lerp(botC, 0.5);
    col.push(mid.r, mid.g, mid.b);
    for (const [x, y, c] of ring) {
      pos.push(x, y, p.z);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < ring.length; i++) idx.push(n, n + 1 + i, n + 1 + ((i + 1) % ring.length));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface SkyIslandBackdrop {
  readonly mesh: THREE.Mesh;
  readonly count: number;
  dispose(): void;
}

export function createSkyIslandBackdrop(input: BackdropInput): SkyIslandBackdrop {
  const geometry = buildBackdropGeometry(input);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  material.userData.noLightMap = true;
  material.name = 'sky-island-backdrop';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-island-backdrop';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    count: planBackdropIslands(input).length,
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
