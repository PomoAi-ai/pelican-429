/**
 * 光照与后期调参（tuning.render.lighting）：类型、默认值、画质解析与唯一校验（validateTuning 调用）。
 * config 层：只依赖 core（不依赖 three）；颜色为 '#rrggbb'，方向为“从场景指向光源”的向量（自动归一化）。
 * 强度类基础值沿用 tuning.render.{exposure,keyLight,hemi,envIntensity}，这里只放新增的光照/后期参数。
 */

export const LIGHTING_QUALITIES = ['low', 'high'] as const;
export type LightingQuality = (typeof LIGHTING_QUALITIES)[number];

/**
 * 抗锯齿：smaa = 后期 SMAA（场景渲染无多重采样）；msaa = 主渲染目标 lighting.msaa 倍多重采样。
 * 任务 019 实测：Chrome/macOS（ANGLE-Metal）上 WebGL 的 MSAA 渲染缓冲（含画布 antialias）按样本执行片元着色（4× 即 4 倍着色量，
 * 且重叠绘制不再被 HSR 剔除），2× DPR 下等同 4 倍超采样；默认改 smaa（像素比不变），?aa=msaa 可切回对比。
 */
export const ANTIALIAS_MODES = ['smaa', 'msaa'] as const;
export type AntialiasMode = (typeof ANTIALIAS_MODES)[number];

export const TONE_MAPPINGS = ['aces', 'agx', 'neutral'] as const;
export type ToneMappingName = (typeof TONE_MAPPINGS)[number];

export const SHADOW_TYPES = ['pcf', 'pcfsoft', 'vsm'] as const;
export type ShadowTypeName = (typeof SHADOW_TYPES)[number];

export interface Direction3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 泰拉瑞亚式瓦片光照（world/light-map）：天空光自上照入，经每格介质按比例衰减传播。 */
export interface LightMapTuning {
  /** 光离开该介质格进入邻格时乘的比例 (0,1)：空气 / 实心 / 水 / 树冠 / 单向平台。 */
  readonly airDecay: number;
  readonly solidDecay: number;
  readonly waterDecay: number;
  readonly foliageDecay: number;
  readonly platformDecay: number;
  /** 水量 ≥ 该值（1..255）的格按水介质计。 */
  readonly waterThreshold: number;
  /** 着色时的最低亮度 [0,1)（0 = 深处全黑）。 */
  readonly minLight: number;
  /** 水量变化扫描间隔（帧，整数 ≥ 1）。 */
  readonly fluidScanFrames: number;
  /** 动态光（光球点光源）：最多同时生效数（1..8）与照亮半径（格）。 */
  readonly dynamicMax: number;
  readonly dynamicRadius: number;
}

export interface LightingTuning {
  /** 默认画质；URL ?quality=low|high 覆盖（见 resolveQuality）。low 关 AO/光束/bloom，仅保留阴影与调色。 */
  readonly quality: LightingQuality;
  /** 设备像素比上限（[0.5, 3]）。 */
  readonly maxPixelRatio: number;
  /** 抗锯齿方式（默认 smaa）；URL ?aa=smaa|msaa 覆盖（见 resolveAntialias）。 */
  readonly antialias: AntialiasMode;
  /** antialias = msaa 时后期主渲染目标的 MSAA 采样数（0/2/4/8）。 */
  readonly msaa: number;
  readonly toneMapping: ToneMappingName;
  readonly lightMap: LightMapTuning;
  /** 主光（午后暖阳）：颜色与方向（强度见 render.keyLight）。 */
  readonly sun: { readonly color: string; readonly direction: Direction3 };
  /** 边缘光：无阴影的反向方向光，勾出轮廓。 */
  readonly rim: { readonly color: string; readonly intensity: number; readonly direction: Direction3 };
  /** 半球光颜色（天空冷蓝 / 地面暖绿；强度见 render.hemi）。 */
  readonly hemi: { readonly sky: string; readonly ground: string };
  readonly shadow: {
    readonly type: ShadowTypeName;
    /** 阴影贴图边长（2 的幂，512..4096）。 */
    readonly mapSize: number;
    /** PCF/VSM 模糊半径（纹素）。 */
    readonly radius: number;
    readonly bias: number;
    readonly normalBias: number;
    /** 阴影浓度 [0,1]（1 = 全黑阴影，配合半球光补光取 < 1 更柔和）。 */
    readonly intensity: number;
    /** 视野外扩（格），避免边缘阴影突然出现。 */
    readonly margin: number;
    /** 接收阴影的世界 z 范围（场景深度方向）。 */
    readonly zMin: number;
    readonly zMax: number;
    /** 视野上方仍能投影进视野的遮挡物距离（沿光线，格）。 */
    readonly casterReach: number;
  };
  /** 远景大气透视：远山按到相机距离混向 color；低处额外 lowBoost。 */
  readonly haze: {
    readonly color: string;
    readonly near: number;
    readonly far: number;
    /** 最远处最大混合比例 [0,1]。 */
    readonly max: number;
    /** 山脚（低于山体中线）额外混合 [0,1]。 */
    readonly lowBoost: number;
  };
  /** 屏幕空间环境光遮蔽（GTAO，按深度重建法线，不额外渲染场景）。 */
  readonly ao: {
    /** 世界半径（格）。 */
    readonly radius: number;
    readonly distanceExponent: number;
    readonly thickness: number;
    readonly scale: number;
    readonly samples: number;
    /** 降噪采样数（整数 2..32）。 */
    readonly denoiseSamples: number;
    /** 叠加强度 [0,1]。 */
    readonly intensity: number;
    /** AO 缓冲相对画布的分辨率比例 (0,1]（0.5 = 半分辨率）。 */
    readonly resolutionScale: number;
  };
  readonly bloom: {
    readonly strength: number;
    readonly radius: number;
    /** 线性 HDR 亮度阈值。 */
    readonly threshold: number;
    /** 相对画布的分辨率比例 (0,1]。 */
    readonly resolutionScale: number;
  };
  /** 色彩分级（色调映射之后，显示空间）。 */
  readonly grade: {
    /** 白平衡乘子（暖调：r>1, b<1）。 */
    readonly tint: string;
    /** 对比度（1 = 不变，围绕 0.5）。 */
    readonly contrast: number;
    /** 饱和度（1 = 不变）。 */
    readonly saturation: number;
    /** 暗角强度 [0,1] 与起始半径（中心到角为 1）。 */
    readonly vignette: number;
    readonly vignetteStart: number;
  };
  /** 体积光束：加色渐隐面片（树冠下 + 天空斜射）。 */
  readonly shafts: {
    readonly color: string;
    /** 峰值强度（加色，线性）。 */
    readonly intensity: number;
    /** 同屏最多光束数（整数 1..32）。 */
    readonly maxCount: number;
    readonly width: number;
    /** 天空光束锚点间距（格）与出现概率 [0,1]。 */
    readonly skySpacing: number;
    readonly skyChance: number;
    /** 天空光束顶端高出地表（格）。 */
    readonly skyHeight: number;
    /** 树冠光束出现概率 [0,1]。 */
    readonly treeChance: number;
    /** 光束面片 z（树冠之后、地块后沿附近）。 */
    readonly z: number;
    /** 明暗呼吸速度（弧度/秒）。 */
    readonly pulseSpeed: number;
  };
}

export const DEFAULT_LIGHTING: LightingTuning = {
  quality: 'high',
  maxPixelRatio: 2,
  antialias: 'smaa',
  msaa: 4,
  toneMapping: 'neutral',
  lightMap: {
    airDecay: 0.9,
    solidDecay: 0.45,
    waterDecay: 0.76,
    foliageDecay: 0.86,
    platformDecay: 0.9,
    waterThreshold: 96,
    minLight: 0,
    fluidScanFrames: 4,
    dynamicMax: 4,
    dynamicRadius: 7,
  },
  sun: { color: '#fff3e0', direction: { x: -0.62, y: 0.55, z: 0.56 } },
  rim: { color: '#fff0dc', intensity: 0.7, direction: { x: 0.6, y: 0.35, z: -0.72 } },
  hemi: { sky: '#bcd8ff', ground: '#9cae6e' },
  shadow: {
    type: 'pcf',
    mapSize: 2048,
    radius: 2,
    bias: -0.0004,
    normalBias: 0.025,
    intensity: 0.8,
    margin: 3,
    zMin: -3,
    zMax: 1.5,
    casterReach: 24,
  },
  haze: { color: '#b4cfe8', near: 35, far: 90, max: 0.38, lowBoost: 0.12 },
  ao: { radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 6, denoiseSamples: 4, intensity: 0.85, resolutionScale: 0.5 },
  bloom: { strength: 0.16, radius: 0.35, threshold: 1.6, resolutionScale: 0.5 },
  grade: { tint: '#fffaf2', contrast: 1.05, saturation: 1.06, vignette: 0.14, vignetteStart: 0.6 },
  shafts: {
    color: '#ffe6b0',
    intensity: 0.16,
    maxCount: 6,
    width: 2.6,
    skySpacing: 23,
    skyChance: 0.45,
    skyHeight: 22,
    treeChance: 0.7,
    z: -1.25,
    pulseSpeed: 0.6,
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${JSON.stringify(value)}`);
}

function num(path: string, v: number, min: number, max: number, minOpen = false): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
  if ((minOpen ? v <= min : v < min) || v > max) fail(path, `must be in ${minOpen ? '(' : '['}${min},${max}]`, v);
}

function int(path: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer in [${min},${max}]`, v);
}

function color(path: string, v: string): void {
  if (typeof v !== 'string' || !HEX.test(v)) fail(path, "must be a '#rrggbb' color", v);
}

function oneOf<T extends string>(path: string, v: T, allowed: readonly T[]): void {
  if (!allowed.includes(v)) fail(path, `must be one of ${allowed.join('|')}`, v);
}

function direction(path: string, d: Direction3): void {
  num(`${path}.x`, d.x, -1e3, 1e3);
  num(`${path}.y`, d.y, -1e3, 1e3);
  num(`${path}.z`, d.z, -1e3, 1e3);
  if (Math.hypot(d.x, d.y, d.z) < 1e-6) fail(path, 'must be a non-zero vector', d);
}

/** 校验 render.lighting，非法即抛（错误信息含字段路径）。 */
export function validateLightingTuning(l: LightingTuning, path: string): void {
  oneOf(`${path}.quality`, l.quality, LIGHTING_QUALITIES);
  num(`${path}.maxPixelRatio`, l.maxPixelRatio, 0.5, 3);
  oneOf(`${path}.antialias`, l.antialias, ANTIALIAS_MODES);
  if (![0, 2, 4, 8].includes(l.msaa)) fail(`${path}.msaa`, 'must be one of 0|2|4|8', l.msaa);
  oneOf(`${path}.toneMapping`, l.toneMapping, TONE_MAPPINGS);

  const m = l.lightMap;
  for (const k of ['airDecay', 'solidDecay', 'waterDecay', 'foliageDecay', 'platformDecay'] as const) {
    if (typeof m[k] !== 'number' || !(m[k] > 0 && m[k] < 1)) fail(`${path}.lightMap.${k}`, 'must be in (0,1)', m[k]);
  }
  int(`${path}.lightMap.waterThreshold`, m.waterThreshold, 1, 255);
  num(`${path}.lightMap.minLight`, m.minLight, 0, 0.99);
  int(`${path}.lightMap.fluidScanFrames`, m.fluidScanFrames, 1, 600);
  int(`${path}.lightMap.dynamicMax`, m.dynamicMax, 1, 8);
  num(`${path}.lightMap.dynamicRadius`, m.dynamicRadius, 0, 100, true);

  color(`${path}.sun.color`, l.sun.color);
  direction(`${path}.sun.direction`, l.sun.direction);
  if (!(l.sun.direction.y > 0)) fail(`${path}.sun.direction.y`, 'must be > 0 (sun above the horizon)', l.sun.direction.y);
  color(`${path}.rim.color`, l.rim.color);
  num(`${path}.rim.intensity`, l.rim.intensity, 0, 10);
  direction(`${path}.rim.direction`, l.rim.direction);
  color(`${path}.hemi.sky`, l.hemi.sky);
  color(`${path}.hemi.ground`, l.hemi.ground);

  const s = l.shadow;
  oneOf(`${path}.shadow.type`, s.type, SHADOW_TYPES);
  if (!(Number.isInteger(s.mapSize) && s.mapSize >= 512 && s.mapSize <= 4096 && (s.mapSize & (s.mapSize - 1)) === 0)) {
    fail(`${path}.shadow.mapSize`, 'must be a power of two in [512,4096]', s.mapSize);
  }
  num(`${path}.shadow.radius`, s.radius, 0, 16);
  num(`${path}.shadow.bias`, s.bias, -0.01, 0.01);
  num(`${path}.shadow.normalBias`, s.normalBias, 0, 0.5);
  num(`${path}.shadow.intensity`, s.intensity, 0, 1);
  num(`${path}.shadow.margin`, s.margin, 0, 50);
  num(`${path}.shadow.zMin`, s.zMin, -100, 100);
  num(`${path}.shadow.zMax`, s.zMax, -100, 100);
  if (!(s.zMax > s.zMin)) fail(`${path}.shadow.zMax`, `must be > ${path}.shadow.zMin (${s.zMin})`, s.zMax);
  num(`${path}.shadow.casterReach`, s.casterReach, 0, 500);

  const h = l.haze;
  color(`${path}.haze.color`, h.color);
  num(`${path}.haze.near`, h.near, 0, 1e4);
  num(`${path}.haze.far`, h.far, 0, 1e4);
  if (!(h.far > h.near)) fail(`${path}.haze.far`, `must be > ${path}.haze.near (${h.near})`, h.far);
  num(`${path}.haze.max`, h.max, 0, 1);
  num(`${path}.haze.lowBoost`, h.lowBoost, 0, 1);

  const a = l.ao;
  num(`${path}.ao.radius`, a.radius, 0, 20, true);
  num(`${path}.ao.distanceExponent`, a.distanceExponent, 0, 8, true);
  num(`${path}.ao.thickness`, a.thickness, 0, 20, true);
  num(`${path}.ao.scale`, a.scale, 0, 4, true);
  int(`${path}.ao.samples`, a.samples, 2, 32);
  int(`${path}.ao.denoiseSamples`, a.denoiseSamples, 2, 32);
  num(`${path}.ao.intensity`, a.intensity, 0, 1);
  num(`${path}.ao.resolutionScale`, a.resolutionScale, 0, 1, true);

  num(`${path}.bloom.strength`, l.bloom.strength, 0, 5);
  num(`${path}.bloom.radius`, l.bloom.radius, 0, 1);
  num(`${path}.bloom.threshold`, l.bloom.threshold, 0, 20);
  num(`${path}.bloom.resolutionScale`, l.bloom.resolutionScale, 0, 1, true);

  const g = l.grade;
  color(`${path}.grade.tint`, g.tint);
  num(`${path}.grade.contrast`, g.contrast, 0, 3, true);
  num(`${path}.grade.saturation`, g.saturation, 0, 3);
  num(`${path}.grade.vignette`, g.vignette, 0, 1);
  num(`${path}.grade.vignetteStart`, g.vignetteStart, 0, 1.5);

  const b = l.shafts;
  color(`${path}.shafts.color`, b.color);
  num(`${path}.shafts.intensity`, b.intensity, 0, 2);
  int(`${path}.shafts.maxCount`, b.maxCount, 1, 32);
  num(`${path}.shafts.width`, b.width, 0, 50, true);
  num(`${path}.shafts.skySpacing`, b.skySpacing, 1, 1e3);
  num(`${path}.shafts.skyChance`, b.skyChance, 0, 1);
  num(`${path}.shafts.skyHeight`, b.skyHeight, 0, 500, true);
  num(`${path}.shafts.treeChance`, b.treeChance, 0, 1);
  num(`${path}.shafts.z`, b.z, -100, 100);
  num(`${path}.shafts.pulseSpeed`, b.pulseSpeed, 0, 50);
}

/**
 * 画质：URL 参数（?quality=）存在即必须是 low|high（非法即抛，不静默回退），否则用调参默认值。
 */
export function resolveQuality(param: string | null, fallback: LightingQuality): LightingQuality {
  if (param === null) return fallback;
  if (!(LIGHTING_QUALITIES as readonly string[]).includes(param)) {
    throw new Error(`lighting: invalid ?quality=${param} (expected ${LIGHTING_QUALITIES.join('|')})`);
  }
  return param as LightingQuality;
}

/** 抗锯齿：URL 参数（?aa=）存在即必须是 smaa|msaa（非法即抛），否则用调参默认值。 */
export function resolveAntialias(param: string | null, fallback: AntialiasMode): AntialiasMode {
  if (param === null) return fallback;
  if (!(ANTIALIAS_MODES as readonly string[]).includes(param)) {
    throw new Error(`lighting: invalid ?aa=${param} (expected ${ANTIALIAS_MODES.join('|')})`);
  }
  return param as AntialiasMode;
}
