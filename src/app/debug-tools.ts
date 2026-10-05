/**
 * ?debug 调试工具（从 main.ts 拆出，任务 019 收尾）：V 循环风、T 假人射击、F/中键倒水、降水调试键，
 * 以及 window.__pelicanGame 只读调试句柄。监听器的移除统一登记到 disposers。
 */
import type { AntialiasMode, LightingQuality } from '../config/lighting-rules.ts';
import type { Vec2 } from '../core/math.ts';
import { dummyShooting, pourFluid, setDummyShooting, setPrecipMode } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import type { WorldViews } from '../render/world-views.ts';
import { installPrecipDebugKey } from '../ui/precip-debug.ts';
import type { LevelData } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';

/** 地图内容哈希（FNV-1a over tile ids + 形状通道 + 当前水量），供 ?debug 下比较同种子两次加载是否一致。 */
export function mapHash(map: TileQuery, fluidCells: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      h ^= map.get(tx, ty);
      h = Math.imul(h, 0x01000193);
      h ^= map.shapeAt(tx, ty);
      h = Math.imul(h, 0x01000193);
    }
  }
  for (let i = 0; i < fluidCells.length; i++) {
    h ^= fluidCells[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface PourState {
  readonly active: boolean;
}

export const NO_POUR: PourState = Object.freeze({ active: false });

/** ?debug：按 V 循环天气 微风 → 大风 → 自动（平滑过渡）；监听器移除登记到 disposers。 */
function installDebugWind(worldViews: WorldViews, disposers: Array<() => void>): void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const mode = worldViews.weather.wind.cycleMode();
    console.info(`[weather] wind mode → ${mode}`);
  };
  window.addEventListener('keydown', onKeyDown);
  disposers.push(() => window.removeEventListener('keydown', onKeyDown));
}

/** ?debug：按 T 开关训练假人“射击模式”（通用敌方投射物演示，任务 018）；监听器移除登记到 disposers。 */
function installDebugDummyShoot(world: SimWorld, disposers: Array<() => void>): void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const on = !dummyShooting(world);
    const n = setDummyShooting(world, on);
    console.info(`[weapons] dummy shooting ${on ? 'on' : 'off'} (${n} shooters)`);
  };
  window.addEventListener('keydown', onKeyDown);
  disposers.push(() => window.removeEventListener('keydown', onKeyDown));
}

/**
 * ?debug 调试倒水：画布上按住鼠标中键或按住 F 时 active=true（每 tick 在指针处倒一满格水，见帧循环 tick）。
 * 监听器的移除登记到 disposers。
 */
function installDebugPour(canvas: HTMLCanvasElement, disposers: Array<() => void>): PourState {
  const pour = { mouse: false, key: false };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 1) return;
    e.preventDefault(); // 阻止中键自动滚动
    pour.mouse = true;
  };
  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 1) pour.mouse = false;
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyF' && !(e.ctrlKey || e.metaKey || e.altKey)) pour.key = true;
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyF') pour.key = false;
  };
  const onBlur = (): void => {
    pour.mouse = false;
    pour.key = false;
  };
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  disposers.push(() => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  });
  return {
    get active() {
      return pour.mouse || pour.key;
    },
  };
}

/**
 * ?debug 按键（倒水 F/中键、风 V、降水调试键、假人射击 T），按原 main.ts 的顺序注册；非调试模式什么也不装，返回 NO_POUR。
 */
export function installDebugKeys(debug: boolean, canvas: HTMLCanvasElement, world: SimWorld, worldViews: WorldViews, disposers: Array<() => void>): PourState {
  if (!debug) return NO_POUR;
  const pour = installDebugPour(canvas, disposers);
  installDebugWind(worldViews, disposers);
  disposers.push(installPrecipDebugKey(window, () => world.env.mode, (mode) => void setPrecipMode(world, mode)));
  installDebugDummyShoot(world, disposers);
  return pour;
}

/** 在世界坐标 at（夹到地图内）倒一满格水；at 为 null（指针不在世界平面上）则不倒。 */
export function pourAtWorld(world: SimWorld, level: LevelData, at: Vec2 | null): void {
  if (!at) return;
  const EDGE = 1e-3;
  const x = Math.min(Math.max(at.x, 0), level.map.width - EDGE);
  const y = Math.min(Math.max(at.y, 0), level.map.height - EDGE);
  pourFluid(world, x, y, 255);
}

export interface DebugHandles {
  readonly world: SimWorld;
  readonly stage: unknown;
  readonly views: unknown;
  readonly cameraRig: unknown;
  readonly tracker: unknown;
  readonly stepper: unknown;
  readonly level: LevelData;
  readonly worldViews: WorldViews;
  readonly orbs: unknown;
  readonly orbFx: unknown;
  readonly projectileFx: unknown;
  readonly weaponHud: unknown;
  readonly shafts: unknown;
  readonly worldLight: unknown;
  readonly minimap: unknown;
  /** 切换画质（high/low），用于 FPS 对比。 */
  readonly setQuality: (quality: LightingQuality) => void;
  /** 切换抗锯齿（smaa/msaa）。 */
  readonly setAntialias: (mode: AntialiasMode) => void;
  /** 设置面板控制器（open/set/current）。 */
  readonly settings: unknown;
  /** 022 降水视图（stats()/controller）。 */
  readonly precip: unknown;
}

/**
 * ?debug：暴露内部对象为 window.__pelicanGame，供浏览器冒烟测试/调试读取状态（只读约定）。
 * fish = 模拟小鱼；structures = 渔屋数据；worldStats() = 鱼/渔屋/水草/花瓣/已加载花草统计。
 */
export function exposeDebug(h: DebugHandles): void {
  const { world, level, worldViews } = h;
  Object.assign(window, {
    __pelicanGame: {
      ...h,
      tiles: worldViews.tiles,
      trees: worldViews.trees,
      water: worldViews.water,
      weather: worldViews.weather,
      fluid: world.fluid,
      fish: world.fish,
      structures: level.structures,
      worldStats: () => worldViews.stats(),
      fluidMass: () => world.fluid.totalMass(),
      mapHash: () => mapHash(level.map, world.fluid.cells),
    },
  });
}
