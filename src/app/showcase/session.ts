import * as THREE from 'three';
import { TUNING } from '../../config/tuning.ts';
import { DEFAULT_CHARACTER_APPEARANCE } from '../../config/character-appearance.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import { createResourceScenario } from './resource-scenario.ts';
import { createResourcePreview } from '../../render/resource/resource-preview.ts';
import { resolveWaterPalette, DEFAULT_WATER_PALETTE } from '../../config/water-palettes.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import { createStageView } from '../../render/stage/stage.ts';
import { createPelicanRig } from '../../render/pelican/pelican-rig.ts';
import { levelGroundColumns } from '../../render/decor/surface-decor-view.ts';
import { createWorldViews } from '../../render/stage/world-views.ts';
import { sharedPrecipUniforms } from '../../render/sky/precip-surface.ts';
import { createEntityViews } from '../game/game-wiring.ts';
import { createWorldLighting } from '../game/lighting-wiring.ts';
import { createShowcaseScenario } from './catalog.ts';
import { createShowcaseRunner } from './runner.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import { createHumanShowcaseSession } from './human-session.ts';
import { createLumaShowcaseSession } from './luma-session.ts';
import { createNpcShowcaseSession } from './npc-session.ts';
import { createLumaCompanion } from '../../render/luma/luma-companion.ts';
import { DUMMY_HEALTH_LAYER } from '../../render/character/entity-views.ts';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import { t } from '../../config/i18n.ts';
import { undergroundInspectionLight } from '../../render/stage/light-presets.ts';

function createSceneContent(stage: ReturnType<typeof createStageView>, rig: ReturnType<typeof createPelicanRig>, card: ShowcaseCard, caveBackground: THREE.Texture) {
  const disposers: Array<() => void> = [];
  const background = stage.scene.background;
  disposers.push(() => { stage.scene.background = background; });
  // 世界场景的明暗由游戏光照图负责，地下检视只换背景色，主光与半球光保持游戏值。
  if (card.resource && card.environment === 'underground') stage.scene.background = undergroundInspectionLight(TUNING).background;
  try {
    const scenario = card.resource ? createResourceScenario(card) : createShowcaseScenario(card.entryId, card.environment, card.facing, card.attackMotion);
    const palette = scenario.entry.actor === 'water' ? resolveWaterPalette(scenario.entry.action) : DEFAULT_WATER_PALETTE;
    disposers.push(() => scenario.dispose());
    const { world } = scenario;
    const level = world.level;
    const worldViews = createWorldViews({
      caveBackground,
      scene: stage.scene, level, fish: world.fish, ground: scenario.groundColumns ?? levelGroundColumns(level), windMode: card.resource?.wind ?? 'calm',
      pelican: () => getPlayer(world).body, actors: () => world.entities, waterPalette: palette,
    });
    worldViews.weather.setEnabled(false);
    disposers.push(() => worldViews.dispose());
    const clip = scenario.entry.grassyAnimation?.clip;
    const gait = !card.manual && (clip === 'run' || clip === 'sprint') ? clip : undefined;
    const entityViews = createEntityViews(stage, level, disposers, () => world.entities, worldViews.treeRide, worldViews.weather.wind, rig, scenario.entry.grassyAnimation?.variant, gait, () => DEFAULT_CHARACTER_APPEARANCE);
    const luma = !card.resource && (scenario.entry.actor === 'pelican' || scenario.entry.actor === 'human' || scenario.entry.actor === 'luma')
      ? createLumaCompanion(stage.scene, getPlayer(world)) : null;
    if (luma) disposers.push(() => luma.dispose());
    const lighting = createWorldLighting(level, world, palette, stage.quality, disposers);
    const resource = card.resource ? createResourcePreview(stage.scene, level, scenario.groundY, card, worldViews,
      { ...scenario.focus(), width: scenario.width, height: scenario.height }) : null;
    if (resource) disposers.push(() => resource.dispose());
    const runner = createShowcaseRunner(scenario);
    let frameIndex = 0;
    let width = 0;
    let height = 0;
    const screen = new THREE.Vector3();
    const dispose = (): void => { for (const d of disposers.splice(0).reverse()) d(); };
    return {
      scenario, runner, dispose,
      updateFrame(rect: DOMRect, dt: number, worldScale: boolean): void {
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (w !== width || h !== height) { width = w; height = h; stage.setSize(w, h); }
        const focus = resource?.framing ?? scenario.focus();
        const frameHeight = resource?.framing?.height ?? scenario.height;
        const frameWidth = resource?.framing?.width ?? scenario.width;
        const fittedHeight = Math.max(frameHeight, frameWidth / stage.camera.aspect);
        const viewHeight = (worldScale ? (card.resource ? 20 : Math.max(6, fittedHeight)) : fittedHeight) / card.zoom;
        const distance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
        const centerY = focus.y + (card.resource ? 0 : viewHeight * 0.07);
        const yaw = card.resource ? THREE.MathUtils.degToRad(card.resource.yaw) : 0;
        const pitch = card.resource ? THREE.MathUtils.degToRad(card.resource.pitch) : 0;
        stage.camera.position.set(
          focus.x + distance * Math.sin(yaw) * Math.cos(pitch),
          centerY + distance * Math.sin(pitch),
          distance * Math.cos(yaw) * Math.cos(pitch),
        );
        stage.camera.lookAt(focus.x, centerY, 0);
        stage.camera.updateMatrixWorld();
        const halfWidth = viewHeight * stage.camera.aspect / 2;
        // 游戏的流式剔除按正面 XY 矩形计算；旋转时加载展示夹具全图，避免漏掉侧面与俯视中的资源。
        const view = yaw !== 0 || pitch !== 0
          ? { x: 0, y: 0, w: level.map.width, h: level.map.height }
          : { x: focus.x - halfWidth - 2, y: focus.y - viewHeight / 2 - 2, w: halfWidth * 2 + 4, h: viewHeight + 4 };
        const events = world.events.drain();
        worldViews.handleEvents(events);
        entityViews.orbFx.handleEvents(events);
        entityViews.projectileFx.handleEvents(events);
        luma?.handleEvents(events);
        // 每张卡片更新共享的风/草扰动 uniform 后立即绘制，不能先更新所有卡片再一起画。
        const precip = sharedPrecipUniforms();
        precip.uPrWet.value = 0; precip.uPrSnow.value = 0; precip.uPrRipple.value = 0;
        worldViews.update(view, runner.time, dt, runner.alpha);
        const animDt = world.hitstopTicks > 0 ? 0 : dt;
        entityViews.views.sync(card.resource && !card.resource.reference ? [] : world.entities, runner.alpha, animDt);
        for (const entity of world.entities) {
          if (!entity.enemy || entity.removed) continue;
          const object = entityViews.views.get(entity.id)!.object;
          object.rotation.set(card.modelPitch, card.modelYaw - Math.PI / 2, 0);
        }
        luma?.update(getPlayer(world), runner.alpha, animDt, world.photon.chargeTicks > 0 || world.photon.activeTicks > 0);
        resource?.update(runner.time);
        entityViews.orbs.update(world.entities, runner.alpha);
        entityViews.projectileFx.update(world.entities, runner.alpha, animDt);
        entityViews.orbFx.update(animDt);
        if (!card.resource || card.resource.reference) lighting.updateAura(getPlayer(world), runner.alpha, animDt);
        if (card.resource?.inspectionLight && card.environment === 'underground') {
          lighting.worldLight.setAura(focus.x, focus.y, Math.max(scenario.height, scenario.width) * 1.5, 0.75, [0.8, 0.88, 1]);
        }
        lighting.worldLight.update(stage.scene, frameIndex++, view);
        stage.renderer.setScissorTest(false);
      },
      aim(clientX: number, clientY: number, rect: DOMRect) {
        screen.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2, 0.5).unproject(stage.camera);
        const camera = stage.camera.position;
        const k = -camera.z / (screen.z - camera.z);
        return { x: camera.x + (screen.x - camera.x) * k, y: camera.y + (screen.y - camera.y) * k };
      },
    };
  } catch (error) {
    for (const d of disposers.reverse()) d();
    throw error;
  }
}

export function createShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard, caveBackground: THREE.Texture) {
  if (!card.resource) {
    const entry = showcaseEntry(card.entryId);
    const actor = entry.actor;
    if (actor === 'human' && (!entry.grassyAnimation || card.humanView === 'model')) return createHumanShowcaseSession(renderer, card);
    if (actor === 'luma') return createLumaShowcaseSession(renderer, card);
    if (actor === 'sam' || actor === 'tibo') return createNpcShowcaseSession(renderer, card, caveBackground);
  }
  return createWorldShowcaseSession(renderer, card, caveBackground);
}

export function createWorldShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard, caveBackground: THREE.Texture) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  stage.camera.layers.enable(DUMMY_HEALTH_LAYER);
  let rig: ReturnType<typeof createPelicanRig>;
  try { rig = createPelicanRig({ scale: TUNING.render.pelicanScale }); }
  catch (error) { stage.dispose(); throw error; }
  let content: ReturnType<typeof createSceneContent>;
  try { content = createSceneContent(stage, rig, card, caveBackground); }
  catch (error) { rig.dispose(); stage.dispose(); throw error; }
  let revision = card.revision;
  let disposed = false;
  return {
    get complete() { return content.runner.complete; },
    get ticks() { return content.scenario.elapsedTicks; },
    get duration() { return content.scenario.durationTicks * TUNING.sim.step; },
    get progress() { return Math.min(1, content.scenario.elapsedTicks / content.scenario.durationTicks); },
    get status() { return content.scenario.status() + (content.runner.complete && !card.manual ? ` · ${t('演示完成')}` : ''); },
    reset() {
      content.dispose();
      content = createSceneContent(stage, rig, card, caveBackground);
      revision = card.revision;
    },
    advance(elapsed: number, playing: boolean, manual: (() => InputFrame) | null): number {
      return content.runner.advance(elapsed, card.speed, playing, manual);
    },
    get needsReset() { return revision !== card.revision; },
    async prepare(rect: DOMRect, signal: AbortSignal): Promise<void> {
      content.updateFrame(rect, 0, false);
      await warmUpStage(stage, [], signal);
    },
    render(rect: DOMRect, dt: number, worldScale: boolean) {
      content.updateFrame(rect, dt, worldScale);
      return stage.renderTexture();
    },
    aim(clientX: number, clientY: number, rect: DOMRect) { return content.aim(clientX, clientY, rect); },
    dispose() {
      if (disposed) return;
      disposed = true;
      content.dispose();
      rig.dispose();
      stage.dispose();
    },
  };
}

export type ShowcaseSession = ReturnType<typeof createShowcaseSession> & {
  setSoundEnabled?: (enabled: boolean) => Promise<void>;
};
