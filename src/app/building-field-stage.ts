import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDING_SCENE_TUNING } from '../config/ai-city-look.ts';
import { sampleWorldTime, type WorldTime } from '../core/world-clock.ts';
import type { DefinitionCollider } from '../physics/definition-collision.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { attachStage } from '../render/stage.ts';
import type { SceneMountContext } from './scene-mount.ts';

export type BuildingFieldView = 'front' | 'angle' | 'top';

/** 无玩家展示与编辑共用同一套天空、天气和自由镜头。 */
export function createBuildingFieldStage(context: SceneMountContext, viewport: HTMLElement,
  solids: () => readonly DefinitionCollider[], bounds: { minX: number; width: number }) {
  const stage = attachStage(viewport, context.renderer, BUILDING_SCENE_TUNING, { quality: 'high', antialias: 'smaa' });
  context.onDispose(() => stage.dispose());
  stage.canvas.setAttribute('aria-label', '建筑自由场地');
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
    stage, orbit, setView,
    onFrame(update: (time: number, dt: number, world: WorldTime) => void): void {
      cancelAnimationFrame(frame);
      previous = performance.now();
      const draw = (now: number): void => {
        if (context.signal.aborted) return;
        try {
          const dt = Math.min(.05, Math.max(0, (now - previous) / 1000));
          previous = now; elapsed += dt;
          context.world.clock.update(dt);
          orbit.update();
          const world = sampleWorldTime(context.world.clock.hour);
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
