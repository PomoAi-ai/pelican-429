/**
 * 降水/天气接线（从 main.ts 拆出，任务 019 收尾）：022 降水视图（雨雪粒子/天色/湿润积雪）挂到舞台灯光、
 * 调色与云层上；状态取逻辑层 world.env.precip，与世界视图同帧同节奏更新。
 */
import { lerp } from '../../core/math.ts';
import type { FreeWorldBackgroundView } from '../../render/sky/free-world-background.ts';
import type { FreeWorldDaylight } from '../../render/sky/free-world-daylight.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import type { FacilitySceneId } from '../../config/facility-scenes.ts';
import { createPrecipView, precipSurfaceRoots } from '../../render/sky/precip-view.ts';
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
export function facilityWeather(sceneId: FacilitySceneId) {
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

export function createWorldPrecip(stage: Stage<StageRenderer>, level: LevelData, worldViews: WorldViews, background: FreeWorldBackgroundView | null, daylight: FreeWorldDaylight | null): PrecipView {
  return createPrecipView({
    scene: stage.scene,
    level,
    camera: stage.camera,
    sky: { region: background?.environment, base: daylight?.base, scene: stage.scene, keyLight: stage.keyLight, hemiLight: stage.hemiLight, rimLight: stage.rimLight, grade: stage.postFx.grade, clouds: worldViews.weather.fx },
    surfaces: () => precipSurfaceRoots(worldViews),
    windSway: (x) => worldViews.weather.wind.sway(x),
  });
}

export function createEnvironmentViews(stage: Stage<StageRenderer>, level: LevelData, world: SimWorld, worldViews: WorldViews, cameraRig: Pick<CameraRig, 'visibleRect'>, disposers: Array<() => void>, background: FreeWorldBackgroundView | null, daylight: FreeWorldDaylight | null): EnvironmentViews {
  const precipView = createWorldPrecip(stage, level, worldViews, background, daylight);
  disposers.push(() => precipView.dispose());
  const update = (time: number, dt: number, alpha: number): void => {
    const player = getPlayer(world);
    background?.update(lerp(player.body.prevX, player.body.x, alpha), lerp(player.body.prevY, player.body.y, alpha), dt);
    const view = cameraRig.visibleRect(2);
    worldViews.update(view, time, dt, alpha);
    // 昼夜先写基础灯光，降水层再乘天气与区域；日月星要用本帧云量，放在降水之后。
    daylight?.update();
    precipView.update(view, time, dt, world.env.precip, world.env);
    if (background) background.setWeather(.55 + .45 * precipView.sky.look!.key);
    daylight?.updateSky(precipView.sky.look!.cloudAmount);
  };
  return { precipView, update };
}
