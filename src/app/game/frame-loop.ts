/**
 * 帧循环本体（从 main.ts 拆出，任务 019 收尾）：界面按键（设置/大地图/帮助）→ 固定步长模拟（设置面板打开时暂停）
 * → 事件分发 → 实体/世界/降水视图 → 光照（微光）→ 渲染 → HUD/小地图/面板 → 性能面板计时。
 * rAF 调度、停止与错误层由 game-app 负责（frame 抛错即交给它的失败处理）。
 */
import { MAINLINE_REVEAL } from '../../config/mainline.ts';
import { PLAYER_TRANSFORM } from '../../config/player-form.ts';
import { PLAY_ACTIONS } from '../../config/keybindings.ts';
import { TUNING } from '../../config/tuning.ts';
import type { FixedStepper } from '../../core/fixed-step.ts';
import type { FrameProfiler } from '../../core/frame-profiler.ts';
import { clamp, lerp } from '../../core/math.ts';
import type { Rect, Vec2 } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import { getSkillWaitTicks } from '../../entities/skill-wait.ts';
import type { ActionTracker } from '../../input/action-map.ts';
import type { KeyboardMouseBinding } from '../../input/keyboard-mouse.ts';
import { waterSpanInColumn } from '../../physics/fluid-contact.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import type { GpuTimer } from '../../render/stage/gpu-timer.ts';
import type { ResolutionGovernor } from '../../core/resolution-governor.ts';
import type { GpuTimings } from '../../core/frame-profiler.ts';
import type { LightShafts } from '../../render/sky/light-shafts.ts';
import type { LumaCompanion } from '../../render/luma/luma-companion.ts';
import type { LandingPod } from '../../render/transit/transit-landing-pod.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import type { WorldViews } from '../../render/stage/world-views.ts';
import { getPlayer, stepSim } from '../../sim/sim-world.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import type { ControlSurface } from '../../ui/hud/control-surface.ts';
import type { GameHud } from '../../ui/hud/game-hud.ts';
import type { Hud } from '../../ui/hud/hud.ts';
import type { Minimap } from '../../ui/hud/minimap.ts';
import type { PerfPanel } from '../../ui/hud/perf-panel.ts';
import type { SettingsController } from '../../ui/model/settings-model.ts';
import type { SettingsPanel } from '../../ui/panels/settings-panel.tsx';
import type { WeaponHud } from '../../ui/hud/weapon-hud.ts';
import { mainlineTransformUnlocked } from '../../sim/mainline.ts';
import type { LevelData } from '../../world/level.ts';
import { pourAtWorld } from './debug-tools.ts';
import type { PourState } from './debug-tools.ts';
import type { Bench } from './bench.ts';
import type { WorldLighting } from './lighting-wiring.ts';
import type { EnvironmentViews } from './precip-wiring.ts';
import type { EntityViewSet } from './game-wiring.ts';
import type { FacilityChapterHud } from '../../ui/hud/facility-chapter-hud.ts';
import type { GameAudio } from '../audio/game-audio.ts';
import { selectMobileAim } from './mobile-aim.ts';
import type { DevCamera } from './dev-camera.ts';

/** 世界功能插件（城区表现、城区建造）：paused 为真时模拟不步进；update 在视图同步之后、光场更新之前调用。 */
export interface GameFeature {
  readonly paused: boolean;
  /** view = 镜头可视范围，time = 环境时间（秒）。 */
  update(view: Readonly<Rect>, time: number, frameDt: number): void;
}

export interface FrameLoopDeps {
  readonly world: SimWorld;
  readonly level: LevelData;
  readonly stage: Stage<StageRenderer>;
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
  readonly gameHud: GameHud;
  readonly minimap: Minimap;
  readonly settings: SettingsController;
  readonly settingsPanel: SettingsPanel;
  readonly perfPanel: PerfPanel;
  readonly prof: FrameProfiler;
  readonly gpu: GpuTimer;
  readonly bench: Bench | null;
  /** 动态分辨率（基准下为 null：像素比固定，结果才可比）。 */
  readonly resolution: ResolutionGovernor | null;
  readonly facility: { update(time: number): void } | null;
  readonly lander: LandingPod | null;
  readonly chapterHud: FacilityChapterHud | null;
  readonly audio: GameAudio | null;
  /** 开发开关 cam=free：自由镜头、预设视角与暂停。 */
  readonly devCamera: DevCamera | null;
  readonly features: readonly GameFeature[];
}

export interface FrameLoop {
  /** 一帧（不含 rAF 调度）；now = rAF 时间戳（ms）。返回本帧时长（秒，已夹到 maxFrameTime），宿主据此推进世界时钟。 */
  frame(now: number): number;
  /** 重置帧时钟（首帧前调用，避免把初始化耗时算进第一帧）。 */
  resetClock(now: number): void;
}

/** 面板收起时动态分辨率每隔多少帧读一次 GPU 均值。 */
const RESOLUTION_WINDOW_FRAMES = 30;

export function createFrameLoop(d: FrameLoopDeps): FrameLoop {
  const { world, level, stage, cameraRig, tracker, input, stepper, pour, hud, weaponHud, minimap, settings, perfPanel, prof, gpu, bench, resolution } = d;
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
  // 基准独占 GPU 计时器的累计；否则面板与动态分辨率共用一次读数，读后清零，得到的是最近一个窗口的均值。
  const readGpu = (): GpuTimings => {
    const timings = gpu.averages();
    // 还没读回任何帧时不清零：reset 会丢掉在途查询，低帧率下面板会永远等不到结果。
    if (timings !== 'unsupported' && timings.frames > 0) {
      gpu.reset();
      if (resolution?.sample(timings.total)) stage.setPixelRatio(resolution.ratio);
    }
    return timings;
  };
  const perfGpu = bench === null ? readGpu : () => null;
  let wasProfiling = false;
  // Esc 先关大地图（小地图自己监听 Escape）：上一帧大地图开着时，本帧的 settings 按键只用于关地图。
  let bigMapWasOpen = false;
  let alpha = 0;
  const view = d.devCamera ?? cameraRig;

  const tick = (): void => {
    const p = input.pointer;
    let target: Vec2 | null = null;
    if (d.controls.mode === 'desktop' && p.inside) target = cameraRig.screenToWorld(p.clientX, p.clientY, aim);
    else if (d.controls.mode === 'mobile') target = selectMobileAim(getPlayer(world), world.entities, cameraRig.visibleRect());
    const skill = weaponHud.consumeSkill();
    let manualSkillAim: Vec2 | null = null;
    if (skill !== null) {
      tracker.press(skill.action, 'mouse', 'skill-touch');
      tracker.release(skill.action, 'skill-touch');
      if (skill.direction !== null) {
        const player = getPlayer(world);
        // 现有技能接受世界目标，用远点表示方向，避免复制各技能的出手位置规则。
        manualSkillAim = { x: player.body.x + skill.direction.x * 1000,
          y: player.body.y + player.body.height / 2 + skill.direction.y * 1000 };
        target = manualSkillAim;
      }
    }
    if (pour.active && p.inside) pourAtWorld(world, level, cameraRig.screenToWorld(p.clientX, p.clientY, pourAt));
    const controls = { ...tracker.consume(target), manualSkillAim };
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
    const reveal = world.mainline && world.mainline.revealTicks >= 0 ? world.mainline.revealTicks : -1;
    const age = (reveal + alpha) * world.tuning.sim.step;
    const returnAt = MAINLINE_REVEAL.zoomSeconds + (PLAYER_TRANSFORM.durationTicks + 1) * world.tuning.sim.step + MAINLINE_REVEAL.holdSeconds;
    const amount = clamp(Math.min(age / MAINLINE_REVEAL.zoomSeconds, 1 - (age - returnAt) / MAINLINE_REVEAL.returnSeconds), 0, 1);
    // 自由镜头由开发镜头驱动，跟随相机不再改写视角。
    if (d.devCamera === null || d.devCamera.following) cameraRig.update(lerp(pl.body.prevX, pl.body.x, alpha), lerp(pl.body.prevY, pl.body.y, alpha), pl.facing, paused ? 0 : frameDt,
      reveal < 0 ? d.lander?.closeup() : {
        shot: { x: pl.body.x, y: pl.body.y + 1.6, distance: Math.min(world.tuning.camera.distance, 7 / Math.min(1, stage.camera.aspect)) },
        blend: amount * amount * (3 - 2 * amount),
      });
    d.devCamera?.update();
    waterTime += frameDt;
    d.env.update(waterTime, worldDt, alpha);
    // 实体视图在世界视图之后同步：树平台随动取本帧写入 GPU 的风 uniform（与树的顶点位移同一帧）。
    views.sync(world.entities, alpha, animDt, view.visibleRect());
    d.lander?.update(alpha, waterTime, animDt);
    // 机房背景视图复制主相机，放在着陆舱之后才能拿到起飞冲击改过的视角。
    d.facility?.update(waterTime);
    d.shafts.update(view.visibleRect(2), waterTime);
    orbFx.update(paused ? 0 : frameDt);
    for (const feature of d.features) feature.update(view.visibleRect(), waterTime, frameDt);
    if (profiling) prof.mark('world');
    d.lighting.worldLight.update(stage.scene, ++frameIndex, view.visibleRect());
    d.lighting.updateAura(pl, alpha, frameDt);
    if (profiling) prof.mark('light');
    return pl;
  };

  /** HUD / 武器面板 / 小地图 / 设置面板。 */
  const updateUi = (pl: Entity, alpha: number, frameDt: number): void => {
    const noseY = pl.body.y + pl.body.height * .9;
    hud.update({
      entities: world.entities,
      headSubmerged: waterSpanInColumn(world.fluid, pl.body.x, noseY, noseY + .05) > 0,
      alpha,
      frameDt,
      stats: { fps, tick: world.tick, droppedTicks: stepper.stats.droppedTicks },
      playerId: world.playerId,
    });
    weaponHud.update({ skillWaitTicks: [0, 1, 2, 3].map(index => getSkillWaitTicks(pl, index, TUNING, world.photon.cooldownTicks, world.photon.chargeTicks)), entities: world.entities, playerId: world.playerId, frameDt, photonCooldownTicks: world.photon.cooldownTicks, photonChargeTicks: world.photon.chargeTicks, photonActiveTicks: world.photon.activeTicks, transformUnlocked: mainlineTransformUnlocked(world) });
    d.gameHud.update(pl, frameDt);
    minimap.update({
      player: { x: lerp(pl.body.prevX, pl.body.x, alpha), y: lerp(pl.body.prevY, pl.body.y, alpha) + pl.body.height / 2, facing: pl.facing },
      dummies: world.entities.filter((e) => e.kind === 'trainingDummy' && !e.removed).map((e) => ({ x: e.body.x, y: e.body.y + e.body.height / 2 })),
      dt: frameDt,
    });
    d.settingsPanel.update();
    if (d.chapterHud !== null) d.chapterHud.update(world.respawnTicks > 0);
  };

  const frame = (now: number): number => {
    const profiling = bench === null ? perfPanel.visible : bench.timing;
    // 收起前留下的在途查询属于上一次展开，展开时丢掉。
    if (profiling && !wasProfiling) gpu.reset();
    wasProfiling = profiling;
    info.reset();
    const timingGpu = profiling || resolution !== null;
    if (profiling) prof.begin();
    if (timingGpu) {
      gpu.beginFrame();
      // 从帧首开始计 world 段：原野背景 RT 与纹理上传发生在 env.update 等视图更新里。
      gpu.mark('world');
    }
    // 基准按帧号驱动：每帧固定推进一个模拟步长，重复运行走同一条路径。
    const elapsed = bench === null ? Math.max(0, (now - last) / 1000) : TUNING.sim.step;
    last = now;
    const frameDt = Math.min(elapsed, TUNING.sim.maxFrameTime);
    if (frameDt > 0) fps = lerp(fps, 1 / frameDt, 0.1);

    handleUi();
    // 开发暂停与功能暂停（建造）只停模拟；设置面板暂停由 settings.advance 自己处理。
    const held = (d.devCamera !== null && d.devCamera.paused) || d.features.some(feature => feature.paused);
    const paused = settings.paused || held;
    if (paused) weaponHud.resetInput();
    d.audio?.update(world, paused);
    if (!paused && PLAY_ACTIONS.some((a) => tracker.isHeld(a))) hud.noteInput();
    bench?.drive();
    // 暂停：模拟不步进（插值系数保持），实体动画冻结；风场随模拟暂停，水等视觉效果继续。
    if (!held) alpha = settings.advance(stepper, elapsed, tick);
    if (profiling) prof.mark('sim');
    const pl = updateViews(alpha, frameDt, paused, profiling);
    stage.render();
    if (timingGpu) gpu.endFrame();
    if (profiling) prof.mark('render');
    updateUi(pl, alpha, frameDt);
    if (profiling) {
      prof.mark('ui');
      // WebGPU 的 render.calls 数的是 render() 次数，绘制次数在 drawCalls。
      prof.end({ calls: 'drawCalls' in info.render ? info.render.drawCalls : info.render.calls, triangles: info.render.triangles });
    }
    perfPanel.update(perfSnapshot, perfGpu, now, fps);
    // 面板收起时由这里按窗口读数；展开时面板每次刷新已读。
    if (resolution !== null && !perfPanel.visible && frameIndex % RESOLUTION_WINDOW_FRAMES === 0) readGpu();
    bench?.afterFrame(now);
    return frameDt;
  };

  return {
    frame,
    resetClock: (now) => {
      last = now;
    },
  };
}
