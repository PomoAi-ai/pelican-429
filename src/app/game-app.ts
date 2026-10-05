/**
 * 组合根：校验配置 → 加载层 → 构建渲染（舞台/瓦片/鹈鹕 rig）→ 模拟世界 → 视图/HUD/输入 → rAF 固定步长循环。
 * 任何初始化或循环异常都会停止循环并显示错误层（fail-fast，不静默）。
 * 接线细节拆在 src/app/（设置面板、光照/微光、降水、场景/相机、调试工具、帧循环本体），本文件只负责装配顺序与 rAF。
 */
import { TUNING, validateTuning } from '../config/tuning.ts';
import { DEFAULT_BINDINGS, buildBindingLookup, validateBindings } from '../config/keybindings.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import { createFrameProfiler } from '../core/frame-profiler.ts';
import { createSimWorld, getPlayer, setDummyShooting, setPrecipIntensity, setPrecipMode, setTornado, setTornadoPower, setTornadoCount } from '../sim/sim-world.ts';
import { teleportPlayer } from '../sim/player-teleport.ts';
import { createActionTracker } from '../input/action-map.ts';
import { bindKeyboardMouse } from '../input/keyboard-mouse.ts';
import type { KeyboardMouseBinding } from '../input/keyboard-mouse.ts';
import { createStage } from '../render/stage.ts';
import { createTileGrid } from '../render/tile-grid.ts';
import { createPelicanRig } from '../render/pelican/pelican-rig.ts';
import { createLumaCompanion } from '../render/luma/luma-companion.ts';
import { loadGrassyAsset, disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { loadEnemyAsset, disposeEnemyAssets } from '../render/enemy-rig.ts';
import { createWorldViews } from '../render/world-views.ts';
import { createHud } from '../ui/hud.ts';
import { createControlSurface } from '../ui/control-surface.ts';
import { createWeaponHud } from '../ui/weapon-hud.ts';
import { createMinimap } from '../ui/minimap.ts';
import { createPerfPanel } from '../ui/perf-panel.ts';
import { createWorldCompositionNavigation } from '../ui/world-composition-navigation.ts';
import { loadGameLevel } from './game-level.ts';
import { exposeDebug, installDebugKeys } from './debug-tools.ts';
import { createFrameLoop } from './frame-loop.ts';
import { createWorldLighting, installLightShafts } from './lighting-wiring.ts';
import { createEnvironmentViews, facilityWeather } from './precip-wiring.ts';
import { createEntityViews, createGameCamera, createProjector } from './scene-wiring.ts';
import { createSettingsWiring, loadStartupSettings } from './settings-wiring.ts';
import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import { createFacilityChapterHud } from '../ui/facility-chapter-hud.ts';
import { createFacilityPresentation, facilityGameTuning } from './facility-presentation.ts';
import { GameAudio } from './game-audio.ts';

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`main: missing #${id} element in index.html`);
  return node as T;
}

let stopped = false;
let rafId = 0;
let cleanup: (() => void) | null = null;

function showError(err: unknown): void {
  stopped = true;
  if (rafId) cancelAnimationFrame(rafId);
  try {
    cleanup?.();
  } catch (disposeErr) {
    console.error('cleanup after failure also failed', disposeErr);
  }
  cleanup = null;
  console.error(err);
  const text = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err);
  const box = document.getElementById('error');
  const msg = document.getElementById('error-message');
  if (msg) msg.textContent = text;
  if (box) box.hidden = false;
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

async function start(): Promise<void> {
  validateTuning(TUNING);
  validateBindings(DEFAULT_BINDINGS);
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  const params = new URLSearchParams(location.search);

  const app = requireElement<HTMLDivElement>('app');
  const hudRoot = requireElement<HTMLDivElement>('hud');
  const loading = requireElement<HTMLDivElement>('loading');
  loading.hidden = false;
  // 等两帧，确保加载层先绘制出来，再做约 400ms 的同步鹈鹕构建。
  await nextFrame();
  await nextFrame();
  if (stopped) return;

  const { level, ground, compositions, chapter } = loadGameLevel(params);
  const tuning = chapter === null ? TUNING : facilityGameTuning();
  if (chapter === null && params.get('level') !== 'test') document.title = '演示场景 · 鹈鹕 429';
  if (chapter !== null) document.title = `${FACILITY_SCENES[chapter].name} · 自由预览`;
  const inspect = params.get('inspect');
  const inspected = inspect === null ? undefined : compositions.find((item) => String(item.x0) === inspect);
  if (inspect !== null && inspected === undefined) throw new Error(`当前世界不存在地形定位点：${inspect}`);
  // 保留地图原出生点；重载创建全新的角色状态，检查起点不触发渔屋开场取景。
  const startLevel = inspected === undefined ? level : { ...level, spawn: { x: inspected.x0 + 1.5, y: inspected.baseY }, spawnFacing: undefined };
  // 设置：网址参数（非法即抛）> localStorage 保存值（非法项清除并提示）> 调参默认（见 app/settings-wiring）。
  const startup = loadStartupSettings(params);
  // 机房预览采用场景环境，不继承沙盒的天气和训练假人设置。
  const initial = chapter === null ? startup.loaded.settings : {
    ...startup.loaded.settings, ...facilityWeather(chapter), tornado: false,
    tileGrid: false, perfPanel: false, mapTeleport: false, dummyShoot: false,
  };
  const world = createSimWorld({ level: startLevel, tuning: TUNING, weather: { ...TUNING.render.weather, direction: initial.windDirection === 'right' ? 1 : -1 }, windMode: initial.wind });
  // 022：降水模式是逻辑层环境输入（环境命令），设置/URL/调试键都经 setPrecipMode。
  setPrecipIntensity(world, 'rain', initial.rain);
  setPrecipIntensity(world, 'snow', initial.snow);
  setPrecipMode(world, initial.precip);
  world.env.wind.setPower(initial.windPower);
  world.env.rainPower = initial.rainPower;
  world.env.snowPower = initial.snowPower;
  setTornadoPower(world, initial.tornadoPower);
  setTornadoCount(world, initial.tornadoCount);
  setTornado(world, initial.tornado);
  const stage = createStage(app, tuning, { quality: initial.quality, antialias: initial.antialias });
  const disposers: Array<() => void> = [() => level.fluid.dispose(), () => stage.dispose()];
  cleanup = () => {
    for (const d of disposers.splice(0).reverse()) d();
  };
  disposers.push(disposeGrassyAssets);
  disposers.push(disposeEnemyAssets);
  await Promise.all([loadGrassyAsset('game'), ...[...new Set(world.entities.flatMap((entity) => entity.enemy ? [entity.enemy.kind] : []))].map(loadEnemyAsset)]);
  if (stopped) return;
  const facility = chapter === null ? null : await createFacilityPresentation(stage, chapter);
  if (stopped) {
    if (facility !== null) facility.dispose();
    return;
  }
  if (facility !== null) disposers.push(() => facility.dispose());
  if (compositions.length > 0) {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(level.seed));
    disposers.push(createWorldCompositionNavigation(requireElement('dev-navigation'), compositions, inspected, url));
  }
  // 远山按“厚实心”地表取均值（悬空平台不抬高）；021：有顶洞穴格（网络 + 入口有顶段）当实心，洞穴列地表仍是洞顶之上的真实地表，浮空岛与地面隔空气不算地表。
  if (chapter === null) stage.addBackdrop({ width: level.map.width, height: level.map.height, surface: ground });

  // 地形视图（瓦片/花草、树、水面、水草、渔屋、小鱼、花瓣；树在鹈鹕后方，根贴视觉地面轮廓）；相机就位后按可视范围首帧加载。
  // 风吹天气与水体色板取自设置（见上）。
  const waterPaletteName = initial.water;
  const worldViews = createWorldViews({ scene: stage.scene, level, fish: world.fish, ground, weather: world.env.wind.rules, wind: world.env.wind, tornadoes: () => world.env.tornadoes, cameraDistance: tuning.camera.distance, pelican: () => getPlayer(world).body, actors: () => world.entities, waterPalette: waterPaletteName });
  if (chapter !== null) worldViews.weather.setEnabled(false);
  disposers.push(() => worldViews.dispose());
  // 体积光束（树冠下/天空斜射）；画质 low 时关闭。
  const { shafts, setQuality } = installLightShafts(stage, level, ground, disposers);

  const rig = createPelicanRig({ scale: TUNING.render.pelicanScale });
  disposers.push(() => rig.dispose());
  const entityViews = createEntityViews(stage, level, disposers, () => world.entities, worldViews.treeRide, rig);
  const { views, orbs, orbFx, projectileFx } = entityViews;
  const luma = createLumaCompanion(stage.scene, getPlayer(world));
  disposers.push(() => luma.dispose());
  // 瓦片光照图（洞内发光源、浮空岛天空光）与鹈鹕微光。
  const lighting = createWorldLighting(level, world, waterPaletteName, disposers, tuning.render.lighting);
  const { worldLight } = lighting;

  const canvas = stage.canvas;
  const cameraRig = createGameCamera(stage, startLevel, getPlayer(world), tuning, chapter === null ? undefined : 0);
  // 022 降水视图（雨雪粒子/天色/湿润积雪）：与世界视图同帧同节奏更新。
  const env = createEnvironmentViews(stage, level, world, worldViews, cameraRig, disposers);
  env.update(0, 0, 0);
  shafts.update(cameraRig.visibleRect(2), 0);

  const project = createProjector(stage.camera, canvas);
  const chapterHud = chapter === null ? null : createFacilityChapterHud(document.body, chapter, project);
  if (chapterHud !== null) disposers.push(() => chapterHud.dispose());
  // 光球冷却条并入武器面板（任务 018）：hud 不再单独显示。
  const hud = createHud(hudRoot, project);
  disposers.push(() => hud.dispose());
  const tracker = createActionTracker();
  const weaponHud = createWeaponHud(hudRoot, { weapons: TUNING.weapons, onTransform: () => {
    tracker.press('transform', 'mouse', 'character-switch');
    tracker.release('transform', 'character-switch');
    canvas.focus();
  }, onSkill: (action) => {
    tracker.press(action, 'keyboard', 'skill-button');
    tracker.release(action, 'skill-button');
    canvas.focus();
  } });
  disposers.push(() => weaponHud.dispose());
  const controls = createControlSurface(document.body, {
    onPress: (action, bindingKey) => tracker.press(action, 'mouse', bindingKey),
    onRelease: (action, bindingKey) => tracker.release(action, bindingKey),
    onReset: () => tracker.releaseAll(),
    onFocusGame: () => canvas.focus(),
  });
  disposers.push(() => controls.dispose());
  const audio = chapter === 'fortress' ? new GameAudio(world, document.querySelector<HTMLElement>('.control-tools')!) : null;
  if (audio !== null) disposers.push(() => audio.dispose());

  const input: KeyboardMouseBinding = bindKeyboardMouse({ target: window, canvas, doc: document, tracker, lookup });
  disposers.push(() => input.dispose());
  // 玩家一有输入就结束开场取景的停留、开始过渡。
  const skipIntro = (): void => cameraRig.skipIntro();
  const introInputs = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
  for (const type of introInputs) window.addEventListener(type, skipIntro, { passive: true });
  disposers.push(() => {
    for (const type of introInputs) window.removeEventListener(type, skipIntro);
  });

  // 小地图（右上角）与 M 键大地图；读 level/world 的只读数据，瓦片变化订阅 onChange，水量低频哈希比较。
  const minimap = createMinimap({
    parent: document.body,
    facilityChapter: chapter ?? undefined,
    ...(chapter === null ? {} : { width: 252, height: 184 }),
    source: { tiles: level.map, fluid: world.fluid, trees: level.trees, structures: level.structures, deserts: level.deserts, islands: level.islands },
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    keyTarget: window,
    pixelRatio: () => Math.min(2, window.devicePixelRatio || 1),
    onTeleport: (target) => {
      const position = teleportPlayer(world, target);
      if (position === null) return false;
      tracker.releaseAll();
      cameraRig.snapTo(position.x, position.y, getPlayer(world).facing);
      canvas.focus();
      return true;
    },
  });
  minimap.setTeleportEnabled(initial.mapTeleport);
  disposers.push(() => minimap.dispose());

  const stepper = createFixedStepper(TUNING.sim);
  const debug = params.has('debug') && chapter === null;
  const pour = installDebugKeys(debug, canvas, world, worldViews, disposers);
  // 训练假人射击模式（?dummyShoot / 设置面板）：开局即进入（吞弹反吐演示）。
  if (initial.dummyShoot) setDummyShooting(world, true);
  // 性能面板（帧时间分段、draw call、三角形）：设置面板开关，?debug 下也可按 P；只在面板可见时计时。
  const prof = createFrameProfiler(['sim', 'views', 'world', 'light', 'render', 'ui'], { now: () => performance.now() });
  const perfPanel = createPerfPanel(document.body, debug ? window : null);
  disposers.push(() => perfPanel.dispose());
  perfPanel.setVisible(initial.perfPanel);
  const tileGrid = createTileGrid(stage.scene, level.map.width, level.map.height);
  tileGrid.setVisible(initial.tileGrid);
  disposers.push(() => tileGrid.dispose());

  // 设置面板（Esc / O 或右上角齿轮）：打开时暂停模拟（渲染继续），各项切换即时生效。
  const { runtime, settings, settingsPanel } = createSettingsWiring({ startup, stage, world, worldViews, worldLight, perfPanel, tileGrid, minimap, hud, tracker, setQuality, seed: level.seed, disposers, chapter: chapter !== null });
  const loop = createFrameLoop({ world, level, stage, cameraRig, tracker, controls, input, stepper, pour, entityViews, luma, worldViews, env, shafts, lighting, hud, weaponHud, minimap, settings, settingsPanel, perfPanel, prof, facility, chapterHud, audio });

  const frame = (now: number): void => {
    if (stopped) return;
    try {
      loop.frame(now);
      rafId = requestAnimationFrame(frame);
    } catch (err) {
      showError(err);
    }
  };

  if (debug) exposeDebug({ world, stage, views, cameraRig, tracker, stepper, level, worldViews, orbs, orbFx, projectileFx, weaponHud, shafts, worldLight, setQuality, setAntialias: runtime.setAntialias, settings, minimap, precip: env.precipView });

  // 首帧同步一次再撤掉加载层，避免闪出空场景。
  views.sync(world.entities, 0, 0);
  orbs.update(world.entities, 0);
  worldLight.update(stage.scene, 0);
  stage.render();
  loading.hidden = true;
  canvas.focus();
  loop.resetClock(performance.now());
  rafId = requestAnimationFrame(frame);
}

export function startGame(): void {
  window.addEventListener('pagehide', () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    cleanup?.();
    cleanup = null;
  }, { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  window.addEventListener('error', (e) => showError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => showError(e.reason));
  start().catch(showError);
}
