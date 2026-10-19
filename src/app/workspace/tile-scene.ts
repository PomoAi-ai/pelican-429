import { t } from '../../config/i18n.ts';
import * as THREE from 'three';
import { DEFAULT_BINDINGS, buildBindingLookup, type GameAction } from '../../config/keybindings.ts';
import type { FacilityChapterId } from '../../config/facility-scenes.ts';
import { precipWeatherMode, type SceneWeatherSettings } from '../../config/scene-weather.ts';
import { TRANSIT, TRANSIT_HATCH } from '../../config/transit.ts';
import { TUNING, type Tuning } from '../../config/tuning.ts';
import { DEFAULT_WATER_PALETTE } from '../../config/water-palettes.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import type { Rect, Vec2 } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import { getSkillWaitTicks } from '../../entities/skill-wait.ts';
import { createActionTracker } from '../../input/action-map.ts';
import { bindKeyboardMouse } from '../../input/keyboard-mouse.ts';
import { terrainHeightAt } from '../../physics/tile-collision.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import { loadEnemyAsset } from '../../render/character/enemy-rig.ts';
import { loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { createPelicanRig } from '../../render/pelican/pelican-rig.ts';
import { createReturnCorridorOverlay } from '../transit/return-corridor-overlay.ts';
import { createLandingPod } from '../../render/transit/transit-landing-pod.ts';
import { createUtilityDroneFleet } from '../../render/character/utility-drone.ts';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import type { WorldViews } from '../../render/stage/world-views.ts';
import { canBoardPod, type PodLanding } from '../../sim/pod-landing.ts';
import { setPrecipIntensity, setPrecipMode, setTornado, setTornadoCount, setTornadoPower } from '../../sim/environment.ts';
import { beginPodTakeoff, getPlayer, stepSim, type SimWorld } from '../../sim/sim-world.ts';
import { createGameHud } from '../../ui/hud/game-hud.ts';
import type { WorldToScreen } from '../../ui/hud/hud.ts';
import { createMinimap } from '../../ui/hud/minimap.ts';
import { createPodReturnPrompt } from '../../ui/hud/pod-return-prompt.ts';
import { SCENE_VIEW_ANGLES, type SceneViewAngle } from '../../ui/panels/scene-view-controls.tsx';
import { createWeaponHud } from '../../ui/hud/weapon-hud.ts';
import type { LevelData } from '../../world/level.ts';
import { pourAtWorld, type PourState } from '../game/debug-tools.ts';
import { createFollowDroneBodies } from '../game/follow-drone-bodies.ts';
import { keepWorldParams } from '../game/free-world-navigation.ts';
import { createWorldLighting } from '../game/lighting-wiring.ts';
import { tiltCamera } from '../perspective/perspective-controls.ts';
import type { createSceneDemoStage } from './scene-demo-stage.ts';
import { createSceneGameOverlays } from './scene-game-overlays.ts';
import { waitSceneResource, type SceneMountContext } from './scene-mount.ts';
import { createEntityViews } from '../game/game-wiring.ts';
// 原生 HUD 的样式由装配它的入口引入（index.html 不再全局外链）。
import '../../ui/hud/hud.css';
import '../../ui/hud/control-surface.css';
import '../../ui/hud/game-hud.css';

const RETURN_FADE_SECONDS = 1.2;

/** 关卡与原野场景各自装配世界与背景，循环、输入、HUD、视角和着陆舱由这里统一驱动。 */
export interface TileSceneSetup {
  readonly level: LevelData;
  readonly world: SimWorld;
  readonly worldViews: WorldViews;
  readonly camera: CameraRig;
  readonly tuning: Tuning;
  readonly minimapChapter: FacilityChapterId | undefined;
  /** 关卡出生点旁的着陆舱；原野没有。 */
  readonly pod: PodLanding | null;
  /** GM 小地图点击传送；null 时关闭。 */
  readonly teleport: ((target: Vec2) => boolean) | null;
  /** GM 调试倒水（F / 中键）；关卡没有。 */
  readonly pour?: PourState;
  /** 背景、世界视图与天空：time 为模拟时间，dt 为本帧模拟步长，view 为外扩后的可视范围。 */
  update(time: number, dt: number, alpha: number, view: Rect): void;
  /** 复制主相机的机房背景，须在着陆舱改过视角之后更新。 */
  readonly facility: { update(time: number): void } | null;
  /** 每帧收尾：快速旅行落定、出口检测等。 */
  frame?(): void;
}

/** 主角与世界里出现的敌人模型。 */
export async function loadTileActors(context: SceneMountContext, world: SimWorld, label: string): Promise<void> {
  const dependencies = [loadGrassyAsset('game'), ...[...new Set(world.entities.flatMap(entity => entity.enemy ? [entity.enemy.kind] : []))].map(kind => loadEnemyAsset(kind))];
  let loaded = 0;
  context.progress(label, 0, dependencies.length);
  await waitSceneResource(Promise.all(dependencies.map(promise => promise.then(() => {
    context.progress(label, ++loaded, dependencies.length);
  }))), context.signal);
}

/** 工作区天气即时写入模拟：风、雨雪与龙卷风。 */
function createSimWeatherSync(world: SimWorld) {
  let tornadoEnabled = false;
  return (settings: SceneWeatherSettings): void => {
    if (world.env.wind.mode !== settings.wind) world.env.wind.setMode(settings.wind);
    world.env.wind.setPower(settings.windPower);
    world.env.wind.setDirection(settings.windDirection);
    if (world.env.mode !== settings.precip) setPrecipMode(world, settings.precip);
    if (world.env.manual.rain !== settings.rain) setPrecipIntensity(world, 'rain', settings.rain);
    if (world.env.manual.snow !== settings.snow) setPrecipIntensity(world, 'snow', settings.snow);
    world.env.rainPower = settings.rainPower; world.env.snowPower = settings.snowPower;
    if (world.env.tornadoPower !== settings.tornadoPower) setTornadoPower(world, settings.tornadoPower);
    if (world.env.tornadoCount !== settings.tornadoCount) setTornadoCount(world, settings.tornadoCount);
    if (tornadoEnabled !== settings.tornado) { setTornado(world, settings.tornado); tornadoEnabled = settings.tornado; }
  };
}

/** 工具条视角片段：暂停、自由镜头、游玩视角与三个预设；reset 释放按住的键并清掉未走完的步长。 */
function bindViewControls({ page, stage, orbit, view }: ReturnType<typeof createSceneDemoStage>, camera: CameraRig, player: () => Entity, spawn: Readonly<Vec2>,
  signal: AbortSignal, reset: () => void) {
  const state = { playing: true, following: true, preset: 'front' as SceneViewAngle };
  const sync = (): void => {
    view.set({ playing: state.playing, following: state.following });
    page.querySelector('[data-mode]')!.textContent = `${state.playing ? t('游玩中') : t('已暂停')} · ${state.following ? t('跟随镜头') : t('自由镜头')}`;
    orbit.enabled = !state.following;
    reset();
    stage.canvas.focus({ preventScroll: true });
  };
  const follow = (): void => {
    state.following = true;
    camera.snapTo(player().body.x, player().body.y, player().facing);
    sync();
  };
  view.on(action => {
    if (action === 'play') { state.playing = !state.playing; sync(); }
    else if (action === 'camera') {
      if (state.following) { state.following = false; orbit.target.set(camera.focus.x, camera.focus.y, 0); sync(); }
      else follow();
    } else if (action === 'playView') follow();
    else {
      state.preset = action;
      view.set({ preset: action });
      // 跟随时每帧按预设倾斜；自由镜头绕当前注视点转过去。
      if (!state.following) { tiltCamera(stage.camera, orbit.target, stage.camera.position.distanceTo(orbit.target), SCENE_VIEW_ANGLES[state.preset]); orbit.update(); }
      stage.canvas.focus({ preventScroll: true });
    }
  }, signal);
  orbit.addEventListener('start', () => view.set({ preset: null }));
  page.querySelector('[data-reset-player]')!.addEventListener('click', () => {
    Object.assign(player().body, { x: spawn.x, y: spawn.y, prevX: spawn.x, prevY: spawn.y, vx: 0, vy: 0 });
    follow();
  }, { signal });
  sync();
  return state as Readonly<typeof state>;
}

/** 首帧画好并预热后返回；循环在加载层揭幕后才开始。 */
export async function playTileScene(context: SceneMountContext, demoStage: ReturnType<typeof createSceneDemoStage>, setup: TileSceneSetup): Promise<{ releaseInput(): void }> {
  const { page, stage, orbit, visibleView } = demoStage;
  const { level, world, worldViews, camera, tuning, pod } = setup;
  const disposers: Array<() => void> = [];
  context.onDispose(() => { for (const dispose of disposers.reverse()) dispose(); });
  const pelicanRig = createPelicanRig({ scale: TUNING.render.pelicanScale });
  context.onDispose(() => pelicanRig.dispose());
  const entities = createEntityViews(stage, level, disposers, () => world.entities, worldViews.treeRide, world.env.wind, pelicanRig, 'game');
  const lighting = createWorldLighting(level, world, DEFAULT_WATER_PALETTE, disposers, tuning.render.lighting);
  const player = () => getPlayer(world);
  const viewport = page.querySelector<HTMLElement>('.room-preview-viewport')!;
  const minimap = createMinimap({ parent: viewport, facilityChapter: setup.minimapChapter,
    source: { tiles: level.map, fluid: world.fluid, trees: level.trees, structures: level.structures, deserts: level.deserts, islands: level.islands },
    viewport: () => ({ width: viewport.clientWidth, height: viewport.clientHeight }),
    keyTarget: window, pixelRatio: () => Math.min(2, window.devicePixelRatio),
    onTeleport: setup.teleport ?? undefined });
  minimap.setTeleportEnabled(setup.teleport !== null);
  context.onDispose(() => minimap.dispose());
  const overlays = createSceneGameOverlays(page.querySelector<HTMLElement>('.room-preview-toolbar')!, viewport, stage, minimap);
  context.onDispose(() => overlays.dispose());
  const tracker = createActionTracker();
  const binding = bindKeyboardMouse({ target: window, canvas: stage.canvas, doc: document, tracker, lookup: buildBindingLookup(DEFAULT_BINDINGS) });
  context.onDispose(() => { binding.dispose(); tracker.releaseAll(); });
  const cast = (action: GameAction): void => { tracker.press(action, 'keyboard', 'skill-button'); tracker.release(action, 'skill-button'); };
  const projected = new THREE.Vector3();
  // HUD 每帧要投影多次；尺寸缓存下来，避免读布局触发强制重排。
  let canvasSize = { width: stage.canvas.clientWidth, height: stage.canvas.clientHeight };
  const resize = new ResizeObserver(([entry]) => { canvasSize = entry!.contentRect; });
  resize.observe(stage.canvas);
  context.onDispose(() => resize.disconnect());
  const project: WorldToScreen = (x, y) => {
    projected.set(x, y, 0).project(stage.camera);
    return projected.z < -1 || projected.z > 1 ? null : { x: (projected.x + 1) * canvasSize.width / 2, y: (1 - projected.y) * canvasSize.height / 2 };
  };
  const hudRoot = page.querySelector<HTMLElement>('.room-preview-hud')!;
  const hud = createWeaponHud(hudRoot, { weapons: TUNING.weapons, project, onTransform: () => cast('transform'), onSkill: cast });
  context.onDispose(() => hud.dispose());
  const lander = pod ? createLandingPod(stage, pod, {
    landing: () => world.podLanding, takeoff: () => world.podTakeoff !== null,
    body: () => player().body, step: world.tuning.sim.step, planeZ: 0, cameraDistance: tuning.camera.distance,
    carry(pose) {
      // The view's outer group rotates about the world origin, so it shifts back by the rotated body x to pivot about the body.
      const object = entities.views.get(world.playerId)!.object;
      if (pose === null) { object.position.set(0, 0, 0); object.rotation.y = 0; return; }
      object.rotation.y = pose.yaw;
      object.position.set(pose.x * (1 - Math.cos(pose.yaw)), pose.lift, pose.z + pose.x * Math.sin(pose.yaw));
    },
  }) : null;
  if (lander !== null) context.onDispose(() => lander.dispose());
  // 返程穿梭层趁加载时隐藏着建好：新建渲染器会卡一两秒，留到飞走那一刻会把急加速冻住。
  const corridor = pod ? createReturnCorridorOverlay(document.body, false) : null;
  let returnTimer = 0;
  if (corridor !== null) context.onDispose(() => { clearTimeout(returnTimer); corridor.hide(.4); });
  const droneFleet = createUtilityDroneFleet(stage.scene, stage.createPmrem());
  context.onDispose(() => droneFleet.dispose());
  const droneBodies = createFollowDroneBodies(world);
  const podPrompt = pod ? createPodReturnPrompt(viewport, (x, y) => {
    // 提示按钮是 fixed 定位，画布坐标换成页面坐标。
    const point = project(x, y);
    const rect = stage.canvas.getBoundingClientRect();
    return point && { x: point.x + rect.left, y: point.y + rect.top };
  }, {
    door: () => world.podLanding === null && world.podBoarding === null && world.podTakeoff === null && canBoardPod(pod, player().body)
      ? { x: pod.x - (TRANSIT.rocketX - TRANSIT_HATCH.x), y: pod.ground + 4.6 } : null,
    blocked: () => !controls.playing || minimap.bigMapOpen || world.respawnTicks > 0,
    onOpen: () => tracker.releaseAll(),
    onClose: () => { tracker.releaseAll(); stage.canvas.focus({ preventScroll: true }); },
    onConfirm: () => beginPodTakeoff(world, pod),
  }) : null;
  if (podPrompt !== null) context.onDispose(() => podPrompt.dispose());
  const gameHud = createGameHud(hudRoot, {
    updateDrone: (index, x, y, dt, talking, flying, groundAngle, groundHeight, escortDepth) => {
      droneFleet.updateFollower(index, x, y, dt, talking, flying, groundAngle, groundHeight, escortDepth);
      droneBodies.place(index, x, y, dt, escortDepth === undefined);
    },
    droneEscort: lander?.droneEscort,
    groundAt: (x, y) => terrainHeightAt(world.map, x, y + 0.3, 2.8, true) ?? terrainHeightAt(world.map, x, y + 2.5, 2.2, true),
    droneBlocked: droneBodies.blocked,
    canvas: stage.canvas, project,
    // 自动天气由模拟按区域与时刻决定雨雪，标签跟随实际降水。
    world: { time: context.world.time, get weather() { return context.world.weatherConfig.precip === 'auto' ? precipWeatherMode(world.env.precip) : context.world.weather; } },
    blocked: () => !controls.playing || podPrompt?.open === true,
  });
  gameHud.attachMap(minimap.element);
  context.onDispose(() => gameHud.dispose());
  const stepper = createFixedStepper(TUNING.sim);
  const controls = bindViewControls(demoStage, camera, player, level.spawn, context.signal, () => { tracker.releaseAll(); stepper.reset(); });
  page.querySelector('.room-preview-hint')!.textContent = t('A / D 移动 · 空格跳跃 / 飞行 · S 下穿 · F 变身 · R 骑行 · J / 右键 / 1 / 2 技能');
  camera.snapTo(player().body.x, player().body.y, player().facing);
  let previous = performance.now();
  let frame = 0;
  let lightFrame = 0;
  let alpha = 0;
  let elapsed = 0;
  let view = camera.visibleRect(4);
  let returning = false;
  const tilt = new THREE.Vector3();
  context.onDispose(() => cancelAnimationFrame(frame));
  const syncWeather = createSimWeatherSync(world);
  const update = (dt: number): void => {
    syncWeather(context.world.weatherConfig);
    const previousTick = world.tick;
    // 舱门确认框打开时同游戏页一样冻结模拟。
    const running = controls.playing && podPrompt?.open !== true;
    if (running) alpha = stepper.advance(dt, () => {
      const pointer = binding.pointer;
      const aim = pointer.inside ? camera.screenToWorld(pointer.clientX, pointer.clientY, { x: 0, y: 0 }) : null;
      if (setup.pour?.active) pourAtWorld(world, level, aim);
      stepSim(world, tracker.consume(aim));
    });
    else tracker.releaseAll();
    const time = world.tick * TUNING.sim.step;
    const simulationDt = (world.tick - previousTick) * TUNING.sim.step;
    const animDt = running ? dt : 0;
    elapsed += dt;
    const events = world.events.drain();
    for (const event of events) {
      if (event.type === 'teleported' && event.id === world.playerId) camera.snapTo(event.x, event.y, player().facing);
    }
    const body = player().body;
    if (controls.following) {
      camera.update(THREE.MathUtils.lerp(body.prevX, body.x, alpha), THREE.MathUtils.lerp(body.prevY, body.y, alpha), player().facing, animDt, lander?.closeup());
      tilt.set(stage.camera.position.x, stage.camera.position.y, 0);
      tiltCamera(stage.camera, tilt, stage.camera.position.z, SCENE_VIEW_ANGLES[controls.preset]);
    } else orbit.update();
    // 正视跟随时可见范围就是跟随相机的矩形；倾斜或自由镜头按视锥求。
    view = (controls.following && controls.preset === 'front' ? camera.visibleRect(4) : visibleView()) ?? view;
    worldViews.handleEvents(events); entities.orbFx.handleEvents(events); entities.projectileFx.handleEvents(events); hud.handleEvents(events);
    setup.update(time, simulationDt, alpha, view);
    entities.views.sync(world.entities, alpha, animDt, view);
    lander?.update(alpha, elapsed, animDt);
    setup.facility?.update(time);
    entities.orbs.update(world.entities, alpha); entities.orbFx.update(animDt); entities.projectileFx.update(world.entities, alpha, animDt);
    lighting.updateAura(player(), alpha, dt); lighting.worldLight.update(stage.scene, lightFrame++);
    hud.update({ entities: world.entities, playerId: world.playerId, frameDt: dt,
      skillWaitTicks: [0, 1, 2, 3].map(index => getSkillWaitTicks(player(), index, TUNING, world.photon.cooldownTicks, world.photon.activeTicks)),
      photonCooldownTicks: world.photon.cooldownTicks, photonChargeTicks: world.photon.chargeTicks, photonActiveTicks: world.photon.activeTicks, transformUnlocked: true });
    gameHud.update(player(), dt);
    minimap.update({ player: { x: body.x, y: body.y, facing: player().facing }, dt });
    podPrompt?.update();
    // 着陆舱升空急加速飞走后淡入温和版穿梭画面，再切到城区条目，由城区着陆舱降落在交通中心旁。
    if (corridor !== null && !returning && lander!.launched()) {
      returning = true;
      tracker.releaseAll();
      corridor.show(RETURN_FADE_SECONDS);
      returnTimer = window.setTimeout(() => context.open(keepWorldParams('./?mode=game&landing=1', location.search)), RETURN_FADE_SECONDS * 1000);
    }
    setup.frame?.();
  };
  update(0);
  context.progress(t('准备着色器与首帧'));
  await warmUpStage(stage, [], context.signal);
  context.signal.throwIfAborted();
  stage.render();
  const draw = (now: number): void => {
    if (context.signal.aborted) return;
    try {
      overlays.begin();
      update(Math.max(0, Math.min((now - previous) / 1000, TUNING.sim.maxFrameTime)));
      previous = now;
      overlays.render();
      frame = requestAnimationFrame(draw);
    } catch (error) { context.reportError(error); }
  };
  // 后台标签页不跑帧，切回时重置时钟，首帧不补一整段模拟。
  document.addEventListener('visibilitychange', () => { previous = performance.now(); }, { signal: context.signal });
  // 加载层淡出时才开始走时间，着陆舱下降不会在幕后播完。
  void context.revealed.then(() => {
    if (context.signal.aborted) return;
    previous = performance.now();
    frame = requestAnimationFrame(draw);
  });
  return { releaseInput: () => tracker.releaseAll() };
}
