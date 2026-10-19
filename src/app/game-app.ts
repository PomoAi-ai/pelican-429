import { createUtilityDroneFleet } from '../render/utility-drone.ts';
import { terrainHeightAt } from '../physics/tile-collision.ts';
/**
 * 组合根：校验配置 → 加载层 → 构建渲染（舞台/瓦片/鹈鹕 rig）→ 模拟世界 → 视图/HUD/输入 → rAF 固定步长循环。
 * 任何初始化或循环异常都会停止循环并显示错误层（fail-fast，不静默）。
 * 接线细节拆在 src/app/（设置面板、光照/微光、降水、场景/相机、调试工具、帧循环本体），本文件只负责装配顺序与 rAF。
 */
import { TUNING, validateTuning } from '../config/tuning.ts';
import { DEFAULT_BINDINGS, buildBindingLookup, validateBindings } from '../config/keybindings.ts';
import { timeFromReal } from '../core/calendar.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import { createFrameProfiler } from '../core/frame-profiler.ts';
import { canBoardPod, parkedPod } from '../sim/pod-landing.ts';
import { beginBlackholeArrival, beginPodLanding, beginPodTakeoff, createSimWorld, getPlayer, setDummyShooting, setMobileBossDifficulty, setPrecipIntensity, setPrecipMode, setTornado, setTornadoPower, setTornadoCount } from '../sim/sim-world.ts';
import type { TeleportState } from '../entities/teleport.ts';
import { placePlayer, teleportPlayer } from '../sim/player-teleport.ts';
import { createActionTracker } from '../input/action-map.ts';
import { bindKeyboardMouse } from '../input/keyboard-mouse.ts';
import type { KeyboardMouseBinding } from '../input/keyboard-mouse.ts';
import { createStage } from '../render/stage.ts';
import type { Stage, StageRenderer } from '../render/stage.ts';
import { createGpuTimer } from '../render/gpu-timer.ts';
import { createResolutionGovernor } from '../core/resolution-governor.ts';
import { createTileGrid } from '../render/tile-grid.ts';
import { createPelicanRig } from '../render/pelican/pelican-rig.ts';
import { createLumaCompanion } from '../render/luma/luma-companion.ts';
import { loadGrassyAsset, disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { openSavedCharacterEditor } from './open-character-editor.ts';
import { loadEnemyAsset, disposeEnemyAssets } from '../render/enemy-rig.ts';
import { createFreeWorldBackground } from '../render/free-world-background.ts';
import { createFlyingRoadster } from '../entities/flying-roadster.ts';
import { loadFlyingRoadsterAsset, disposeFlyingRoadsterAsset } from '../render/flying-roadster-view.ts';
import { createFreeWorldDaylight, type FreeWorldDaylight } from '../render/free-world-daylight.ts';
import { loadInteriorBackgroundTexture, loadInteriorBackgroundTextures } from '../render/free-world-interior-textures.ts';
import { createWorldViews } from '../render/world-views.ts';
import { warmUpStage } from '../render/warm-up.ts';
import { createLandingPod } from '../render/transit-landing-pod.ts';
import { LANDING_POD, landingPodPlan, TRANSIT, TRANSIT_HATCH } from '../config/transit.ts';
import { createPodReturnPrompt } from '../ui/pod-return-prompt.ts';
import { createReturnCorridorOverlay, RETURN_CORRIDOR_BASE } from '../render/return-corridor-overlay.ts';
import { createHud } from '../ui/hud.ts';
import { createControlSurface } from '../ui/control-surface.ts';
import { gameHost, replaceGameLocation } from '../ui/mobile-game-viewport.ts';
import { createWeaponHud } from '../ui/weapon-hud.ts';
import { createMinimap } from '../ui/minimap.ts';
import { createGameHud } from '../ui/game-hud.ts';
import { createFollowDroneBodies } from './follow-drone-bodies.ts';
import { createPerfPanel } from '../ui/perf-panel.ts';
import { createWorldCompositionNavigation } from '../ui/world-composition-navigation.ts';
import { loadGameLevel } from './game-level.ts';
import { exposeDebug, installDebugKeys } from './debug-tools.ts';
import { createFrameLoop } from './frame-loop.ts';
import { BENCH_SAMPLES, benchRegion, createBench, parseBench } from './bench.ts';
import { createWorldLighting, installLightShafts } from './lighting-wiring.ts';
import { createEnvironmentViews, facilityWeather } from './precip-wiring.ts';
import { createEntityViews, createGameCamera, createProjector } from './scene-wiring.ts';
import { createSettingsWiring, loadStartupSettings } from './settings-wiring.ts';
import { FACILITY_CHAPTERS, FACILITY_SCENES } from '../config/facility-scenes.ts';
import { createFacilityChapterHud } from '../ui/facility-chapter-hud.ts';
import { createFacilityPresentation, createFreeWorldFacilities, disposePreloadedFortressTextures, loadFortressTextures, facilityGameTuning } from './facility-presentation.ts';
import { GameAudio } from './game-audio.ts';
import { initializeMainline, mainlineCheckpoint } from '../sim/mainline.ts';
import { createBossEntity } from '../entities/boss.ts';
import { captureMainlineProgress, restoreMainlineProgress } from '../sim/mainline-progress.ts';
import { loadNpcAsset, disposeNpcAssets } from '../render/npc/npc-rig.ts';
import { createStoryHud } from '../ui/story-hud.ts';
import { saveStory } from './story-save.ts';
import type { StorySave } from './story-save.ts';
import { getLanguage, onLanguageChange } from '../ui/language.ts';
import { FACILITY_EN } from '../ui/facility-minimap.ts';
import { initializeFreeWorldNpcs } from '../sim/free-world-npcs.ts';
import { freeWorldRegions } from '../world/free-world-regions.ts';
import { freeWorldSearch, parseMainWorldParams, worldMapSearch } from './free-world-navigation.ts';
import { createFreeWorldToolbar } from '../ui/free-world-toolbar.ts';
import { createSceneToolbar } from '../ui/scene-toolbar.ts';
import { createSceneWeatherControls } from '../ui/scene-weather-controls.ts';
import { WILDS_WEATHER_PRESETS, precipWeatherMode, wildsWeatherPreset } from '../config/scene-weather.ts';
import { createNpcDialogue } from '../ui/npc-dialogue.ts';
import { initializeBossArena, summonArenaBoss } from '../sim/boss-arena.ts';
import { createBossArenaHud } from '../ui/boss-arena-hud.ts';
import { FREE_WORLD_SIZES } from '../config/free-world.ts';
import { initializeHomestead } from '../sim/homestead.ts';
import { clearHomesteadSave, loadHomesteadSave } from './homestead-save.ts';
import { createHomesteadApp } from './homestead-app.ts';
import { createSceneLoading } from './scene-loading.ts';
import { createHarborPresentation } from './harbor-presentation.ts';

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`main: missing #${id} element in index.html`);
  return node as T;
}

/** 主线定时存档间隔；阶段切换、页面隐藏与离开时另外立即保存。 */
const STORY_SAVE_SECONDS = 10;
const RETURN_FADE_SECONDS = 1.2;

let stopped = false;
let rafId = 0;
let cleanup: (() => void) | null = null;
let persistBeforeExit: (() => void) | null = null;
/** 启动加载画面；首帧出现后置空，之后的运行时错误走 #error。 */
let startupLoading: ReturnType<typeof createSceneLoading> | null = null;
export interface GameStartupPresentation {
  readonly params: URLSearchParams;
  progress(phase: string, completed?: number, total?: number): void;
  error(error: unknown): void;
  /** 全部玩法和界面就绪且已绘制后，等待外部过渡揭幕。 */
  ready(): Promise<void>;
}
let startupPresentation: GameStartupPresentation | null = null;

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
  // 启动失败留在加载画面上显示中断并提供“重新加载”。
  if (startupPresentation) startupPresentation.error(err);
  else if (startupLoading) startupLoading.error(err);
  else {
    const text = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err);
    const box = document.getElementById('error');
    const msg = document.getElementById('error-message');
    if (msg) msg.textContent = text;
    if (box) box.hidden = false;
  }
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

async function start(story: StorySave | undefined, newStory: boolean, onReady: (() => Promise<void>) | undefined,
  presentation: GameStartupPresentation | undefined): Promise<void> {
  performance.mark('game:startup-start');
  let storyDestination = story?.destination ?? 'fortress';
  validateTuning(TUNING);
  validateBindings(DEFAULT_BINDINGS);
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  const params = presentation?.params ?? (story ? new URLSearchParams(story.destination === 'fortress' ? 'level=facility&scene=fortress' : '') : new URLSearchParams(location.search));

  const app = requireElement<HTMLDivElement>('app');
  const hudRoot = requireElement<HTMLDivElement>('hud');
  const loading = requireElement<HTMLDivElement>('loading');
  // 有序章时由序章画面遮挡；否则用场景加载画面替换静态启动屏。
  if (onReady === undefined && presentation === undefined) {
    startupLoading = createSceneLoading(document.body, () => location.reload());
    startupLoading.show('鹈鹕 429', 'PELICAN 429', 4);
  }
  const progress = (phase: string, completed?: number, total?: number): void => {
    if (presentation) presentation.progress(phase, completed, total);
    else startupLoading?.progress(phase, completed, total);
  };
  progress('构建地形');
  loading.hidden = true;
  // 等两帧，让加载层或序章保留画面先绘制，再做同步构建。
  await nextFrame();
  await nextFrame();
  if (stopped) return;

  const { level, ground, compositions, chapter } = loadGameLevel(params);
  performance.mark('game:level-ready');
  const bossArena = params.get('level') === 'boss-arena';
  const harbor = params.get('level') === 'harbor';
  const freeWorld = story?.destination === 'free' || (!story && (params.get('level') === null || (params.get('level') === 'facility' && params.get('free') === '1')));
  // 家园概念版本建在主世界地形上，但不使用主世界的工具条和网址改写。
  const homesteadMode = !story && params.get('mode') === 'homestead';
  const mainWorld = parseMainWorldParams(params);
  const { seed, size } = mainWorld;
  const gm = freeWorld && mainWorld.gm;
  // parseBench 保证基准只在原野运行、不带其他定位参数。
  const benchScene = parseBench(params);
  const rendererParam = params.get('renderer');
  if (rendererParam !== null && rendererParam !== 'webgl' && rendererParam !== 'webgpu') throw new Error(`未知渲染器：${rendererParam}（支持 webgl、webgpu）`);
  if (rendererParam === 'webgpu' && benchScene !== null) throw new Error('基准依赖 WebGL 计时查询，不能与 renderer=webgpu 同时使用');
  let region = benchScene !== null ? benchRegion(benchScene) : freeWorld ? params.get('scene') ?? params.get('region') ?? 'wilds' : chapter ?? 'wilds';
  const regions = chapter === null && freeWorld ? freeWorldRegions(level, ground) : [];
  const destination = regions.find(item => item.id === region);
  if (freeWorld && chapter === null && !destination) throw new Error(`当前世界不存在区域：${region}`);
  const tuning = chapter === null ? TUNING : facilityGameTuning();
  const syncTitle = (): void => {
    const en = getLanguage() === 'en';
    document.title = story?.destination === 'fortress' ? en ? 'Chapter 1 · Mountain Fortress' : '主线 1 · 山体算力堡垒'
      : homesteadMode ? en ? 'Homestead concept · Pelican 429' : '家园概念版本 · 鹈鹕 429'
      : freeWorld ? en ? `Main world · ${FREE_WORLD_SIZES[size].labelEn} · Pelican 429` : `主世界 · ${FREE_WORLD_SIZES[size].label} · 鹈鹕 429`
      : chapter !== null ? en ? `${FACILITY_EN[chapter].name} · Free exploration` : `${FACILITY_SCENES[chapter].name} · 自由预览`
      : bossArena ? en ? 'Boss arena · Pelican 429' : 'Boss 场 · 鹈鹕 429'
      : harbor ? en ? 'Tidal city · Pelican 429' : '潮汐之城 · 鹈鹕 429'
      : en ? 'Test level · Pelican 429' : '测试关卡 · 鹈鹕 429';
  };
  const inspect = params.get('inspect');
  const inspected = inspect === null ? undefined : compositions.find((item) => String(item.x0) === inspect);
  if (inspect !== null && inspected === undefined) throw new Error(`当前世界不存在地形定位点：${inspect}`);
  // 保留地图原出生点；重载创建全新的角色状态，检查起点不触发渔屋开场取景。
  const startLevel = inspected === undefined ? level : { ...level, spawn: { x: inspected.x0 + 1.5, y: inspected.baseY }, spawnFacing: undefined };
  // 设置：网址参数（非法即抛）> localStorage 保存值（非法项清除并提示）> 调参默认（见 app/settings-wiring）。
  const startup = loadStartupSettings(params, freeWorld ? 'auto' : undefined);
  const appearance = createCharacterAppearanceStore(window.localStorage);
  // 机房预览采用场景环境，不继承沙盒的天气和训练假人设置。
  const sceneSettings = bossArena || harbor ? {
    ...startup.loaded.settings, wind: 'calm' as const, precip: 'manual' as const, rain: 'none' as const, snow: 'none' as const,
    tornado: false, tileGrid: false, mapTeleport: false, dummyShoot: false, minimapVisible: false,
  } : chapter === null ? startup.loaded.settings : {
    ...startup.loaded.settings, ...facilityWeather(chapter), tornado: false,
    tileGrid: false, mapTeleport: false, dummyShoot: false,
  };
  const initial = freeWorld ? { ...sceneSettings,
    mapTeleport: gm,
    tileGrid: gm && sceneSettings.tileGrid, dummyShoot: gm && sceneSettings.dummyShoot,
  } : sceneSettings;
  const world = createSimWorld({ level: startLevel, freeWorldWeather: freeWorld ? { level, ground } : undefined, playerForm: 'human', tuning: TUNING, weather: { ...TUNING.render.weather, direction: initial.windDirection === 'right' ? 1 : -1 }, windMode: initial.wind });
  if (harbor) world.entities.push(createFlyingRoadster(world.nextId++, { x: level.spawn.x + 5, y: level.spawn.y + .8 }, world.tuning));
  if (bossArena) initializeBossArena(world);
  if (freeWorld) {
    if (destination && region !== 'wilds') {
      const position = placePlayer(world, destination.position);
      if (position === null) throw new Error(`区域无法容纳玩家：${region}，种子 ${seed}`);
    }
    initializeFreeWorldNpcs(world, seed);
    if (homesteadMode) {
      if (params.get('reset') === '1') clearHomesteadSave(window.localStorage, seed);
      // 新游戏取真实日期与时刻开局，之后按游戏时间运转；读档沿用存档时间。
      const now = new Date();
      initializeHomestead(world, timeFromReal(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes()),
        loadHomesteadSave(window.localStorage, seed, level));
    }
  }
  if (story?.destination === 'fortress') {
    initializeMainline(world, story.checkpoint);
    if (story.progress !== undefined) restoreMainlineProgress(world, story.progress);
  }
  // 从交通中心抵达的关卡改由着陆舱开场；直接访问时舱已停在出生点旁。两种情况都能再登舱返回主世界，主线不提供。
  // landing=1 供着陆测试场直接重放同一开场。
  const landingValue = params.get('landing');
  if (landingValue !== null && (landingValue !== '1' || chapter === null)) throw new Error(`未知着陆开关：${landingValue}（仅机房关卡可用 landing=1）`);
  const podPlan = chapter !== null && !story ? landingPodPlan(FACILITY_CHAPTERS[chapter].spawn, LANDING_POD.altitude[chapter], matchMedia('(prefers-reduced-motion: reduce)').matches) : null;
  if (podPlan !== null && (presentation || landingValue === '1')) beginPodLanding(world, podPlan);
  else if (story?.destination === 'fortress'
    ? newStory
    : chapter === 'fortress' || freeWorld && region === 'fortress') beginBlackholeArrival(world);
  const pod = podPlan && (world.podLanding ?? parkedPod(podPlan, world.tuning.sim.step));
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
  const webgpu = rendererParam === 'webgpu' ? await import('./webgpu-stage.ts') : null;
  const stageOptions = { quality: initial.quality, antialias: initial.antialias };
  const stage: Stage<StageRenderer> = webgpu ? await webgpu.createWebGpuStage(app, tuning, stageOptions) : createStage(app, tuning, stageOptions);
  if (stopped) { stage.dispose(); return; }
  const disposers: Array<() => void> = [() => level.fluid.dispose(), () => stage.dispose()];
  cleanup = () => {
    for (const d of disposers.splice(0).reverse()) d();
  };
  disposers.push(disposeGrassyAssets);
  disposers.push(disposeEnemyAssets);
  if (harbor) disposers.push(disposeFlyingRoadsterAsset);
  disposers.push(disposePreloadedFortressTextures);
  if (world.mainline || freeWorld || bossArena) disposers.push(disposeNpcAssets);
  const models: Promise<unknown>[] = [loadGrassyAsset('game'), ...[...new Set(world.entities.flatMap((entity) => entity.enemy ? [entity.enemy.kind] : []))].map(kind => loadEnemyAsset(kind)),
    ...(freeWorld ? [loadNpcAsset('sam', 'human'), loadNpcAsset('tibo', 'human')] : world.mainline || bossArena ? [loadNpcAsset('tibo', 'monster'), loadNpcAsset('sam', 'monster')] : []),
    ...(world.mainline ? [loadNpcAsset('sam', 'human')] : []),
    ...(bossArena ? [loadNpcAsset('sam', 'human'), loadNpcAsset('tibo', 'human')] : []),
    ...(harbor ? [loadFlyingRoadsterAsset()] : [])];
  let modelsLoaded = 0;
  progress('加载角色', 0, models.length);
  const modelsReady = Promise.all(models.map(model => model.then(() => progress('加载角色', ++modelsLoaded, models.length))));
  const observedModels = Promise.allSettled([modelsReady]);
  const interiors = freeWorld ? await loadInteriorBackgroundTextures(stage.renderer) : null;
  if (stopped) { interiors?.dispose(); return; }
  if (interiors) disposers.push(() => interiors.dispose());
  const caveBackground = interiors?.cave ?? (level.caves.rooms.length > 0 ? await loadInteriorBackgroundTexture(stage.renderer, 'cave') : null);
  if (!interiors && caveBackground) {
    if (stopped) { caveBackground.dispose(); return; }
    disposers.push(() => caveBackground.dispose());
  }
  const background = freeWorld ? createFreeWorldBackground(stage, level, ground, async () => {
    const textures = await loadFortressTextures(stage.renderer, 'ktx2');
    return { sky: textures[0]!, farCity: textures[1]!, middleDistrict: textures[2]!, nearRooftops: textures[3]! };
  }, interiors!) : null;
  if (background) {
    disposers.push(() => background.dispose());
    await background.prepare(getPlayer(world).body.x, getPlayer(world).body.y);
    if (stopped) return;
  }
  // 单独机房的下载、转码与程序建模重叠；立即接住失败，等装配边界统一抛出。
  const assetsReady = Promise.allSettled([
    observedModels.then(([result]) => { if (result!.status === 'rejected') throw result.reason; }),
    // 程序机房同步构建较重，先让模型加载器的异步依赖真正发出请求。
    nextFrame().then(async () => {
      // 连通世界的三座机房与模型解码争用主线程，保留先加载模型的顺序。
      if (level.facilities) await modelsReady;
      if (stopped) return null;
      return level.facilities ? createFreeWorldFacilities(stage, level.facilities, interiors!)
        : harbor ? createHarborPresentation(stage, level)
        : chapter === null ? null : createFacilityPresentation(stage, chapter);
    }).then(facility => {
      if (facility !== null) {
        if (stopped) facility.dispose();
        else disposers.push(() => facility.dispose());
      }
      return facility;
    }),
  ]).then(results => {
    if (!stopped && results.every(result => result.status === 'fulfilled')) performance.mark('game:assets-ready');
    return results;
  });
  const settledAssets = level.facilities ? await assetsReady : null;
  if (stopped) return;
  if (settledAssets !== null) for (const result of settledAssets) {
    if (result.status === 'rejected') throw result.reason;
  }
  await nextFrame();
  if (stopped) return;
  // 远山按“厚实心”地表取均值（悬空平台不抬高）；021：有顶洞穴格（网络 + 入口有顶段）当实心，洞穴列地表仍是洞顶之上的真实地表，浮空岛与地面隔空气不算地表。
  if (chapter === null && !freeWorld && !harbor) stage.addBackdrop({ width: level.map.width, height: level.map.height, surface: ground });

  // 地形视图（瓦片/花草、树、水面、水草、渔屋、小鱼、花瓣；树在鹈鹕后方，根贴视觉地面轮廓）；相机就位后按可视范围首帧加载。
  // 风吹天气与水体色板取自设置（见上）。
  const waterPaletteName = initial.water;
  progress('装配环境');
  const worldViews = createWorldViews({ islandBackdrop: !freeWorld && !harbor, caveBackground, scene: stage.scene, level, fish: world.fish, ground, weather: world.env.wind.rules, wind: world.env.wind, tornadoes: () => world.env.tornadoes, cameraDistance: tuning.camera.distance, pelican: () => getPlayer(world).body, actors: () => world.entities, waterPalette: waterPaletteName, felledTrees: world.homestead?.felled,
    terrainTextureSize: new URLSearchParams(location.search).get('textures') === 'original' ? 512 : 256 });
  // 区域图片已包含远处云层，避免旧卡通云片覆盖真实背景；风与降水仍照常更新。
  if (freeWorld) worldViews.weather.fx.meshes.clouds.visible = false;
  if (chapter !== null || harbor) worldViews.weather.setEnabled(false);
  // 独立河岸的石材立面与平台由同一场景资源绘制，碰撞继续读取原瓦片。
  if (harbor) worldViews.tiles.root.visible = false;
  disposers.push(() => worldViews.dispose());
  await nextFrame();
  if (stopped) return;
  // 体积光束（树冠下/天空斜射）；画质 low 时关闭。
  const { shafts, setQuality } = installLightShafts(stage, level, ground, disposers);

  const rig = createPelicanRig({ scale: TUNING.render.pelicanScale });
  disposers.push(() => rig.dispose());
  await nextFrame();
  if (stopped) return;
  const [modelsResult, facilityResult] = settledAssets ?? await assetsReady;
  if (stopped) return;
  if (modelsResult.status === 'rejected') throw modelsResult.reason;
  if (facilityResult.status === 'rejected') throw facilityResult.reason;
  const facility = facilityResult.value;
  const entityViews = createEntityViews(stage, level, disposers, () => world.entities, worldViews.treeRide, world.env.wind, rig, undefined, undefined, appearance.current);
  const { views, orbs, orbFx, projectileFx } = entityViews;
  // 主线还没登场的 Boss 先建好（含技能字幕画布），随下方预热一起编译上传。
  const phase = world.mainline?.phase;
  const upcomingBosses = phase === 'perimeter' || phase === 'core' ? ['tibo', 'sam'] as const : phase === 'tibo' || phase === 'countdown' ? ['sam'] as const : [];
  const bossGroups = upcomingBosses.map(kind => entityViews.prebuildBoss(createBossEntity(0, kind, { x: 0, y: 0 }, TUNING)));
  const luma = createLumaCompanion(stage.scene, getPlayer(world));
  disposers.push(() => luma.dispose());
  // 瓦片光照图（洞内发光源、浮空岛天空光）与鹈鹕微光。
  const lighting = createWorldLighting(level, world, waterPaletteName, disposers, tuning.render.lighting);
  const { worldLight } = lighting;

  const canvas = stage.canvas;
  const cameraRig = createGameCamera(stage, startLevel, getPlayer(world), tuning, chapter === null ? undefined : 0);
  if (freeWorld && region !== 'wilds') {
    const player = getPlayer(world);
    cameraRig.snapTo(player.body.x, player.body.y, player.facing);
  }
  // 主世界原野与城区、其他场景共用同一条场景工具条，昼夜跟随它的世界时间；家园沿用自己的经济时钟。
  const sceneBar = freeWorld && !homesteadMode ? createSceneToolbar('主世界') : null;
  if (sceneBar !== null) disposers.push(sceneBar.dispose);
  const clock = world.homestead ? world.homestead.economy : sceneBar?.time;
  // 昼夜：日月星在预热前加入场景，随首帧一起编译上传。
  let daylight: FreeWorldDaylight | null = null;
  if (clock) {
    if (!background) throw new Error('game-app: free-world daylight requires the free-world background');
    daylight = createFreeWorldDaylight({ stage, background, shafts, clouds: worldViews.weather.fx, clock });
    disposers.push(daylight.dispose);
  }
  // 022 降水视图（雨雪粒子/天色/湿润积雪）：与世界视图同帧同节奏更新。
  const env = createEnvironmentViews(stage, level, world, worldViews, cameraRig, disposers, background, daylight);
  env.update(0, 0, 0);
  shafts.update(cameraRig.visibleRect(2), 0);
  const lander = pod ? createLandingPod(stage, pod, {
    landing: () => world.podLanding, takeoff: () => world.podTakeoff !== null,
    body: () => getPlayer(world).body, step: world.tuning.sim.step, planeZ: 0, cameraDistance: tuning.camera.distance,
    carry(pose) {
      // The view's outer group rotates about the world origin, so it shifts back by the rotated body x to pivot about the body.
      const player = views.get(world.playerId)!.object;
      if (pose === null) { player.position.set(0, 0, 0); player.rotation.y = 0; return; }
      player.rotation.y = pose.yaw;
      player.position.set(pose.x * (1 - Math.cos(pose.yaw)), pose.lift, pose.z + pose.x * Math.sin(pose.yaw));
    },
  }) : null;
  if (lander !== null) disposers.push(() => lander.dispose());
  // 返程穿梭层趁加载时隐藏着建好：新建渲染器会卡一两秒，留到飞走那一刻会把急加速冻住。
  const corridor = pod ? createReturnCorridorOverlay(document.body, false) : null;
  if (corridor !== null) disposers.push(() => corridor.hide(0));

  // 首帧同步一次再撤掉加载层，避免闪出空场景。
  performance.mark('game:scene-ready');
  views.sync(world.entities, 0, 0);
  lander?.update(0, 0, 0);
  orbs.update(world.entities, 0);
  worldLight.update(stage.scene, 0);
  // 已有 Boss 在场时它的点光源已计入，后登场者的材质按同样的灯光数编译，无需再单独显示。
  const lightGroups = [...facility?.root.children.filter(child => !child.visible) ?? [], ...(world.mainline?.bossId === null ? bossGroups : [])];
  progress('准备场景画面');
  await warmUpStage(stage, lightGroups);
  if (stopped) return;
  if (webgpu) webgpu.reportMaterialInventory(stage);
  stage.render();
  performance.mark('game:first-frame');
  performance.measure('game:startup', 'game:startup-start', 'game:first-frame');
  startupLoading?.hide();
  startupLoading = null;
  await onReady?.();
  if (stopped) return;

  // 序章放行后才装配交互、音频与存档，预热期间只保留静态场景。
  syncTitle();
  disposers.push(onLanguageChange(syncTitle));
  if (!freeWorld && compositions.length > 0) {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(level.seed));
    disposers.push(createWorldCompositionNavigation(requireElement('dev-navigation'), compositions, inspected, url));
  }

  const project = createProjector(stage.camera, canvas, disposers);
  const tracker = createActionTracker();
  const storyHud = world.mainline ? createStoryHud(document.body, world, {
    onChoose: (destination) => {
      try {
        saveStory(window.localStorage, mainlineCheckpoint(world), destination, destination === 'fortress' ? captureMainlineProgress(world) : undefined);
        storyDestination = destination;
        if (destination === 'free') gameHost().location.assign(`${location.pathname}?mode=story`);
        return true;
      } catch (error) { showError(error); return false; }
    },
    onOpen: () => tracker.releaseAll(),
    onClose: () => { tracker.releaseAll(); canvas.focus(); },
  }) : null;
  const chapterHud = storyHud ?? (chapter === null ? null : createFacilityChapterHud(document.body, chapter, project));
  if (chapterHud !== null) disposers.push(() => chapterHud.dispose());
  // 光球冷却条并入武器面板（任务 018）：hud 不再单独显示。
  const hud = createHud(hudRoot, project);
  hud.toggleHints();
  disposers.push(() => hud.dispose());
  const navigation = requireElement<HTMLDetailsElement>('game-navigation');
  const releaseInput = (): void => { tracker.releaseAll(); weaponHud.resetInput(); };
  navigation.addEventListener('focusin', releaseInput);
  disposers.push(() => navigation.removeEventListener('focusin', releaseInput));
  const weaponHud = createWeaponHud(hudRoot, { weapons: TUNING.weapons, project, onTransform: () => {
    tracker.press('transform', 'mouse', 'character-switch');
    tracker.release('transform', 'character-switch');
    canvas.focus();
  }, onSkill: (action) => {
    tracker.press(action, 'keyboard', 'skill-button');
    tracker.release(action, 'skill-button');
    canvas.focus();
  } });
  disposers.push(() => weaponHud.dispose());
  const resetSkillInput = (): void => weaponHud.resetInput();
  const hideSkillInput = (): void => { if (document.hidden) resetSkillInput(); };
  window.addEventListener('blur', resetSkillInput);
  document.addEventListener('visibilitychange', hideSkillInput);
  disposers.push(() => {
    window.removeEventListener('blur', resetSkillInput);
    document.removeEventListener('visibilitychange', hideSkillInput);
  });
  const controls = createControlSurface(document.body, {
    canvas,
    onZoom: zoom => cameraRig.setZoom(zoom),
    navigation,
    onPress: (action, bindingKey) => tracker.press(action, 'mouse', bindingKey),
    onRelease: (action, bindingKey) => tracker.release(action, bindingKey),
    onReset: () => { tracker.releaseAll(); weaponHud.resetInput(); },
    onFocusGame: () => canvas.focus(),
    forceMobile: params.get('mode') === 'controls',
    onModeChange: mode => setMobileBossDifficulty(world, mode === 'mobile'),
  });
  disposers.push(() => controls.dispose());
  const audio = freeWorld || bossArena || chapter === 'fortress'
    ? new GameAudio(world, document.querySelector<HTMLElement>('.control-tools')!, freeWorld || bossArena ? 'world' : 'fortress') : null;
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
  let travelRequest = 0;
  disposers.push(() => { travelRequest++; });
  const minimap = createMinimap({
    parent: document.body,
    facilityChapter: chapter ?? undefined,
    source: { tiles: level.map, fluid: world.fluid, trees: level.trees, structures: level.structures, deserts: level.deserts, islands: level.islands },
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    keyTarget: window,
    pixelRatio: () => Math.min(2, window.devicePixelRatio || 1),
    onTeleport: (target) => {
      if (background) {
        const request = ++travelRequest;
        void background.prepare(target.x, target.y).then(() => {
          if (stopped || request !== travelRequest) return;
          if (teleportPlayer(world, target) !== null) { tracker.releaseAll(); canvas.focus(); }
        }).catch(showError);
        return true;
      }
      const position = teleportPlayer(world, target);
      if (position === null) return false;
      tracker.releaseAll();
      canvas.focus();
      return true;
    },
  });
  minimap.setTeleportEnabled(initial.mapTeleport);
  minimap.setVisible(initial.minimapVisible);
  minimap.setOpacity(initial.minimapOpacity);
  disposers.push(() => minimap.dispose());

  const stepper = createFixedStepper(TUNING.sim);
  const debug = freeWorld ? gm : params.has('debug') && chapter === null;
  const pour = installDebugKeys(debug, canvas, world, worldViews, disposers);
  // 训练假人射击模式（?dummyShoot / 设置面板）：开局即进入（吞弹反吐演示）。
  if (initial.dummyShoot) setDummyShooting(world, true);
  // 性能面板：Cmd+Option+Z / Ctrl+Alt+Z 切换，调试模式也可按 P；只在面板可见时计时。
  // 基准结束时 snapshot 的窗口正好覆盖全部采样帧。
  const prof = createFrameProfiler(['sim', 'views', 'world', 'light', 'render', 'ui'], { windowSize: benchScene === null ? undefined : BENCH_SAMPLES, now: () => performance.now() });
  const gpu = createGpuTimer(stage.renderer);
  stage.postFx.setGpuTimer(gpu);
  disposers.push(() => { stage.postFx.setGpuTimer(null); gpu.dispose(); });
  const perfPanel = createPerfPanel(document.body, window, debug, import.meta.env.VITE_APP_VERSION);
  disposers.push(() => perfPanel.dispose());
  perfPanel.setVisible(initial.perfPanel);
  const tileGrid = createTileGrid(stage.scene, level.map.width, level.map.height);
  tileGrid.setVisible(initial.tileGrid);
  disposers.push(() => tileGrid.dispose());

  // 设置面板（Esc / O 或右上角齿轮）：打开时暂停模拟（渲染继续），各项切换即时生效。
  let characterEditor: ReturnType<typeof openSavedCharacterEditor> | null = null;
  const { runtime, settings, settingsPanel } = createSettingsWiring({ startup, stage, world, worldViews, worldLight, perfPanel, tileGrid, minimap, hud, tracker, setQuality, seed: freeWorld ? seed : level.seed, disposers, chapter: chapter !== null, gm: freeWorld ? gm : chapter === null && !bossArena,
    onCharacter: () => {
      tracker.releaseAll();
      characterEditor = openSavedCharacterEditor(appearance, () => { characterEditor = null; tracker.releaseAll(); });
    },
  });
  disposers.push(() => characterEditor?.dispose());
  let pendingTravel: { id: string; teleport: TeleportState } | null = null;
  let travelToolbar: ReturnType<typeof createFreeWorldToolbar> | null = null;
  if (freeWorld && !homesteadMode) {
    const rebuild = (nextSeed: number, nextGm: boolean, nextRegion: string, nextSize = size): void => {
      tracker.releaseAll();
      gameHost().location.assign(`${location.pathname}${freeWorldSearch(location.search, nextSeed, nextGm, nextRegion, nextSize)}`);
    };
    // 基准网址保持原样，刷新即可重跑同一场景。
    if (benchScene === null) replaceGameLocation(`${location.pathname}${freeWorldSearch(location.search, seed, gm, region, size)}`);
    // 城区一侧只用于工具条跳转，网址 region 参数仍只接受原野区域；主线原野不列出，避免跳出主线。
    const citySide = story ? [] : [{ id: 'city', label: '城区', labelEn: 'City' }, { id: 'transit', label: '星舰交通中心', labelEn: 'Starship transit' }] as const;
    const build = document.createElement('button');
    build.type = 'button';
    build.disabled = true;
    const mapButton = document.createElement('button');
    mapButton.type = 'button';
    mapButton.addEventListener('click', () => minimap.toggleBigMap());
    const syncExtra = (): void => {
      const en = getLanguage() === 'en';
      build.textContent = en ? 'Build' : '建造';
      build.title = en ? 'Building is only available in the city' : '只能在城区建造';
      mapButton.textContent = en ? 'Map M' : '地图 M';
      mapButton.title = en ? 'M opens or closes the map' : 'M 打开或关闭地图';
    };
    syncExtra();
    disposers.push(onLanguageChange(syncExtra));
    // 原野没有场景宿主，工具条叠在站点导航下方，随导航抽屉一起收起。
    const page = document.createElement('div');
    page.className = 'scene-page';
    const bar = document.createElement('header');
    bar.className = 'scene-toolbar-overlay';
    page.append(bar);
    document.body.append(page);
    disposers.push(() => page.remove());
    sceneBar!.attach(bar);
    bar.append(build, mapButton);
    // 原野天气保存在游戏设置里，与设置面板同一份。
    const weatherControls = createSceneWeatherControls(sceneBar!.settings, {
      presets: WILDS_WEATHER_PRESETS,
      get weather() { return wildsWeatherPreset(settings.current()); },
      get weatherConfig() { return settings.current(); },
      set(patch) { for (const key of Object.keys(patch) as (keyof typeof patch)[]) settings.set(key, patch[key]!); },
    });
    disposers.push(weatherControls.dispose);
    const toolbar = travelToolbar = createFreeWorldToolbar(bar, {
      seed, gm, gmHint: 'reload', region, size, regions: [...citySide, ...regions],
      onSeed: (next, nextSize) => rebuild(next, gm, 'wilds', nextSize),
      onGm: enabled => rebuild(seed, enabled, region),
      onRegion: id => {
        if (id === 'city' || id === 'transit') {
          tracker.releaseAll();
          gameHost().location.assign(`${location.pathname}${worldMapSearch(location.search, id)}`);
          return true;
        }
        const target = regions.find(item => item.id === id)!;
        const request = ++travelRequest;
        void background!.prepare(target.position.x, target.position.y).then(() => {
          if (stopped || request !== travelRequest) return;
          const position = teleportPlayer(world, target.position);
          if (position === null) { toolbar.setRegion(region); return; }
          tracker.releaseAll();
          cameraRig.skipIntro();
          pendingTravel = { id, teleport: getPlayer(world).teleport! };
          canvas.focus();
        }).catch(showError);
        return true;
      },
      onSettings: () => settings.setOpen(true),
      onFocus: () => tracker.releaseAll(),
      onFocusGame: () => canvas.focus(),
    });
    disposers.push(() => toolbar.dispose());
  }
  progress('连接随行助手');
  const droneFleet = createUtilityDroneFleet(stage.scene, stage.createPmrem());
  if (stopped) { droneFleet.dispose(); return; }
  disposers.push(() => droneFleet.dispose());
  const droneBodies = createFollowDroneBodies(world);
  const gameHud = createGameHud(hudRoot, {
    updateDrone: (index, x, y, dt, talking, flying, groundAngle, groundHeight, escortDepth) => {
      droneFleet.updateFollower(index, x, y, dt, talking, flying, groundAngle, groundHeight, escortDepth);
      droneBodies.place(index, x, y, dt, escortDepth === undefined);
    },
    droneEscort: lander?.droneEscort,
    groundAt: (x, y) => terrainHeightAt(world.map, x, y + 0.3, 2.8, true) ?? terrainHeightAt(world.map, x, y + 2.5, 2.2, true),
    droneBlocked: droneBodies.blocked,
    workOrders: world.homestead ? { state: world.homestead, command: tool => homestead!.command(tool) } : undefined,
    canvas, project, world: clock ? { time: clock, get weather() { return precipWeatherMode(world.env.precip); } } : undefined, tabOpensDrone: !world.homestead,
    blocked: () => settings.open || minimap.bigMapOpen || world.respawnTicks > 0,
  });
  gameHud.attachMap(minimap.element);
  disposers.push(() => gameHud.dispose());
  const bench = benchScene === null ? null : createBench({ scene: benchScene, seed, size, region, origin: destination!.position, world, level, ground, tracker, stage,
    projectileFx, gpu, prof, settings: () => settings.current(), time: sceneBar!.time });
  const loop = createFrameLoop({ world, level, stage, cameraRig, tracker, controls, input, stepper, pour, entityViews, luma, worldViews, env, shafts, lighting, hud, weaponHud, gameHud, minimap, settings, settingsPanel, perfPanel, prof, gpu, bench,
    resolution: bench === null ? createResolutionGovernor(TUNING.render.lighting.dynamicResolution, stage.renderer.getPixelRatio()) : null, facility, lander, chapterHud, audio });
  const arenaHud = bossArena ? createBossArenaHud(document.body, world, kind => {
    tracker.releaseAll();
    summonArenaBoss(world, kind);
    const player = getPlayer(world);
    cameraRig.snapTo(player.body.x, player.body.y, player.facing);
    arenaHud!.update();
    canvas.focus();
  }) : null;
  if (arenaHud !== null) disposers.push(() => arenaHud.dispose());
  const npcDialogue = freeWorld || bossArena || world.mainline ? createNpcDialogue(document.body, world, project, {
    blocked: () => settings.open || storyHud?.open === true,
    onOpen: () => tracker.releaseAll(),
    onClose: () => { tracker.releaseAll(); canvas.focus(); },
  }) : null;
  if (npcDialogue !== null) disposers.push(() => npcDialogue.dispose());
  const podPrompt = pod ? createPodReturnPrompt(document.body, project, {
    door: () => world.podLanding === null && world.podBoarding === null && world.podTakeoff === null && canBoardPod(pod, getPlayer(world).body)
      ? { x: pod.x - (TRANSIT.rocketX - TRANSIT_HATCH.x), y: pod.ground + 4.6 } : null,
    blocked: () => settings.open || minimap.bigMapOpen || world.respawnTicks > 0,
    onOpen: () => tracker.releaseAll(),
    onClose: () => { tracker.releaseAll(); canvas.focus(); },
    onConfirm: () => beginPodTakeoff(world, pod),
  }) : null;
  if (podPrompt !== null) disposers.push(() => podPrompt.dispose());
  const removeTree = (id: number): void => {
    worldViews.trees.removeTree(id);
    worldLight.removeTree(id);
    minimap.raster.removeTree(id);
    shafts.removeTree(id);
  };
  const homestead = world.homestead ? createHomesteadApp({ world, stage, droneFleet, removeTree, cameraRig, tracker, canvas, seed, disposers }) : null;

  let savedCheckpoint = world.mainline ? mainlineCheckpoint(world) : null;
  let savedTick = world.tick;
  const persist = (): void => {
    homestead?.persist();
    if (!world.mainline) return;
    const checkpoint = mainlineCheckpoint(world);
    saveStory(window.localStorage, checkpoint, storyDestination, storyDestination === 'fortress' ? captureMainlineProgress(world) : undefined);
    savedCheckpoint = checkpoint;
    savedTick = world.tick;
  };
  const saveOnLeave = (): void => {
    try { persist(); } catch (error) { showError(error); }
  };
  const visibility = (): void => { tracker.releaseAll(); loop.resetClock(performance.now()); saveOnLeave(); };
  persistBeforeExit = persist;
  document.addEventListener('visibilitychange', visibility);
  disposers.push(() => { persistBeforeExit = null; document.removeEventListener('visibilitychange', visibility); });

  let lastFrame = performance.now(), leavingWilds = false, returning = false;
  const frame = (now: number): void => {
    if (stopped) return;
    try {
      const frameDt = Math.min(Math.max(0, (now - lastFrame) / 1000), TUNING.sim.maxFrameTime);
      lastFrame = now;
      if (document.hidden || storyHud?.open || npcDialogue?.open || podPrompt?.open || homestead?.open) {
        tracker.releaseAll();
        audio?.update(world, true);
        loop.resetClock(now);
        homestead?.update(0);
        rafId = requestAnimationFrame(frame);
        return;
      }
      loop.frame(now);
      // 基准下世界时钟也按帧号推进：昼夜与自动天气不随帧率漂移。
      sceneBar?.advance(benchScene === null ? frameDt : TUNING.sim.step);
      homestead?.update(frameDt);
      if (pendingTravel !== null && (pendingTravel.teleport.moved || getPlayer(world).teleport !== pendingTravel.teleport)) {
        if (pendingTravel.teleport.moved) {
          region = pendingTravel.id;
          replaceGameLocation(`${location.pathname}${freeWorldSearch(location.search, seed, gm, region, size)}`);
        }
        travelToolbar!.setRegion(region);
        pendingTravel = null;
      }
      npcDialogue?.update();
      podPrompt?.update();
      // 着陆舱升到下降起始高度后急加速飞走即离开关卡，城区沿用同一份种子、规模与 GM，再由着陆舱降落在交通中心旁。
      if (corridor !== null && !returning && lander!.launched()) {
        returning = true;
        tracker.releaseAll();
        const city = new URLSearchParams({ mode: 'game', landing: '1' });
        for (const key of ['seed', 'size', 'gm']) {
          const value = params.get(key);
          if (value !== null) city.set(key, value);
        }
        // 舱急加速冲出画面时淡入温和版穿梭画面再跳转，城区页以同一画面开场，加载完成后揭幕。
        corridor.show(RETURN_FADE_SECONDS);
        gameHost().document.body.style.background = RETURN_CORRIDOR_BASE;
        window.setTimeout(() => gameHost().location.assign(`${location.pathname}?${city}`), RETURN_FADE_SECONDS * 1000);
      }
      // The wilds open onto the city at their left wall; spawn sits a few tiles in, so only a deliberate walk out returns.
      const traveller = getPlayer(world).body;
      if (freeWorld && !story && !homesteadMode && !leavingWilds && traveller.x - traveller.halfWidth < .05) {
        leavingWilds = true;
        tracker.releaseAll();
        gameHost().location.assign(`${location.pathname}${worldMapSearch(location.search, 'city')}`);
      }
      arenaHud?.update();
      if (world.mainline && (savedCheckpoint!.phase !== world.mainline.phase || world.tick - savedTick >= STORY_SAVE_SECONDS / TUNING.sim.step)) persist();
      rafId = requestAnimationFrame(frame);
    } catch (err) {
      showError(err);
    }
  };

  if (debug) exposeDebug({ world, stage, views, cameraRig, tracker, stepper, level, worldViews, orbs, orbFx, projectileFx, weaponHud, shafts, worldLight, setQuality, setAntialias: runtime.setAntialias, settings, minimap, precip: env.precipView });

  tracker.releaseAll();
  if (presentation) {
    progress('准备抵达');
    const now = performance.now();
    loop.resetClock(now);
    loop.frame(now);
    await presentation.ready();
    if (stopped) return;
    startupPresentation = null;
    tracker.releaseAll();
    lastFrame = performance.now();
  }
  if (!storyHud?.open) canvas.focus();
  loop.resetClock(performance.now());
  rafId = requestAnimationFrame(frame);
}

export async function startGame(story?: StorySave, newStory = false, onReady?: () => Promise<void>,
  presentation?: GameStartupPresentation): Promise<void> {
  startupPresentation = presentation ?? null;
  window.addEventListener('pagehide', () => {
    try { persistBeforeExit?.(); } catch (error) { showError(error); return; }
    stopped = true;
    cancelAnimationFrame(rafId);
    cleanup?.();
    cleanup = null;
  }, { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  window.addEventListener('error', (e) => showError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => showError(e.reason));
  try { await start(story, newStory, onReady, presentation); }
  catch (error) { showError(error); throw error; }
}
