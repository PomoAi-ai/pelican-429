/**
 * 方向光阴影相机拟合（纯函数，不依赖 three，可测）：
 * 让正交阴影相机恰好覆盖“相机可视矩形 × 场景深度范围”的包围盒，并把中心对齐到阴影贴图纹素网格，
 * 相机平移时阴影边缘不闪烁（尺寸只随视口变化，不随位置变化）。
 * 光照基与 three 的 Object3D.lookAt 一致：dir = 指向光源；right = normalize(up × dir)；upL = dir × right（up = +Y）。
 */

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShadowFitInput {
  /** 可视矩形中心（世界 z=0 平面）与半宽高（格）。 */
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** 视野外扩（格）。 */
  readonly margin: number;
  /** 接收阴影的 z 范围。 */
  readonly zMin: number;
  readonly zMax: number;
  /** 视野外（光源一侧）仍需投影进来的遮挡物距离（格）。 */
  readonly casterReach: number;
  /** 从场景指向光源（不必归一化）。 */
  readonly direction: Vec3Like;
  readonly mapSize: number;
}

export interface ShadowFit {
  /** 光源位置与目标（世界）。 */
  readonly position: Vec3Like;
  readonly target: Vec3Like;
  /** 正交相机参数（光照空间，关于目标对称）。 */
  readonly halfRight: number;
  readonly halfUp: number;
  readonly near: number;
  readonly far: number;
  /** 世界单位纹素尺寸（right / up 方向）。 */
  readonly texelRight: number;
  readonly texelUp: number;
}

/** 视锥八角点按 x/y/z 符号位排列；仅拟合与接收阴影深度带相交的部分。 */
export function shadowReceiverBounds(corners: readonly Vec3Like[], zMin: number, zMax: number):
  Pick<ShadowFitInput, 'centerX' | 'centerY' | 'halfWidth' | 'halfHeight'> | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (let index = 0; index < 8; index++) {
    const a = corners[index]!;
    if (a.z >= zMin && a.z <= zMax) include(a.x, a.y);
    for (const bit of [1, 2, 4]) {
      const next = index ^ bit;
      if (next < index) continue;
      const b = corners[next]!;
      if (a.z === b.z) continue;
      for (const z of [zMin, zMax]) {
        const t = (z - a.z) / (b.z - a.z);
        if (t >= 0 && t <= 1) include(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
    }
  }
  if (minX >= maxX || minY >= maxY) return null;
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, halfWidth: (maxX - minX) / 2, halfHeight: (maxY - minY) / 2 };
}

interface Basis {
  readonly d: Vec3Like;
  readonly r: Vec3Like;
  readonly u: Vec3Like;
}

const dot = (a: Vec3Like, b: Vec3Like): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** 光照空间正交基（与 three lookAt 相同的约定）。 */
export function lightBasis(direction: Vec3Like): Basis {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (!(len > 1e-9) || !Number.isFinite(len)) throw new Error(`shadow-fit: invalid light direction (${direction.x},${direction.y},${direction.z})`);
  const d = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
  // right = up × d，up = (0,1,0)：(d.z, 0, -d.x)；光几乎竖直时退化，改用 up = (0,0,1)。
  let r = { x: d.z, y: 0, z: -d.x };
  let rl = Math.hypot(r.x, r.z);
  if (rl < 1e-6) {
    r = { x: -d.y, y: d.x, z: 0 }; // (0,0,1) × d
    rl = Math.hypot(r.x, r.y);
  }
  r = { x: r.x / rl, y: r.y / rl, z: r.z / rl };
  const u = { x: d.y * r.z - d.z * r.y, y: d.z * r.x - d.x * r.z, z: d.x * r.y - d.y * r.x };
  return { d, r, u };
}

export function fitShadowCamera(input: ShadowFitInput): ShadowFit {
  const { centerX, centerY, halfWidth, halfHeight, margin, zMin, zMax, casterReach, mapSize } = input;
  for (const [k, v] of Object.entries({ centerX, centerY, halfWidth, halfHeight, margin, zMin, zMax, casterReach })) {
    if (!Number.isFinite(v)) throw new Error(`shadow-fit: ${k} must be finite, got ${v}`);
  }
  if (!(halfWidth > 0 && halfHeight > 0)) throw new Error(`shadow-fit: invalid half extents ${halfWidth}×${halfHeight}`);
  if (!(margin >= 0 && casterReach >= 0 && zMax > zMin)) throw new Error('shadow-fit: invalid margin / casterReach / z range');
  if (!(Number.isInteger(mapSize) && mapSize > 0)) throw new Error(`shadow-fit: invalid mapSize ${mapSize}`);
  const { d, r, u } = lightBasis(input.direction);

  // 包围盒相对中心的 8 个角在光照基上的投影范围（与中心位置无关 → 尺寸稳定）。
  const hx = halfWidth + margin;
  const hy = halfHeight + margin;
  let rMax = 0;
  let uMax = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const z of [zMin, zMax]) {
        const p = { x: sx * hx, y: sy * hy, z };
        rMax = Math.max(rMax, Math.abs(dot(p, r)));
        uMax = Math.max(uMax, Math.abs(dot(p, u)));
        dMin = Math.min(dMin, dot(p, d));
        dMax = Math.max(dMax, dot(p, d));
      }
    }
  }
  // 关于中心对称取绝对值最大投影（z 范围不对称也被覆盖），再外扩约 1 纹素以容纳中心对齐带来的 ≤ 半纹素偏移。
  const halfRight = rMax * (1 + 2 / mapSize);
  const halfUp = uMax * (1 + 2 / mapSize);
  const texelRight = (2 * halfRight) / mapSize;
  const texelUp = (2 * halfUp) / mapSize;

  // 中心投影到光照基，r/u 分量对齐纹素网格，d 分量保持原值。
  const c = { x: centerX, y: centerY, z: 0 };
  const cr = Math.round(dot(c, r) / texelRight) * texelRight;
  const cu = Math.round(dot(c, u) / texelUp) * texelUp;
  const cd = dot(c, d);
  const target = {
    x: r.x * cr + u.x * cu + d.x * cd,
    y: r.y * cr + u.y * cu + d.y * cd,
    z: r.z * cr + u.z * cu + d.z * cd,
  };
  // 光源放在包围盒最靠光一侧之外 casterReach + 1 处；near/far 覆盖整个盒子。
  const back = dMax + casterReach + 1;
  const position = { x: target.x + d.x * back, y: target.y + d.y * back, z: target.z + d.z * back };
  return { position, target, halfRight, halfUp, near: 0.5, far: back - dMin + 1, texelRight, texelUp };
}
