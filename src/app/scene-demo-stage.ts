import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TUNING, type Tuning } from '../config/tuning.ts';
import { sampleWorldTime } from '../core/world-clock.ts';
import type { DefinitionCollision } from '../physics/definition-collision.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createGrassyRig } from '../render/grassy/grassy-rig.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { shadowReceiverBounds } from '../render/shadow-fit.ts';
import { attachStage } from '../render/stage.ts';
import { warmUpStage } from '../render/warm-up.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createPerspectiveControls } from './perspective-controls.ts';
import type { SceneMountContext } from './scene-mount.ts';

export function createSceneDemoStage(context: SceneMountContext, tuning: Tuning = TUNING) {
  const page = document.createElement('section');
  page.className = 'room-preview scene-demo-player';
  page.innerHTML = `<div class="room-preview-toolbar">
    <span class="room-preview-status" data-mode>游玩中 · 跟随镜头</span>
    <button type="button" data-play>暂停游玩</button><button type="button" data-camera>自由镜头</button>
    <button type="button" data-reset-player>回到起点</button>
    <span data-sample-label></span>
    </div><div class="room-preview-viewport" style="position:relative;min-height:0;overflow:hidden">
    <div class="room-preview-hud"></div><p class="room-preview-hint"></p></div>`;
  context.root.append(page);
  context.onDispose(() => page.remove());
  const viewport = page.querySelector<HTMLElement>('.room-preview-viewport')!;
  const stage = attachStage(viewport, context.renderer, tuning, { quality: 'high', antialias: 'smaa' });
  stage.camera.far = 1200;
  stage.camera.updateProjectionMatrix();
  context.onDispose(() => stage.dispose());
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.maxDistance = 300;
  context.onDispose(() => orbit.dispose());
  const frustum = Array.from({ length: 8 }, () => new THREE.Vector3());
  const visibleView = () => {
    stage.camera.updateMatrixWorld();
    for (const [index, corner] of frustum.entries()) {
      corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(stage.camera);
    }
    const { zMin, zMax } = tuning.render.lighting.shadow;
    const visible = shadowReceiverBounds(frustum, zMin, zMax);
    return visible ? { x: visible.centerX - visible.halfWidth - 4, y: visible.centerY - visible.halfHeight - 4,
      w: visible.halfWidth * 2 + 8, h: visible.halfHeight * 2 + 8 } : null;
  };
  return {
    page, stage, orbit, visibleView,
    async play(collision: DefinitionCollision, bounds: THREE.Box3, sections: readonly SceneSection[],
      update: (time: number, dt: number, view: { x: number; y: number; w: number; h: number }) => void,
      precipColumns?: (columns: Float32Array) => void): Promise<void> {
      const rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(window.localStorage).current());
      stage.scene.add(rig.root);
      context.onDispose(() => rig.dispose());
      const weather = createResidenceWeather(stage, () => collision.solids,
        { minX: Math.floor(bounds.min.x), width: Math.ceil(bounds.max.x - bounds.min.x), precipColumns });
      context.onDispose(() => weather.dispose());
      const gameplay = createPerspectiveControls(page, stage, orbit, rig, collision, bounds, sections[0]!, [0, 0], [], false,
        { cameraMode: 'game', tuning, applyForce: weather.applyToBody, airWind: weather.airWind });
      context.onDispose(() => gameplay.dispose());
      gameplay.select(sections[0]!);
      page.querySelector('[data-reset-player]')!.addEventListener('click', () => gameplay.select(sections[0]!), { signal: context.signal });
      const lighting = createAiCityLighting(stage);
      lighting.setEnabled(true);
      context.onDispose(() => lighting.dispose());
      let time = 0;
      let previous = performance.now();
      let frame = 0;
      let sectionIndex = -1;
      context.onDispose(() => cancelAnimationFrame(frame));
      const label = page.querySelector<HTMLElement>('[data-sample-label]')!;
      const render = (dt: number, draw = true): void => {
        time += dt;
        context.world.clock.update(dt);
        weather.setSettings(context.world.weatherConfig);
        gameplay.update(dt);
        orbit.update();
        const view = visibleView();
        if (view) update(time, dt, view);
        const index = sections.findIndex(section => gameplay.body.x >= section.x - section.width / 2 && gameplay.body.x <= section.x + section.width / 2);
        if (index !== sectionIndex) { sectionIndex = index; label.textContent = index < 0 ? '' : sections[index]!.title; }
        const worldTime = sampleWorldTime(context.world.clock.hour);
        weather.setWeather(context.world.weather);
        const atmosphere = weather.update(time, dt, worldTime);
        lighting.setWorldTime(worldTime, atmosphere);
        lighting.update();
        if (draw) stage.render();
      };
      render(0, false);
      context.progress('准备着色器与首帧');
      await warmUpStage(stage, [], context.signal);
      context.signal.throwIfAborted();
      render(0);
      const draw = (now: number): void => {
        if (context.signal.aborted) return;
        try {
          render(Math.max(0, Math.min((now - previous) / 1000, .05)));
          previous = now;
          frame = requestAnimationFrame(draw);
        } catch (error) { context.reportError(error); }
      };
      frame = requestAnimationFrame(draw);
    },
  };
}
