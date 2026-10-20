/**
 * 昼夜与天气接线：昼夜（render/sky/daylight）写基础灯光，降水视图（雨雪粒子/天色/湿润积雪）乘天气后写到舞台灯光、
 * 调色与云层，是唯一写灯光的一方；天气状态只取逻辑层 world.env，与世界视图同帧同节奏更新。
 */
import * as THREE from 'three';
import { DEFAULT_PRECIP } from '../../config/precip-rules.ts';
import { lerp } from '../../core/math.ts';
import type { Daylight } from '../../render/sky/daylight.ts';
import type { FreeWorldBackgroundView } from '../../render/sky/free-world-background.ts';
import type { LightShafts } from '../../render/sky/light-shafts.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import type { FacilityChapterId } from '../../config/facility-scenes.ts';
import { createPrecipView, levelPrecipSource, precipSurfaceRoots } from '../../render/sky/precip-view.ts';
import type { PrecipView } from '../../render/sky/precip-view.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import type { WorldViews } from '../../render/stage/world-views.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import type { LevelData } from '../../world/level.ts';

export interface EnvironmentViews {
  readonly precipView: PrecipView;
  /** 按相机可视范围（外扩 2 格）更新世界视图与降水视图：time = 环境时间（水/风），dt = 本帧世界步长。 */
  readonly update: (time: number, dt: number, alpha: number) => void;
}

/** 章节和独立预览采用同一场雨夹雪；室内章节不继承沙盒天气。 */
export function facilityWeather(sceneId: FacilityChapterId) {
  const outside = sceneId === 'fortress';
  return {
    wind: outside ? 'breeze' as const : 'calm' as const,
    windPower: 1, windDirection: 'right' as const,
    precip: 'manual' as const,
    rain: outside ? 'medium' as const : 'none' as const,
    snow: outside ? 'medium' as const : 'none' as const,
    rainPower: 1, snowPower: 1,
  };
}

const NIGHT_PAINT = new THREE.Color('#5a6a94');
const DUSK_PAINT = new THREE.Color('#ffc4a0');
const WHITE = new THREE.Color(1, 1, 1);

export function createWorldPrecip(stage: Stage<StageRenderer>, level: LevelData, worldViews: WorldViews, background: FreeWorldBackgroundView | null, daylight: Daylight | null): PrecipView {
  return createPrecipView({
    scene: stage.scene,
    ...levelPrecipSource(level, DEFAULT_PRECIP),
    camera: stage.camera,
    sky: { region: background?.environment, base: daylight?.base, scene: stage.scene, keyLight: stage.keyLight, hemiLight: stage.hemiLight, rimLight: stage.rimLight, grade: stage.postFx.grade, clouds: worldViews.weather.fx },
    surfaces: () => precipSurfaceRoots(worldViews),
    windSway: (x) => worldViews.weather.wind.sway(x),
  });
}

export function createEnvironmentViews(stage: Stage<StageRenderer>, level: LevelData, world: SimWorld, worldViews: WorldViews, cameraRig: Pick<CameraRig, 'visibleRect'>, disposers: Array<() => void>, background: FreeWorldBackgroundView | null, daylight: Daylight | null, shafts: LightShafts): EnvironmentViews {
  const precipView = createWorldPrecip(stage, level, worldViews, background, daylight);
  disposers.push(() => precipView.dispose());
  const update = (time: number, dt: number, alpha: number): void => {
    const player = getPlayer(world);
    background?.update(lerp(player.body.prevX, player.body.x, alpha), lerp(player.body.prevY, player.body.y, alpha), dt);
    const view = cameraRig.visibleRect(2);
    worldViews.update(view, time, dt, alpha);
    // 昼夜先写基础灯光，降水层再乘天气与区域；日月星、雾与环境图要用本帧天气，放在降水之后。
    if (daylight) {
      daylight.update();
      // 原野背景、云与光束乘昼夜色；露天系数取自背景，洞穴不随户外昼夜变化。
      if (background) {
        const t = daylight.time;
        background.paint.copy(NIGHT_PAINT).multiplyScalar(.75 + .25 * t.moonLight).lerp(WHITE, t.daylight).lerp(DUSK_PAINT, .6 * t.twilight);
        worldViews.weather.fx.setSkyLight(background.paint);
        shafts.setStrength(t.daylight);
      }
    }
    precipView.update(view, time, dt, world.env.precip, world.env);
    const look = precipView.sky.look!;
    if (background) background.setWeather(.55 + .45 * look.key);
    daylight?.updateSky(look);
  };
  return { precipView, update };
}
