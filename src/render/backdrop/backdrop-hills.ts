/**
 * 种子远山：三层连续山脊，山顶、坡肩、山脚沿 z 展开；每层一个网格，高度围绕地表均值。
 * 按旧层距（DEPTH_FLAT 的三层远景）建模并混入大气雾色；挂进背景层时由层组推到方案 G 层距并放大补偿。
 * 只做地表（无洞穴），不投射/接收阴影，材质不接受雾（靠自身配色变淡）。纯 three 对象，可脱离浏览器测试。
 */
import * as THREE from 'three';
import { hash01, valueNoise1D } from '../../core/rng.ts';
import type { LightingTuning } from '../../config/lighting-rules.ts';
import { DEPTH_FLAT } from '../../config/depth-layers.ts';

export interface HillsOptions {
  readonly width: number;
  /** 每列地面高度（建议 groundSurface：只计厚实心，不含树平台），长度必须等于 width。 */
  readonly surface: Int16Array;
  /** 大气透视（缺省 = 不混雾色）；cameraDistance 为相机到 z=0 平面距离。 */
  readonly haze?: HillsHaze;
}

interface HillsHaze extends Readonly<LightingTuning['haze']> {
  readonly cameraDistance: number;
}

type HillLayer = 'near' | 'middle' | 'far';

export interface Hills {
  readonly root: THREE.Group;
  readonly layers: Readonly<Record<HillLayer, THREE.Mesh>>;
  dispose(): void;
}

/** 大气透视混合比例：距离 near→far 之间按 smoothstep 从 0 升到 max。 */
export function hazeFactor(distance: number, haze: Pick<LightingTuning['haze'], 'near' | 'far' | 'max'>): number {
  if (!Number.isFinite(distance)) throw new Error(`backdrop: invalid haze distance ${distance}`);
  if (!(haze.far > haze.near)) throw new Error(`backdrop: haze.far (${haze.far}) must be > haze.near (${haze.near})`);
  const t = Math.min(1, Math.max(0, (distance - haze.near) / (haze.far - haze.near)));
  return haze.max * t * t * (3 - 2 * t);
}

export function createHills(options: HillsOptions): Hills {
  const { width, surface } = options;
  if (!(Number.isInteger(width) && width > 0)) throw new Error(`backdrop: invalid map width ${width}`);
  if (surface.length !== width) throw new Error(`backdrop: surface length ${surface.length} does not match map width ${width}`);
  let sum = 0;
  for (let x = 0; x < width; x++) sum += surface[x] as number;
  const mean = sum / width;
  /** 以 x 为中心、半宽 r 的地表均值（让远山轻微随地形起伏）。 */
  const localMean = (x: number, r: number): number => {
    let s = 0;
    let n = 0;
    for (let c = Math.max(0, Math.floor(x - r)); c <= Math.min(width - 1, Math.ceil(x + r)); c++, n++) s += surface[c] as number;
    return n > 0 ? s / n : mean;
  };

  const root = new THREE.Group();
  root.name = 'backdrop-hills';
  const resources: Array<{ dispose(): void }> = [];

  const haze = options.haze;
  const hazeColor = haze ? new THREE.Color(haze.color) : null;
  // 不同尺度的连续噪声让峰谷错落，实际 z 间距在移动和转动镜头时产生视差。
  const layers = [
    { name: 'far', z: DEPTH_FLAT.distance['distance-far'], color: '#96adbd', rise: 23, amplitude: 19, span: 55, depth: 8, seed: 0x4138 },
    { name: 'middle', z: DEPTH_FLAT.distance['distance-mid'], color: '#7b9f9d', rise: 13, amplitude: 13, span: 36, depth: 6, seed: 0x7251 },
    { name: 'near', z: DEPTH_FLAT.distance['distance-near'], color: '#6d9485', rise: 4, amplitude: 8, span: 26, depth: 4, seed: 0x9357 },
  ] as const;
  const layerMeshes = {} as Record<HillLayer, THREE.Mesh>;
  const skirtBottom = -40;
  for (const layer of layers) {
    const pad = 180;
    const segments = Math.ceil((width + 2 * pad) / 2.5);
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const base = new THREE.Color(layer.color);
    const sunlit = base.clone().lerp(new THREE.Color('#e5dec3'), 0.16);
    const distanceFog = haze ? hazeFactor(haze.cameraDistance - layer.z, haze) : 0;
    const c = new THREE.Color();
    for (let i = 0; i <= segments; i++) {
      const x = -pad + (width + 2 * pad) * i / segments;
      const broad = valueNoise1D(x / layer.span, layer.seed);
      const shoulder = valueNoise1D(x / (layer.span * 0.39), layer.seed + 1);
      const detail = valueNoise1D(x / 5.5, layer.seed + 2);
      const crest = mean + (localMean(x, 40) - mean) * 0.18 + layer.rise
        + layer.amplitude * (0.72 * broad + 0.23 * shoulder + 0.05 * detail);
      const slope = 7 + layer.amplitude * (0.35 + 0.25 * hash01(i, 0, layer.seed));
      for (let row = 0; row < 3; row++) {
        const y = row === 0 ? crest : row === 1 ? crest - slope : skirtBottom;
        positions.push(x, y, row * layer.depth * 0.5);
        // 坡肩用缓慢变化的明暗表现折面，山脚淡入雾色，避免整片纯色墙。
        const light = row === 0 ? 0.3 : row === 1 ? 0.15 + 0.55 * (shoulder * 0.5 + 0.5) : 0;
        c.copy(base).lerp(sunlit, light);
        if (haze && hazeColor) c.lerp(hazeColor, Math.min(0.88, distanceFog + haze.lowBoost * (row === 2 ? 4.3 : row === 1 ? 1 : 0)));
        colors.push(c.r, c.g, c.b);
      }
      if (i < segments) {
        for (let row = 0; row < 2; row++) {
          const a = i * 3 + row;
          indices.push(a, a + 1, a + 3, a + 3, a + 1, a + 4);
        }
      }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    merged.setIndex(indices);
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    material.userData.noLightMap = true; // 远景不受瓦片光照影响（见 light-field-material）
    resources.push(merged, material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `backdrop-hills-${layer.name}`;
    mesh.position.z = layer.z;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    layerMeshes[layer.name] = mesh;
  }

  return {
    root,
    layers: layerMeshes,
    dispose() {
      root.removeFromParent();
      root.clear();
      for (const mesh of Object.values(layerMeshes)) mesh.removeFromParent();
      for (const r of resources) r.dispose();
      resources.length = 0;
    },
  };
}
