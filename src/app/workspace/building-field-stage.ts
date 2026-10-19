import { t } from '../../config/i18n.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDING_SCENE_TUNING } from '../../config/ai-city-look.ts';
import { resolveQuality } from '../../config/lighting-rules.ts';
import { sampleWorldTime, type WorldTime } from '../../core/calendar.ts';
import type { DefinitionCollider } from '../../physics/definition-collision.ts';
import { createAiCityLighting } from '../../render/city/ai-city-lighting.ts';
import { createResidenceWeather } from '../../render/residence/residence-weather.ts';
import { attachStage, WEBGL_STAGE_BACKEND } from '../../render/stage/stage.ts';
import type { SceneMountContext } from './scene-mount.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';

export type BuildingFieldView = 'front' | 'angle' | 'top';

/** 无玩家展示与编辑共用同一套天空、天气和自由镜头。 */
export function createBuildingFieldStage(context: SceneMountContext, viewport: HTMLElement,
  solids: () => readonly DefinitionCollider[], bounds: { minX: number; width: number }) {
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
  orbit.target.set(bounds.minX + bounds.width / 2, 8, 0);
  context.onDispose(() => orbit.dispose());
  const weather = createResidenceWeather(stage, solids, bounds);
  context.onDispose(() => weather.dispose());
  const lighting = createAiCityLighting(stage);
  lighting.setEnabled(true);
  context.onDispose(() => lighting.dispose());
  let frame = 0;
  let elapsed = 0;
  let previous = performance.now();
  context.onDispose(() => cancelAnimationFrame(frame));
  const setView = (view: BuildingFieldView): void => {
    const [yaw, pitch] = { front: [0, 0], angle: [13, 9], top: [0, 78] }[view] as [number, number];
    const distance = 20
      / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    const a = THREE.MathUtils.degToRad(yaw), b = THREE.MathUtils.degToRad(pitch);
    stage.camera.position.set(orbit.target.x + distance * Math.sin(a) * Math.cos(b),
      orbit.target.y + distance * Math.sin(b), orbit.target.z + distance * Math.cos(a) * Math.cos(b));
    stage.camera.lookAt(orbit.target);
    orbit.update();
  };
  setView('angle');
  return {
    stage, orbit, setView, quality, lighting,
    onFrame(update: (time: number, dt: number, world: WorldTime) => void): void {
      cancelAnimationFrame(frame);
      previous = performance.now();
      const draw = (now: number): void => {
        if (context.signal.aborted) return;
        try {
          const dt = Math.min(VIEW_MAX_DT, Math.max(0, (now - previous) / 1000));
          previous = now; elapsed += dt;
          orbit.update();
          const world = sampleWorldTime(context.world.time);
          weather.setSettings(context.world.weatherConfig);
          weather.setWeather(context.world.weather);
          lighting.setWorldTime(world, weather.update(elapsed, dt, world));
          lighting.update();
          update(elapsed, dt, world);
          stage.render();
          frame = requestAnimationFrame(draw);
        } catch (error) { context.reportError(error); }
      };
      draw(previous);
    },
  };
}
