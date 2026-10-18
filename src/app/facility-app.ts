import { loadUtilityDroneFleet } from '../render/utility-drone.ts';
import * as THREE from 'three';
import { DEFAULT_BINDINGS, buildBindingLookup, type GameAction } from '../config/keybindings.ts';
import { FACILITY_SCENES, type FacilitySceneId } from '../config/facility-scenes.ts';
import { DEFAULT_PRECIP } from '../config/precip-rules.ts';
import { TUNING } from '../config/tuning.ts';
import { DEFAULT_WATER_PALETTE } from '../config/water-palettes.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import { sampleWorldTime } from '../core/calendar.ts';
import { getSkillWaitTicks } from '../entities/skill-wait.ts';
import { createActionTracker } from '../input/action-map.ts';
import { bindKeyboardMouse } from '../input/keyboard-mouse.ts';
import { tileDefinitionCollision } from '../physics/tile-definition-collision.ts';
import { terrainHeightAt } from '../physics/tile-collision.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createCameraRig } from '../render/camera-rig.ts';
import { loadEnemyAsset } from '../render/enemy-rig.ts';
import { loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { createPelicanRig } from '../render/pelican/pelican-rig.ts';
import { computePrecipColumn } from '../render/precip-columns.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { levelGroundColumns } from '../render/surface-decor-view.ts';
import { warmUpStage } from '../render/warm-up.ts';
import { createWorldViews } from '../render/world-views.ts';
import { createSimWorld, getPlayer, stepSim } from '../sim/sim-world.ts';
import { setPrecipIntensity, setPrecipMode, setTornado, setTornadoCount, setTornadoPower } from '../sim/environment.ts';
import { createGameHud } from '../ui/game-hud.ts';
import type { WorldToScreen } from '../ui/hud.ts';
import { createWeaponHud } from '../ui/weapon-hud.ts';
import { createMinimap } from '../ui/minimap.ts';
import { createFacilityLevel } from '../world/facility-level.ts';
import { createFacilityPresentation, facilityGameTuning } from './facility-presentation.ts';
import { createWorldLighting } from './lighting-wiring.ts';
import { createSceneDemoStage } from './scene-demo-stage.ts';
import { createEntityViews } from './scene-wiring.ts';
import { waitSceneResource, yieldScene, type SceneMountContext } from './scene-mount.ts';
import { createSceneGameOverlays } from './scene-game-overlays.ts';

/** 四个机房复用正式关卡、模拟世界、实体视图与机房镜头。 */
export async function mountFacilityDemo(context: SceneMountContext, sceneId: FacilitySceneId): Promise<void> {
  const tuning = facilityGameTuning();
  const { page, stage, orbit, visibleView } = createSceneDemoStage(context, tuning);
  const disposers: Array<() => void> = [];
  context.onDispose(() => { for (const dispose of disposers.reverse()) dispose(); });
  const level = createFacilityLevel(sceneId);
  context.onDispose(() => level.fluid.dispose());
  const world = createSimWorld({ level, tuning: TUNING, playerForm: 'human', windMode: 'breeze',
    precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const dependencies = [loadGrassyAsset('game'), ...[...new Set(world.entities.flatMap(entity => entity.enemy ? [entity.enemy.kind] : []))].map(kind => loadEnemyAsset(kind))];
  let loaded = 0;
  context.progress('加载主角与机房角色', 0, dependencies.length);
  await waitSceneResource(Promise.all(dependencies.map(promise => promise.then(() => {
    context.progress('加载主角与机房角色', ++loaded, dependencies.length);
  }))), context.signal);
  context.progress('装配机房背景与设施');
  const facility = await waitSceneResource(createFacilityPresentation(stage, sceneId).then(instance => {
    if (context.signal.aborted) instance.dispose();
    else context.onDispose(() => instance.dispose());
    return instance;
  }), context.signal);
  context.signal.throwIfAborted();
  await yieldScene(context.signal);
  const ground = levelGroundColumns(level);
  if (sceneId === 'original') stage.addBackdrop({ width: level.map.width, height: level.map.height, surface: ground });
  const views = createWorldViews({ caveBackground: null, scene: stage.scene, level, fish: world.fish, ground,
    wind: world.env.wind, pelican: () => getPlayer(world).body, actors: () => world.entities });
  context.onDispose(() => views.dispose());
  views.weather.setEnabled(false);
  const pelicanRig = createPelicanRig({ scale: TUNING.render.pelicanScale });
  context.onDispose(() => pelicanRig.dispose());
  const entities = createEntityViews(stage, level, disposers, () => world.entities, views.treeRide, world.env.wind, pelicanRig, 'game');
  const lighting = createWorldLighting(level, world, DEFAULT_WATER_PALETTE, disposers, tuning.render.lighting);
  const sky = createAiCityLighting(stage);
  sky.setEnabled(true);
  context.onDispose(() => sky.dispose());
  const collision = tileDefinitionCollision(level.map);
  const precipSource = { map: level.map, fluid: level.fluid, deserts: level.deserts, desertFactor: DEFAULT_PRECIP.snow.desertFactor };
  const weather = createResidenceWeather(stage, () => collision.solids, { minX: 0, width: level.map.width,
    wind: world.env.wind,
    precipColumns: columns => {
      for (let x = 0; x < level.map.width; x++) {
        const column = computePrecipColumn(precipSource, x);
        columns.set([column.roof, column.stop, column.snow, column.water ? 1 : 0], x * 4);
      }
    } });
  context.onDispose(() => weather.dispose());
  const camera = createCameraRig({ camera: stage.camera, tuning, bounds: { width: level.map.width, height: level.map.height },
    viewport: () => stage.canvas.getBoundingClientRect() });
  const player = () => getPlayer(world);
  const viewport = page.querySelector<HTMLElement>('.room-preview-viewport')!;
  const minimap = createMinimap({ parent: viewport, facilityChapter: sceneId === 'original' ? undefined : sceneId,
    source: { tiles: level.map, fluid: world.fluid, trees: level.trees, structures: level.structures, deserts: level.deserts, islands: level.islands },
    viewport: () => ({ width: viewport.clientWidth, height: viewport.clientHeight }),
    keyTarget: window, pixelRatio: () => Math.min(2, window.devicePixelRatio) });
  context.onDispose(() => minimap.dispose());
  const overlays = createSceneGameOverlays(page.querySelector<HTMLElement>('.room-preview-toolbar')!, viewport, stage, minimap);
  context.onDispose(() => overlays.dispose());
  camera.snapTo(player().body.x, player().body.y, player().facing);
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
  let playing = true;
  let following = true;
  const droneFleet = await loadUtilityDroneFleet(stage.scene);
  if (context.signal.aborted) { droneFleet.dispose(); context.signal.throwIfAborted(); }
  context.onDispose(() => droneFleet.dispose());
  const gameHud = createGameHud(hudRoot, {
    updateDrone: droneFleet.updateFollower,
    groundAt: (x, y) => terrainHeightAt(world.map, x, y + 0.3, 2.8, true) ?? terrainHeightAt(world.map, x, y + 2.5, 2.2, true),
    canvas: stage.canvas, project, world: context.world,
    blocked: () => !playing,
  });
  gameHud.attachMap(minimap.element);
  context.onDispose(() => gameHud.dispose());
  const play = page.querySelector<HTMLButtonElement>('[data-play]')!;
  const cameraButton = page.querySelector<HTMLButtonElement>('[data-camera]')!;
  const syncControls = (): void => {
    play.textContent = playing ? '暂停游玩' : '继续游玩';
    play.setAttribute('aria-pressed', String(playing));
    cameraButton.textContent = following ? '自由镜头' : '跟随玩家';
    cameraButton.setAttribute('aria-pressed', String(following));
    page.querySelector('[data-mode]')!.textContent = `${playing ? '游玩中' : '已暂停'} · ${following ? '跟随镜头' : '自由镜头'}`;
    orbit.enabled = !following;
    tracker.releaseAll();
    stage.canvas.focus({ preventScroll: true });
  };
  const stepper = createFixedStepper(TUNING.sim);
  play.addEventListener('click', () => { playing = !playing; stepper.reset(); syncControls(); }, { signal: context.signal });
  cameraButton.addEventListener('click', () => {
    following = !following;
    if (following) camera.snapTo(player().body.x, player().body.y, player().facing);
    else orbit.target.set(camera.focus.x, camera.focus.y, 0);
    syncControls();
  }, { signal: context.signal });
  page.querySelector('[data-reset-player]')!.addEventListener('click', () => {
    Object.assign(player().body, { x: level.spawn.x, y: level.spawn.y, prevX: level.spawn.x, prevY: level.spawn.y, vx: 0, vy: 0 });
    camera.snapTo(player().body.x, player().body.y, player().facing);
    following = true; syncControls();
  }, { signal: context.signal });
  page.querySelector('.room-preview-hint')!.textContent = 'A / D 移动 · 空格跳跃 / 飞行 · S 下穿 · F 变身 · R 骑行 · J / 右键 / 1 / 2 技能';
  page.querySelector('[data-sample-label]')!.textContent = FACILITY_SCENES[sceneId].name;
  syncControls();
  let previous = performance.now();
  let frame = 0;
  let lightFrame = 0;
  let tornadoEnabled = false;
  context.onDispose(() => cancelAnimationFrame(frame));
  const update = (dt: number): void => {
    const settings = context.world.weatherConfig;
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
    const previousTick = world.tick;
    const alpha = playing ? stepper.advance(dt, () => {
      const pointer = binding.pointer;
      const aim = pointer.inside ? camera.screenToWorld(pointer.clientX, pointer.clientY, { x: 0, y: 0 }) : null;
      stepSim(world, tracker.consume(aim));
    }) : 0;
    const time = world.tick * TUNING.sim.step;
    const simulationDt = (world.tick - previousTick) * TUNING.sim.step;
    const body = player().body;
    if (following) camera.update(THREE.MathUtils.lerp(body.prevX, body.x, alpha), THREE.MathUtils.lerp(body.prevY, body.y, alpha), player().facing, dt);
    else orbit.update();
    const view = following ? camera.visibleRect(4) : visibleView();
    const events = world.events.drain();
    views.handleEvents(events); entities.orbFx.handleEvents(events); entities.projectileFx.handleEvents(events); hud.handleEvents(events);
    if (view) views.update(view, time, simulationDt, alpha);
    entities.views.sync(world.entities, alpha, playing ? dt : 0);
    entities.orbs.update(world.entities, alpha); entities.orbFx.update(dt); entities.projectileFx.update(world.entities, alpha, dt);
    lighting.updateAura(player(), alpha, dt); lighting.worldLight.update(stage.scene, lightFrame++);
    facility.update(time);
    const worldTime = sampleWorldTime(context.world.time);
    weather.setWeather(context.world.weather);
    weather.setSettings(settings);
    const atmosphere = weather.update(time, simulationDt, worldTime, world.env);
    sky.setWorldTime(worldTime, atmosphere); sky.update();
    hud.update({ entities: world.entities, playerId: world.playerId, frameDt: dt,
      skillWaitTicks: [0, 1, 2, 3].map(index => getSkillWaitTicks(player(), index, TUNING, world.photon.cooldownTicks, world.photon.activeTicks)),
      photonCooldownTicks: world.photon.cooldownTicks, photonChargeTicks: world.photon.chargeTicks, photonActiveTicks: world.photon.activeTicks, transformUnlocked: true });
    gameHud.update(player(), dt);
    minimap.update({ player: { x: body.x, y: body.y, facing: player().facing }, dt });
  };
  update(0);
  context.progress('准备机房着色器与首帧');
  await warmUpStage(stage, [], context.signal);
  context.signal.throwIfAborted();
  stage.render();
  const draw = (now: number): void => {
    if (context.signal.aborted) return;
    try {
      overlays.begin();
      update(Math.max(0, Math.min((now - previous) / 1000, .05)));
      previous = now;
      overlays.render();
      frame = requestAnimationFrame(draw);
    } catch (error) { context.reportError(error); }
  };
  frame = requestAnimationFrame(draw);
}
