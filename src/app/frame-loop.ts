/**
 * 帧循环本体（从 main.ts 拆出，任务 019 收尾）：界面按键（设置/大地图/帮助）→ 固定步长模拟（设置面板打开时暂停）
 * → 事件分发 → 实体/世界/降水视图 → 光照（微光）→ 渲染 → HUD/小地图/面板 → 性能面板计时。
 * rAF 调度、停止与错误层由 main 负责（frame 抛错即交给 main 的 showError）。
 */
import { PLAY_ACTIONS } from '../config/keybindings.ts';
import { TUNING } from '../config/tuning.ts';
import type { FixedStepper } from '../core/fixed-step.ts';
import type { FrameProfiler } from '../core/frame-profiler.ts';
import { lerp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import type { ActionTracker } from '../input/action-map.ts';
import type { KeyboardMouseBinding } from '../input/keyboard-mouse.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import type { CameraRig } from '../render/camera-rig.ts';
import type { LightShafts } from '../render/light-shafts.ts';
import type { LumaCompanion } from '../render/luma/luma-companion.ts';
import type { Stage } from '../render/stage.ts';
import type { WorldViews } from '../render/world-views.ts';
import { getPlayer, stepSim } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import type { ControlSurface } from '../ui/control-surface.ts';
import type { Hud } from '../ui/hud.ts';
import type { Minimap } from '../ui/minimap.ts';
import type { PerfPanel } from '../ui/perf-panel.ts';
import type { SettingsController } from '../ui/settings-model.ts';
import type { SettingsPanel } from '../ui/settings-panel.ts';
import type { WeaponHud } from '../ui/weapon-hud.ts';
import { mainlineTransformUnlocked } from '../sim/mainline.ts';
import type { LevelData } from '../world/level.ts';
import { pourAtWorld } from './debug-tools.ts';
import type { PourState } from './debug-tools.ts';
import type { WorldLighting } from './lighting-wiring.ts';
import type { EnvironmentViews } from './precip-wiring.ts';
import type { EntityViewSet } from './scene-wiring.ts';
import type { FacilityChapterHud } from '../ui/facility-chapter-hud.ts';
import type { GameAudio } from './game-audio.ts';

export interface FrameLoopDeps {
  readonly world: SimWorld;
  readonly level: LevelData;
  readonly stage: Stage;
  readonly cameraRig: CameraRig;
  readonly tracker: ActionTracker;
  readonly controls: ControlSurface;
  readonly input: KeyboardMouseBinding;
  readonly stepper: FixedStepper;
  readonly pour: PourState;
  readonly entityViews: EntityViewSet;
  readonly luma: LumaCompanion;
  readonly worldViews: WorldViews;
  readonly env: EnvironmentViews;
  readonly shafts: LightShafts;
  readonly lighting: WorldLighting;
  readonly hud: Hud;
  readonly weaponHud: WeaponHud;
  readonly minimap: Minimap;
  readonly settings: SettingsController;
  readonly settingsPanel: SettingsPanel;
  readonly perfPanel: PerfPanel;
  readonly prof: FrameProfiler;
  readonly facility: { update(time: number): void } | null;
  readonly chapterHud: FacilityChapterHud | null;
  readonly audio: GameAudio | null;
}

export interface FrameLoop {
  /** 一帧（不含 rAF 调度）；now = rAF 时间戳（ms）。 */
  frame(now: number): void;
  /** 重置帧时钟（首帧前调用，避免把初始化耗时算进第一帧）。 */
  resetClock(now: number): void;
}

export function createFrameLoop(d: FrameLoopDeps): FrameLoop {
  const { world, level, stage, cameraRig, tracker, input, stepper, pour, hud, weaponHud, minimap, settings, perfPanel, prof } = d;
  const { views, orbs, orbFx, projectileFx } = d.entityViews;
  const aim: Vec2 = { x: 0, y: 0 };
  const pourAt: Vec2 = { x: 0, y: 0 };
  let fps = 60;
  let last = performance.now();
  let waterTime = 0;
  let frameIndex = 0;
  const info = stage.renderer.info;
  // 一帧有多次 renderer.render（阴影/场景/后期）：改为每帧手动清零，统计整帧。
  info.autoReset = false;
  const perfSnapshot = () => prof.snapshot();
  // Esc 先关大地图（小地图自己监听 Escape）：上一帧大地图开着时，本帧的 settings 按键只用于关地图。
  let bigMapWasOpen = false;

  const tick = (): void => {
    const p = input.pointer;
    let target: Vec2 | null = null;
    if (d.controls.mode === 'desktop' && p.inside) target = cameraRig.screenToWorld(p.clientX, p.clientY, aim);
    else if (d.controls.mode === 'mobile' && d.controls.aim !== null) {
      const player = getPlayer(world);
      aim.x = player.body.x + d.controls.aim.x * 20;
      aim.y = player.body.y + player.body.height / 2 + d.controls.aim.y * 20;
      target = aim;
    }
    if (pour.active && p.inside) pourAtWorld(world, level, cameraRig.screenToWorld(p.clientX, p.clientY, pourAt));
    const controls = tracker.consume(target);
    stepSim(world, controls);
    d.audio?.observe(world);
  };

  /** 界面按键：设置（Esc/O，大地图开着时只关地图）、大地图（M，面板打开时忽略）、帮助（H）。 */
  const handleUi = (): void => {
    const ui = tracker.consumeUi();
    if (ui.settingsPressed) {
      if (bigMapWasOpen || minimap.bigMapOpen) minimap.toggleBigMap(false);
      else settings.toggle();
    }
    if (ui.mapPressed && !settings.open) minimap.toggleBigMap();
    if (ui.helpPressed) hud.toggleHints();
    bigMapWasOpen = minimap.bigMapOpen;
  };

  /** 事件分发 + 视图/相机/光照更新（暂停时实体动画与模拟风场冻结，水等视觉效果继续）。 */
  const updateViews = (alpha: number, frameDt: number, paused: boolean, profiling: boolean): Entity => {
    const events = world.events.drain();
    for (const event of events) {
      if (event.type === 'teleported' && event.id === world.playerId) cameraRig.snapTo(event.x, event.y, getPlayer(world).facing);
    }
    d.audio?.handleEvents(events, world);
    hud.handleEvents(events);
    weaponHud.handleEvents(events);
    d.luma.handleEvents(events);
    orbFx.handleEvents(events);
    projectileFx.handleEvents(events);
    d.worldViews.handleEvents(events);
    // hitstop 期间冻结动画（逻辑也冻结）；暂停时冻结实体动画。
    const worldDt = world.hitstopTicks > 0 ? 0 : frameDt;
    const animDt = paused ? 0 : worldDt;
    orbs.update(world.entities, alpha);
    projectileFx.update(world.entities, alpha, animDt);
    if (profiling) prof.mark('views');

    const pl = getPlayer(world);
    d.luma.update(pl, alpha, animDt, world.photon.chargeTicks > 0 || world.photon.activeTicks > 0);
    cameraRig.update(lerp(pl.body.prevX, pl.body.x, alpha), lerp(pl.body.prevY, pl.body.y, alpha), pl.facing, paused ? 0 : frameDt);
    waterTime += frameDt;
    d.env.update(waterTime, worldDt, alpha);
    d.facility?.update(waterTime);
    // 实体视图在世界视图之后同步：树平台随动取本帧写入 GPU 的风 uniform（与树的顶点位移同一帧）。
    views.sync(world.entities, alpha, animDt);
    d.shafts.update(cameraRig.visibleRect(2), waterTime);
    orbFx.update(paused ? 0 : frameDt);
    d.lighting.updateAura(pl, alpha, frameDt);
    if (profiling) prof.mark('world');
    d.lighting.worldLight.update(stage.scene, ++frameIndex);
    if (profiling) prof.mark('light');
    return pl;
  };

  /** HUD / 武器面板 / 小地图 / 设置面板。 */
  const updateUi = (pl: Entity, alpha: number, frameDt: number): void => {
    const noseY = pl.body.y + pl.body.height * .9;
    hud.update({
      entities: world.entities,
      headSubmerged: waterSpanInColumn(world.fluid, Math.floor(pl.body.x), noseY, noseY + .05) > 0,
      alpha,
      frameDt,
      stats: { fps, tick: world.tick, droppedTicks: stepper.stats.droppedTicks },
      playerId: world.playerId,
    });
    weaponHud.update({ entities: world.entities, playerId: world.playerId, frameDt, photonCooldownTicks: world.photon.cooldownTicks, photonChargeTicks: world.photon.chargeTicks, photonActiveTicks: world.photon.activeTicks, transformUnlocked: mainlineTransformUnlocked(world) });
    minimap.update({
      player: { x: lerp(pl.body.prevX, pl.body.x, alpha), y: lerp(pl.body.prevY, pl.body.y, alpha) + pl.body.height / 2, facing: pl.facing },
      dummies: world.entities.filter((e) => e.kind === 'trainingDummy' && !e.removed).map((e) => ({ x: e.body.x, y: e.body.y + e.body.height / 2 })),
      dt: frameDt,
    });
    d.settingsPanel.update();
    if (d.chapterHud !== null) d.chapterHud.update(world.respawnTicks > 0);
  };

  const frame = (now: number): void => {
    const profiling = perfPanel.visible;
    info.reset();
    if (profiling) prof.begin();
    const elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    const frameDt = Math.min(elapsed, TUNING.sim.maxFrameTime);
    if (frameDt > 0) fps = lerp(fps, 1 / frameDt, 0.1);

    handleUi();
    const paused = settings.paused;
    d.audio?.update(world, paused);
    if (!paused && PLAY_ACTIONS.some((a) => tracker.isHeld(a))) hud.noteInput();
    // 暂停：模拟不步进（插值系数保持），实体动画冻结；风场随模拟暂停，水等视觉效果继续。
    const alpha = settings.advance(stepper, elapsed, tick);
    if (profiling) prof.mark('sim');
    const pl = updateViews(alpha, frameDt, paused, profiling);
    stage.render();
    if (profiling) prof.mark('render');
    updateUi(pl, alpha, frameDt);
    if (profiling) {
      prof.mark('ui');
      prof.end({ calls: info.render.calls, triangles: info.render.triangles });
    }
    perfPanel.update(perfSnapshot, now, fps);
  };

  return {
    frame,
    resetClock: (now) => {
      last = now;
    },
  };
}
