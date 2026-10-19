import { createUtilityDroneFleet } from '../../render/character/utility-drone.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TUNING, type Tuning } from '../../config/tuning.ts';
import { sampleWorldTime } from '../../core/calendar.ts';
import type { DefinitionCollision } from '../../physics/definition-collision.ts';
import { createAiCityLighting } from '../../render/city/ai-city-lighting.ts';
import { createGrassyRig } from '../../render/grassy/grassy-rig.ts';
import { createResidenceWeather } from '../../render/residence/residence-weather.ts';
import { shadowReceiverBounds } from '../../render/stage/shadow-fit.ts';
import { attachStage, WEBGL_STAGE_BACKEND } from '../../render/stage/stage.ts';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import { createCharacterAppearanceStore } from '../character/character-appearance.ts';
import type { SceneSection } from '../perspective/definition-scene-layout.ts';
import { createPerspectiveControls, tiltCamera } from '../perspective/perspective-controls.ts';
import type { SceneMountContext } from './scene-mount.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';
import { t } from '../../config/i18n.ts';
import { createPlayableDefinitionMinimap } from '../perspective/perspective-minimap.ts';
import { createSceneGameOverlays } from './scene-game-overlays.ts';
import { SCENE_VIEW_ANGLES, createSceneViewControls } from '../../ui/panels/scene-view-controls.tsx';

export function createSceneDemoStage(context: SceneMountContext, tuning: Tuning = TUNING) {
  const page = document.createElement('section');
  page.className = 'room-preview scene-demo-player';
  page.innerHTML = `<div class="room-preview-toolbar">
    <span class="room-preview-status" data-mode>${t('游玩中')} · ${t('跟随镜头')}</span>
    <span data-scene-view-controls></span>
    <button type="button" data-reset-player>${t('回到起点')}</button>
    <span data-sample-label></span>
    </div><div class="room-preview-viewport" style="position:relative;min-height:0;overflow:hidden">
    <div class="room-preview-hud"></div><p class="room-preview-hint"></p></div>`;
  context.root.append(page);
  context.onDispose(() => page.remove());
  context.attachToolbar(page.querySelector<HTMLElement>('.room-preview-toolbar')!);
  const view = createSceneViewControls(page.querySelector<HTMLElement>('[data-scene-view-controls]')!);
  context.onDispose(view.dispose);
  const viewport = page.querySelector<HTMLElement>('.room-preview-viewport')!;
  const stage = attachStage(viewport, context.renderer, tuning, { quality: 'high', antialias: 'smaa' }, WEBGL_STAGE_BACKEND);
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
    page, stage, orbit, view, visibleView,
    async play(collision: DefinitionCollision, bounds: THREE.Box3, sections: readonly SceneSection[],
      update: (time: number, dt: number, view: { x: number; y: number; w: number; h: number }) => void,
      precipColumns?: (columns: Float32Array) => void): Promise<void> {
      const rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(window.localStorage).current());
      stage.scene.add(rig.root);
      context.onDispose(() => rig.dispose());
      const weather = createResidenceWeather(stage, () => collision.solids,
        { minX: Math.floor(bounds.min.x), width: Math.ceil(bounds.max.x - bounds.min.x), precipColumns });
      context.onDispose(() => weather.dispose());
      const droneFleet = createUtilityDroneFleet(stage.scene, stage.createPmrem());
      if (context.signal.aborted) { droneFleet.dispose(); context.signal.throwIfAborted(); }
      const gameplay = createPerspectiveControls(page, stage, droneFleet, orbit, rig, collision, bounds, sections[0]!, [0, 0], [], false,
        { cameraMode: 'game', tuning, onMode: (playing, following) => view.set({ playing, following }), applyForce: weather.applyToBody, airWind: weather.airWind, world: context.world });
      context.onDispose(() => gameplay.dispose());
      gameplay.select(sections[0]!);
      const minimap = createPlayableDefinitionMinimap(viewport, collision,
        { minX: bounds.min.x, minY: bounds.min.y, maxX: bounds.max.x, maxY: bounds.max.y });
      context.onDispose(() => minimap.dispose());
      gameplay.hud.attachMap(minimap.root);
      const overlays = createSceneGameOverlays(page.querySelector<HTMLElement>('.room-preview-toolbar')!, viewport, stage, minimap);
      context.onDispose(() => overlays.dispose());
      page.querySelector('[data-reset-player]')!.addEventListener('click', () => gameplay.select(sections[0]!), { signal: context.signal });
      view.on(action => {
        if (action === 'play') gameplay.setPlaying(!gameplay.playing);
        else if (action === 'camera') { gameplay.setFollowing(!gameplay.following); view.set({ preset: null }); }
        else if (action === 'playView') { gameplay.setFollowing(true); view.set({ preset: null }); }
        else {
          const angles = SCENE_VIEW_ANGLES[action];
          // 跟随时换预设倾角；自由镜头绕当前注视点转过去，保持自由镜头。
          if (gameplay.following) gameplay.setViewAngles(angles);
          else { tiltCamera(stage.camera, orbit.target, stage.camera.position.distanceTo(orbit.target), angles); orbit.update(); }
          view.set({ preset: action });
        }
      }, context.signal);
      orbit.addEventListener('start', () => view.set({ preset: null }));
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
        if (draw) overlays.begin();
        time += dt;
        weather.setSettings(context.world.weatherConfig);
        gameplay.update(dt);
        orbit.update();
        const view = visibleView();
        if (view) update(time, dt, view);
        const index = sections.findIndex(section => gameplay.body.x >= section.x - section.width / 2 && gameplay.body.x <= section.x + section.width / 2);
        if (index !== sectionIndex) { sectionIndex = index; label.textContent = index < 0 ? '' : sections[index]!.title; }
        const worldTime = sampleWorldTime(context.world.time);
        weather.setWeather(context.world.weather);
        const atmosphere = weather.update(time, dt, worldTime);
        lighting.setWorldTime(worldTime, atmosphere);
        lighting.update();
        if (draw) { minimap.update(gameplay.body.x, gameplay.body.y); overlays.render(); }
      };
      render(0, false);
      context.progress(t('准备着色器与首帧'));
      await warmUpStage(stage, [], context.signal);
      context.signal.throwIfAborted();
      render(0);
      const draw = (now: number): void => {
        if (context.signal.aborted) return;
        try {
          render(Math.max(0, Math.min((now - previous) / 1000, VIEW_MAX_DT)));
          previous = now;
          frame = requestAnimationFrame(draw);
        } catch (error) { context.reportError(error); }
      };
      frame = requestAnimationFrame(draw);
    },
  };
}
