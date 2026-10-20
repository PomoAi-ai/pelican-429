/**
 * 背景格子剪影：由地表高度派生的整格台阶轮廓，放在背景格子层里只显示、不参与碰撞。
 * 每列先对地表取滑动平均再错位、抬高，两层用不同的平滑宽度与错位，轮廓和缺口彼此错开；
 * 顶部几行画成内缩的方格（格缝露出更暗的衬底），保持真实格子尺寸，推远后在画面里自然变小、格缝变密。
 */
import * as THREE from 'three';
import { hash01 } from '../../core/rng.ts';

interface CellSilhouetteOptions {
  /** 每列地表高度（groundSurface），长度即地图宽度。 */
  readonly surface: Int16Array;
  /** 取样列的错位（格）。 */
  readonly shift: number;
  /** 滑动平均半宽（格）。 */
  readonly smooth: number;
  /** 顶面相对平均地表的抬高（格）。 */
  readonly lift: number;
  readonly seed: number;
}

/** 画出格缝的顶部行数；以下只画衬底。 */
const CELL_ROWS = 4;
/** 衬底从顶面向下延伸的格数（地下由玩法地形遮住）。 */
const BACKING_DEPTH = 48;
/** 地图两端外延的列数（推远的层看得更宽）。 */
const PAD = 48;
const CHUNK = 128;
const SEAM = .05;
/** 衬底与格面的明暗（乘材质色）。 */
const BACKING_SHADE = .8;

interface CellSilhouette {
  readonly root: THREE.Group;
  readonly material: THREE.MeshBasicMaterial;
  dispose(): void;
}

export function createCellSilhouette(options: CellSilhouetteOptions): CellSilhouette {
  const { surface, shift, smooth, lift, seed } = options;
  const width = surface.length;
  if (width === 0) throw new Error('cell-silhouette: empty surface');
  const prefix = new Float64Array(width + 1);
  for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x]! + surface[x]!;
  const top = (column: number): number => {
    const center = Math.min(width - 1, Math.max(0, column + shift));
    const a = Math.max(0, center - smooth), b = Math.min(width, center + smooth + 1);
    return Math.round((prefix[b]! - prefix[a]!) / (b - a) + lift);
  };
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true });
  material.userData.noLightMap = true;
  material.userData.noCloudShadow = true;
  material.userData.noPrecip = true;
  const root = new THREE.Group();
  root.name = 'cell-silhouette';
  const geometries: THREE.BufferGeometry[] = [];
  for (let x0 = -PAD; x0 < width + PAD; x0 += CHUNK) {
    const positions: number[] = [];
    const colors: number[] = [];
    const quad = (xa: number, ya: number, xb: number, yb: number, z: number, shade: number): void => {
      positions.push(xa, ya, z, xb, ya, z, xb, yb, z, xa, ya, z, xb, yb, z, xa, yb, z);
      for (let i = 0; i < 6; i++) colors.push(shade, shade, shade);
    };
    for (let x = x0; x < Math.min(x0 + CHUNK, width + PAD); x++) {
      const y = top(x);
      quad(x, y - BACKING_DEPTH, x + 1, y, 0, BACKING_SHADE);
      for (let row = 1; row <= CELL_ROWS; row++) {
        // 格面明暗随格起伏，越往下越暗，读成有厚度的格子墙而不是平涂剪影。
        const shade = (.9 + .1 * hash01(x, y - row, seed)) * (1 - .035 * (row - 1));
        // 格面略在衬底之前，避免同平面深度冲突。
        quad(x + SEAM, y - row + SEAM, x + 1 - SEAM, y - row + 1 - SEAM, .02, shade);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cell-silhouette-${x0}`;
    root.add(mesh);
  }
  return {
    root,
    material,
    dispose() {
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
