/**
 * 鹈鹕自带微光（021 追加，类似 Terraria 玩家在暗处仍能看清自己周围）的集中调参与校验（config 层；fail-fast）。
 * 渲染层 render/pelican-aura 按所在位置的环境光照图亮度反向淡入：环境亮度 ≥ DARK_START 时不起作用，≤ DARK_FULL 时全强度，
 * 之间 smoothstep；强度按指数平滑过渡（时间常数 FADE_TIME，进出洞口约 0.5 s）。水下用 WATER_* （略弱、偏青）。
 * 修复轮 B：光色暖白略偏黄（原 [1,.9,.74] 照在偏紫洞壁上泛粉）；背景墙（洞壁背板）只接收 wallReceive 倍，以鹈鹕与近地面为主。
 */

export interface AuraTuning {
  /** 光圈半径（瓦片，2D 距离平滑衰减到 0）。 */
  readonly radius: number;
  /** 光圈中心亮度 [0,1]（与光照图取最大；远弱于光球的 1）。 */
  readonly intensity: number;
  /** 水下中心亮度 [0,1]（略弱）。 */
  readonly waterIntensity: number;
  /** 暖白光色（线性 RGB 0..1，乘到亮度上；略偏黄：G 接近 R、B 较低，照在偏紫洞壁上不泛粉）。 */
  readonly color: readonly [number, number, number];
  /** 水下偏青光色。 */
  readonly waterColor: readonly [number, number, number];
  /** 环境亮度 [0,1] 低于该值开始淡入。 */
  readonly darkStart: number;
  /** 环境亮度低于等于该值时全强度（< darkStart）。 */
  readonly darkFull: number;
  /** 强度平滑时间常数（秒）。 */
  readonly fadeTime: number;
  /** 光圈中心相对脚底的高度（瓦片，约身体中部）。 */
  readonly offsetY: number;
  /** 鹈鹕自身材质的最低亮度 [0,1)（光照图 max(·, floor)；全黑洞内仍能看清轮廓）。 */
  readonly bodyFloor: number;
  /** 背景墙（洞壁背板）对微光的接收系数 [0,1]（< 1：墙上光晕淡，鹈鹕与近地面为主）。 */
  readonly wallReceive: number;
}

export const DEFAULT_AURA: AuraTuning = Object.freeze({
  radius: 3.6,
  intensity: 0.4,
  waterIntensity: 0.3,
  color: Object.freeze([1.0, 0.96, 0.78]) as readonly [number, number, number],
  waterColor: Object.freeze([0.62, 0.95, 1.0]) as readonly [number, number, number],
  darkStart: 0.35,
  darkFull: 0.1,
  fadeTime: 0.18,
  offsetY: 1.1,
  bodyFloor: 0.14,
  wallReceive: 0.5,
});

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${String(value)}`);
}
function range(path: string, v: number, lo: number, hi: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(path, `must be in [${lo},${hi}]`, v);
}

export function validateAuraTuning(a: AuraTuning, path = 'aura'): void {
  range(`${path}.radius`, a.radius, 0.5, 12);
  range(`${path}.intensity`, a.intensity, 0, 1);
  range(`${path}.waterIntensity`, a.waterIntensity, 0, 1);
  for (const k of ['color', 'waterColor'] as const) {
    const c = a[k];
    if (!Array.isArray(c) || c.length !== 3) fail(`${path}.${k}`, 'must be an RGB triple', c);
    c.forEach((v, i) => range(`${path}.${k}[${i}]`, v, 0, 1));
  }
  range(`${path}.darkStart`, a.darkStart, 0.01, 1);
  range(`${path}.darkFull`, a.darkFull, 0, 1);
  if (!(a.darkFull < a.darkStart)) fail(`${path}.darkFull`, `must be < ${path}.darkStart (${a.darkStart})`, a.darkFull);
  range(`${path}.fadeTime`, a.fadeTime, 0.01, 5);
  range(`${path}.offsetY`, a.offsetY, 0, 5);
  range(`${path}.bodyFloor`, a.bodyFloor, 0, 0.5);
  range(`${path}.wallReceive`, a.wallReceive, 0, 1);
}

validateAuraTuning(DEFAULT_AURA);
