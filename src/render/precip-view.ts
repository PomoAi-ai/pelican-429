/**
 * 降水视图装配（任务 022）：控制器（render/precip）+ 列数据（precip-columns）+ 雨（rain-fx）+ 雪（snow-fx）+ 天色（precip-sky）
 * + 表面湿润/积雪注入（precip-surface，按 PATCH_FRAMES 帧补挂新材质，与 world-views 云影同节奏）。
 * 每帧 update(view, time, dt, target, power)：target 为逻辑层降水状态（world.env.precip），time 为单调渲染时间。
 * draw call：雨丝 / 溅射 / 滴水 / 雪花 / 雾幕 / 闪电 各至多 1（大雨 ≤ 5，大雪 ≤ 2；无降水 0）。
 */
import type * as THREE from 'three';
import { DEFAULT_PRECIP, validatePrecipTuning } from '../config/precip-rules.ts';
import type { PrecipState, PrecipTuning } from '../config/precip-rules.ts';
import type { Rect } from '../core/math.ts';
import type { LevelData } from '../world/level.ts';
import { createPrecipColumns } from './precip-columns.ts';
import type { PrecipColumns } from './precip-columns.ts';
import { createPrecipController } from './precip.ts';
import type { PrecipController, PrecipPower } from './precip.ts';
import { createPrecipSky } from './precip-sky.ts';
import type { PrecipSky, PrecipSkyTargets } from './precip-sky.ts';
import { createPrecipSurfacePatcher, sharedPrecipUniforms } from './precip-surface.ts';
import type { PrecipSurfacePatcher } from './precip-surface.ts';
import { createRainFx } from './rain-fx.ts';
import type { PrecipCamera, RainFx } from './rain-fx.ts';
import { createSnowFx } from './snow-fx.ts';
import type { SnowFx } from './snow-fx.ts';
import type { WorldViews } from './world-views.ts';

/** 表面注入补挂间隔（帧；首帧即挂）与列数据刷新间隔（帧）、刷新外扩列数。 */
export const PRECIP_PATCH_FRAMES = 30;
export const PRECIP_COLUMN_FRAMES = 15;
const COLUMN_MARGIN = 12;

/** 需要湿润/积雪的世界视图子树：地表瓦片（含花草）、树、渔屋、地表装饰、浮空岛（水面/水草/洞穴/特效不挂）。 */
export function precipSurfaceRoots(views: Pick<WorldViews, 'tiles' | 'trees' | 'structures' | 'decor' | 'skyIslands'>): THREE.Object3D[] {
  return [views.tiles.root, views.trees.root, views.structures.root, views.decor.root, views.skyIslands.root];
}

export interface PrecipViewInput {
  readonly scene: THREE.Object3D;
  readonly level: Pick<LevelData, 'map' | 'fluid' | 'deserts' | 'trees'>;
  readonly camera: PrecipCamera;
  /** 舞台灯光/天空/调色/云（precip-sky）。 */
  readonly sky: Omit<PrecipSkyTargets, 'scene'> & { readonly scene: THREE.Scene };
  /** 需要湿润/积雪的子树（地表瓦片/树/渔屋/装饰/浮空岛）；每次补挂时调用。 */
  readonly surfaces: () => readonly THREE.Object3D[];
  /** 视野中心风摆（windSway），雨雪漂移用。 */
  readonly windSway: (x: number) => number;
  readonly rules?: PrecipTuning;
}

export interface PrecipStats {
  readonly target: PrecipState;
  readonly streaks: number;
  readonly splashes: number;
  readonly flakes: number;
  readonly drips: number;
  readonly wetness: number;
  readonly snowCover: number;
  readonly flash: number;
  /** 本模块当前可见网格数（= 新增 draw call）。 */
  readonly meshes: number;
  readonly patched: number;
}

export interface PrecipView {
  readonly controller: PrecipController;
  readonly columns: PrecipColumns;
  readonly rain: RainFx;
  readonly snow: SnowFx;
  readonly sky: PrecipSky;
  readonly surface: PrecipSurfacePatcher;
  update(view: Readonly<Rect>, time: number, dt: number, target: PrecipState, power: PrecipPower): void;
  stats(): PrecipStats;
  dispose(): void;
}

export function createPrecipView(input: PrecipViewInput): PrecipView {
  const rules = input.rules ?? DEFAULT_PRECIP;
  validatePrecipTuning(rules);
  const { level, scene, camera } = input;
  if (!scene || !level?.map || !level.fluid || !camera) throw new Error('precip-view: scene, level (map/fluid) and camera are required');
  const columns = createPrecipColumns({ map: level.map, fluid: level.fluid, deserts: level.deserts, desertFactor: rules.snow.desertFactor });
  const uniforms = sharedPrecipUniforms();
  uniforms.uPrCols.value = columns.texture;
  uniforms.uPrColsW.value = columns.width;
  const controller = createPrecipController(rules);
  const rain = createRainFx({ rules, map: level.map, roof: (tx) => columns.at(tx).roof, trees: level.trees });
  const snow = createSnowFx(rules);
  const sky = createPrecipSky(input.sky, rules.seed);
  const surface = createPrecipSurfacePatcher(uniforms);
  scene.add(rain.root, snow.root, sky.root);
  let frame = 0;
  let disposed = false;

  const meshes = (): number => [rain.streaks, rain.splashes, rain.drips, snow.flakes, sky.veil, sky.bolt].filter((m) => m.visible).length;

  return {
    controller,
    columns,
    rain,
    snow,
    sky,
    surface,
    update(view, time, dt, target, power) {
      if (disposed) throw new Error('precip-view: update after dispose');
      const cx = view.x + view.w / 2;
      controller.update(time, dt, target, input.windSway(cx), power);
      if (frame % PRECIP_COLUMN_FRAMES === 0) columns.refresh(view.x - COLUMN_MARGIN, view.x + view.w + COLUMN_MARGIN);
      if (frame % PRECIP_PATCH_FRAMES === 0) for (const r of input.surfaces()) surface.patchTree(r);
      frame++;
      const v = controller.visual;
      uniforms.uPrWet.value = controller.wetness;
      uniforms.uPrSnow.value = controller.snowCover;
      uniforms.uPrRipple.value = Math.min(1, v.splash);
      const flash = controller.lightning;
      sky.update({ visual: v, lightning: flash, camera, view });
      const bright = sky.look?.particle ?? 1;
      rain.update({
        time,
        view,
        camera,
        density: v.rain,
        speed: v.rainSpeed,
        length: v.rainLength,
        width: v.rainWidth,
        fall: controller.rainFall,
        drift: controller.rainDrift,
        splash: v.splash,
        drip: v.drip,
        brightness: bright,
      });
      snow.update({
        time,
        camera,
        density: v.snow,
        size: v.flakeSize,
        fall: controller.snowFall,
        drift: controller.snowDrift,
        big: Math.min(1, Math.max(0, (v.snow - 0.6) / 0.4)),
        brightness: Math.min(1.2, 0.35 + 0.65 * bright),
      });
    },
    stats() {
      return {
        target: controller.target,
        streaks: rain.streakCount,
        splashes: rain.splashCount,
        flakes: snow.flakeCount,
        drips: rain.dripEmitters,
        wetness: controller.wetness,
        snowCover: controller.snowCover,
        flash: controller.lightning.flash,
        meshes: meshes(),
        patched: surface.patched,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rain.dispose();
      snow.dispose();
      sky.dispose();
      columns.dispose();
      uniforms.uPrWet.value = 0;
      uniforms.uPrSnow.value = 0;
      uniforms.uPrRipple.value = 0;
    },
  };
}
