import * as THREE from 'three';
import { BUILDING_SCENE_TUNING, AI_CITY_HARBOR_LOOK } from '../../config/ai-city-look.ts';
import { TRANSIT, TRANSIT_DESTINATIONS, type TransitDestinationId } from '../../config/transit.ts';
import { createSceneWeatherSettings } from '../../config/scene-weather.ts';
import { TUNING } from '../../config/tuning.ts';
import { sampleWorldTime } from '../../core/calendar.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import { attachStage, createStageRenderer, WEBGL_STAGE_BACKEND } from '../../render/stage/stage.ts';
import { createAiCityLighting } from '../../render/city/ai-city-lighting.ts';
import { createHarborSideScene } from '../../render/city/harbor-side-scene.ts';
import { createGrassyRig, loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { createGrassyPlayerAnimator } from '../../render/grassy/grassy-player-animator.ts';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import { bindTransitInput, createTransitInterface } from './transit-controls.ts';
import { createCharacterAppearanceStore } from '../character/character-appearance.ts';
import { createPerspectivePlayer } from '../perspective/perspective-player.ts';
import { createTransitStation } from './transit-station.ts';
import type { TransitOwner } from './transit-handoff.ts';
import { waitSceneResource, type SceneMountContext } from '../workspace/scene-mount.ts';
import { readPageParams, type PageContext } from '../shell/page-context.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';
import { t } from '../../config/i18n.ts';

/** 网址参数 flight=<目的地> 跳过登舱直接发射，供飞行测试场反复进入。 */
function parseFlight(search: string): TransitDestinationId | null {
  const id = new URLSearchParams(search).get('flight');
  if (id === null) return null;
  const destination = TRANSIT_DESTINATIONS.find(item => item.id === id);
  if (!destination) throw new Error(`网址参数 flight 不是交通中心目的地：${id}`);
  return destination.id;
}

/** Standalone page: the canal backdrop and its own street walker around a station at the world origin. */
export async function mountTransit(context: SceneMountContext, owner: TransitOwner): Promise<void> {
  const { signal, root } = context;
  const flight = parseFlight(location.search);
  const ui = createTransitInterface(root, false);
  context.onDispose(() => ui.section.remove());
  context.attachToolbar(ui.section.querySelector<HTMLElement>('.transit-toolbar')!);
  const stage = attachStage(ui.viewport, context.renderer, BUILDING_SCENE_TUNING, { quality: 'high', antialias: 'smaa' }, WEBGL_STAGE_BACKEND);
  context.onDispose(() => stage.dispose()); stage.camera.far = 600;
  const lighting = createAiCityLighting(stage, AI_CITY_HARBOR_LOOK);
  lighting.setEnabled(true); context.onDispose(() => lighting.dispose());
  context.progress(t('载入正式角色与城市远景'));
  await waitSceneResource(loadGrassyAsset('game'), signal); signal.throwIfAborted();
  const rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(localStorage).current());
  stage.scene.add(rig.root); rig.effects.setProjectilePreview(false);
  context.onDispose(() => { rig.root.removeFromParent(); rig.dispose(); });
  const background = await createHarborSideScene({ minX: -100, maxX: 160, homeCenter: 20 });
  if (signal.aborted) { background.dispose(); signal.throwIfAborted(); }
  stage.scene.add(background.root); context.onDispose(() => background.dispose());
  const inputEvents = new AbortController();
  const input = bindTransitInput(root, stage.canvas, AbortSignal.any([signal, inputEvents.signal]), () => station.interact(), () => station.cancel());
  const stepper = createFixedStepper(TUNING.sim);
  const station = createTransitStation({ stage, lighting, ui, rig, origin: { x: 0, y: 0 }, hosted: false, signal, owner,
    body: () => player.entity.body,
    teleport(x, y) { player.teleport(x, y); stepper.reset(); animator.reset(player.entity); },
    playing: () => true, clearInput: input.clear, stopInput() { inputEvents.abort(); input.clear(); },
    reportError: context.reportError });
  context.onDispose(() => station.dispose());
  const player = createPerspectivePlayer(station.collision, { x: TRANSIT.spawnX, y: 0 }, { width: 50, height: 80 }, [], false);
  const animator = createGrassyPlayerAnimator(rig, player.entity, { tuning: TUNING, windAt: () => 0 });
  let elapsed = 0, previous: number | null = null, worldSignature = '';
  const render = (dt: number): void => {
    elapsed += dt;
    if (!station.active) {
      const entity = player.entity;
      stepper.advance(dt, () => {
        if (station.active) return;
        player.step(station.steer(input.read(), entity.body));
        entity.body.x = THREE.MathUtils.clamp(entity.body.x, TRANSIT.walkwayMinX, TRANSIT.walkwayMaxX);
      });
      rig.root.position.set(entity.body.x, entity.body.y, station.walkZ(entity.body.x, entity.body.y));
      rig.root.rotation.y = entity.facing * Math.PI / 2;
      animator.update(entity, 1, dt);
    }
    station.update(dt);
    if (!station.travelling) {
      const signature = `${context.world.time.day}:${context.world.time.second}`;
      if (signature !== worldSignature) {
        const time = sampleWorldTime(context.world.time);
        lighting.setWorldTime(time, null); background.setNightFactor(time.night); worldSignature = signature;
      }
      background.setCamera(stage.camera); lighting.update(); background.update(elapsed);
    }
    stage.render();
  };
  if (flight !== null) station.launch(flight);
  context.progress(t('预热金属反射、燃烧喷流与驾驶舱'));
  render(0); await warmUpStage(stage, [], signal); signal.throwIfAborted();
  const frame = (now: number) => {
    const dt = previous === null || document.hidden ? 0 : Math.min((now - previous) / 1000, VIEW_MAX_DT);
    previous = now;
    try { render(dt); }
    catch (error) {
      stage.renderer.setAnimationLoop(null);
      if (station.handoff.active) station.handoff.error(error);
      else context.reportError(error);
    }
  };
  context.onDispose(() => { stage.renderer.setAnimationLoop(null); input.clear(); });
  stage.renderer.setAnimationLoop(frame); stage.canvas.focus({ preventScroll: true });
}

/** 整页交通中心：独占渲染器，观察时间固定；dispose 释放整页，星舰穿越交接完成后由交接调用。 */
export async function mountTransitPage(context: PageContext, dispose: () => void): Promise<void> {
  const renderer = createStageRenderer(BUILDING_SCENE_TUNING, readPageParams().debug);
  context.onDispose(() => renderer.dispose());
  document.title = t('星舰交通中心 · 鹈鹕 429');
  await mountTransit({ ...context, renderer, world: { time: { day: 13, second: 36000 }, weather: 'clear', weatherConfig: createSceneWeatherSettings() },
    // 整页没有工作区的公共工具条，交通中心工具条保持原样。
    attachToolbar() {} },
    { leave: () => context.root.replaceChildren(), dispose, reportError: context.reportError });
  document.getElementById('loading')!.hidden = true;
}
