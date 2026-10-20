import { t } from '../../config/i18n.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDING_SCENE_TUNING } from '../../config/ai-city-look.ts';
import { resolveQuality } from '../../config/lighting-rules.ts';
import { TUNING } from '../../config/tuning.ts';
import type { WorldTime } from '../../core/calendar.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import { attachStage, WEBGL_STAGE_BACKEND } from '../../render/stage/stage.ts';
import { NEUTRAL_INPUT, stepSim, type SimWorld } from '../../sim/sim-world.ts';
import type { SceneMountContext } from './scene-mount.ts';
import { createWorkspaceWeather } from './workspace-weather.ts';
import { createViewLoop } from '../shell/view-loop.ts';
import { SCENE_VIEW_ANGLES, type SceneViewAngle } from '../../ui/panels/scene-view-controls.tsx';

/**
 * 无玩家展示与编辑共用同一套天空、天气和自由镜头。场地是一个格子模拟世界：天气（风、龙卷、雨雪）
 * 只来自它的环境，玩家实体留在场地里不显示。
 */
export function createBuildingFieldStage(context: SceneMountContext, viewport: HTMLElement, world: SimWorld) {
  const quality = resolveQuality(new URLSearchParams(location.search).get('quality'), BUILDING_SCENE_TUNING.render.lighting.quality);
  if (quality === 'low') {
    // 渲染器由工作台各页面共用，离开时还原像素比；须在挂舞台前设置，后期缓冲按此尺寸分配。
    const pixelRatio = context.renderer.getPixelRatio();
    context.renderer.setPixelRatio(1);
    context.onDispose(() => context.renderer.setPixelRatio(pixelRatio));
  }
  const stage = attachStage(viewport, context.renderer, BUILDING_SCENE_TUNING, { quality, antialias: 'smaa' }, WEBGL_STAGE_BACKEND);
  context.onDispose(() => stage.dispose());
  stage.canvas.setAttribute('aria-label', t('建筑自由场地'));
  stage.camera.far = 1800;
  stage.camera.updateProjectionMatrix();
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.minDistance = 5;
  orbit.maxDistance = 450;
  orbit.mouseButtons.LEFT = null;
  orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  orbit.target.set(world.map.width / 2, 8, 0);
  context.onDispose(() => orbit.dispose());
  const weather = createWorkspaceWeather(stage, context.world.time, world);
  context.onDispose(() => weather.dispose());
  const stepper = createFixedStepper(TUNING.sim);
  let elapsed = 0;
  const setView = (view: SceneViewAngle): void => {
    const [yaw, pitch] = SCENE_VIEW_ANGLES[view];
    const distance = 20
      / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    const a = THREE.MathUtils.degToRad(yaw), b = THREE.MathUtils.degToRad(pitch);
    stage.camera.position.set(orbit.target.x + distance * Math.sin(a) * Math.cos(b),
      orbit.target.y + distance * Math.sin(b), orbit.target.z + distance * Math.cos(a) * Math.cos(b));
    stage.camera.lookAt(orbit.target);
    orbit.update();
  };
  setView('angle');
  let update: (time: number, dt: number, world: WorldTime) => void = () => {};
  const loop = createViewLoop(dt => {
    elapsed += dt;
    orbit.update();
    weather.setSettings(context.world.weatherConfig);
    weather.setWeather(context.world.weather);
    weather.apply();
    stepper.advance(dt, () => stepSim(world, NEUTRAL_INPUT));
    weather.update(elapsed, dt);
    update(elapsed, dt, weather.daylight.time);
    stage.render();
  }, context.reportError);
  context.onDispose(loop.stop);
  return {
    stage, orbit, setView, quality, daylight: weather.daylight,
    onFrame(next: (time: number, dt: number, world: WorldTime) => void): void {
      update = next;
      loop.start();
    },
  };
}
