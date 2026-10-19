import { t } from '../../config/i18n.ts';
import { TUNING } from '../../config/tuning.ts';
import type { TeleportState } from '../../entities/teleport.ts';
import { createFreeWorldBackground } from '../../render/sky/free-world-background.ts';
import { createFreeWorldDaylight } from '../../render/sky/free-world-daylight.ts';
import { loadInteriorBackgroundTextures } from '../../render/stage/free-world-interior-textures.ts';
import { createWorldViews } from '../../render/stage/world-views.ts';
import { placePlayer, teleportPlayer } from '../../sim/player-teleport.ts';
import { createSimWorld, getPlayer } from '../../sim/sim-world.ts';
import { createFreeWorldToolbar } from '../../ui/panels/free-world-toolbar.tsx';
import { replaceGameLocation } from '../../ui/hud/mobile-game-viewport.ts';
import { freeWorldRegions } from '../../world/free-world-regions.ts';
import { installDebugKeys } from '../game/debug-tools.ts';
import { createFreeWorldFacilities, loadFortressTextures } from '../facility/facility-presentation.ts';
import { freeWorldSearch, parseMainWorldParams, worldMapSearch } from '../game/free-world-navigation.ts';
import { loadGameLevel } from '../game/game-level.ts';
import { installLightShafts } from '../game/lighting-wiring.ts';
import { createEnvironmentViews } from '../game/precip-wiring.ts';
import { createSceneDemoStage } from './scene-demo-stage.ts';
import { waitSceneResource, type SceneMountContext } from './scene-mount.ts';
import { createGameCamera } from '../game/game-wiring.ts';
import { loadTileActors, playTileScene } from './tile-scene.ts';
import { readPageParams } from '../shell/page-context.ts';

/**
 * 主世界原野的场景版：与游戏页同一份网址世界（种子、规模、GM、区域）、背景、机房与区域天气，昼夜跟随工作区时间。
 * 不含 NPC、对话、家园、设置面板与音频。
 */
export async function mountWildsScene(context: SceneMountContext): Promise<void> {
  const params = new URLSearchParams(location.search);
  const { level, ground } = loadGameLevel(params);
  context.onDispose(() => level.fluid.dispose());
  const { seed, size, gm } = parseMainWorldParams(params);
  let region = params.get('scene') ?? params.get('region') ?? 'wilds';
  const regions = freeWorldRegions(level, ground);
  const destination = regions.find(item => item.id === region);
  if (!destination) throw new Error(`当前世界不存在区域：${region}`);
  replaceGameLocation(`${location.pathname}${freeWorldSearch(location.search, seed, gm, region, size)}`);
  const settings = context.world.weatherConfig;
  const world = createSimWorld({ level, freeWorldWeather: { level, ground }, playerForm: 'human', tuning: TUNING,
    weather: { ...TUNING.render.weather, direction: settings.windDirection === 'right' ? 1 : -1 }, windMode: settings.wind });
  if (region !== 'wilds' && placePlayer(world, destination.position) === null) throw new Error(`区域无法容纳玩家：${region}，种子 ${seed}`);
  const demoStage = createSceneDemoStage(context, TUNING);
  const { page, stage } = demoStage;
  const disposers: Array<() => void> = [];
  context.onDispose(() => { for (const dispose of disposers.reverse()) dispose(); });
  await loadTileActors(context, world, t('加载主角与原野角色'));
  context.progress(t('装配原野背景与机房'));
  const interiors = await waitSceneResource(loadInteriorBackgroundTextures(stage.renderer).then(textures => {
    if (context.signal.aborted) textures.dispose();
    else disposers.push(() => textures.dispose());
    return textures;
  }), context.signal);
  const background = createFreeWorldBackground(stage, level, ground, async () => {
    const textures = await loadFortressTextures(stage.renderer, 'ktx2');
    return { sky: textures[0]!, farCity: textures[1]!, middleDistrict: textures[2]!, nearRooftops: textures[3]! };
  }, interiors);
  disposers.push(() => background.dispose());
  await waitSceneResource(background.prepare(getPlayer(world).body.x, getPlayer(world).body.y), context.signal);
  const facility = await waitSceneResource(createFreeWorldFacilities(stage, level.facilities!, interiors).then(instance => {
    if (context.signal.aborted) instance.dispose();
    else disposers.push(() => instance.dispose());
    return instance;
  }), context.signal);
  const worldViews = createWorldViews({ islandBackdrop: false, caveBackground: interiors.cave, scene: stage.scene, level, fish: world.fish, ground,
    weather: world.env.wind.rules, wind: world.env.wind, tornadoes: () => world.env.tornadoes, cameraDistance: TUNING.camera.distance,
    pelican: () => getPlayer(world).body, actors: () => world.entities,
    terrainTextureSize: readPageParams().textures === 'original' ? 512 : 256 });
  disposers.push(() => worldViews.dispose());
  // 区域图片已包含远处云层，旧卡通云片会盖住真实背景。
  worldViews.weather.fx.meshes.clouds.visible = false;
  const { shafts } = installLightShafts(stage, level, ground, disposers);
  const daylight = createFreeWorldDaylight({ stage, background, shafts, clouds: worldViews.weather.fx, clock: context.world.time });
  disposers.push(daylight.dispose);
  let currentView = { x: 0, y: 0, w: 0, h: 0 };
  const env = createEnvironmentViews(stage, level, world, worldViews, { visibleRect: () => currentView }, disposers, background, daylight);
  const camera = createGameCamera(stage, level, getPlayer(world), TUNING);
  let travelRequest = 0;
  disposers.push(() => { travelRequest++; });
  // 同侧定位要先备好目的地背景；跨到城区或交通中心切到城区条目。
  const travel = (target: { x: number; y: number }, done: () => void): void => {
    const request = ++travelRequest;
    void background.prepare(target.x, target.y).then(() => {
      if (context.signal.aborted || request !== travelRequest) return;
      done();
    }).catch(context.reportError);
  };
  let pendingTravel: { id: string; teleport: TeleportState } | null = null;
  let toolbar: ReturnType<typeof createFreeWorldToolbar> | null = null;
  let leaving = false;
  // 切换条目会释放本场景的输入绑定。
  const open = (search: string): void => context.open(`${location.pathname}${search}`);
  // 与游戏页原野 GM 同一套调试键；V 与降水键改的天气每帧会被工作区天气控件覆盖。
  const pour = installDebugKeys(gm, stage.canvas, world, worldViews, disposers);
  const scene = await playTileScene(context, demoStage, {
    level, world, worldViews, camera, tuning: TUNING, minimapChapter: undefined, pod: null, facility, pour,
    teleport: gm ? target => {
      travel(target, () => { if (teleportPlayer(world, target) !== null) stage.canvas.focus({ preventScroll: true }); });
      return true;
    } : null,
    update(time, dt, alpha, view) {
      currentView = view;
      env.update(time, dt, alpha);
      shafts.update(view, time);
    },
    frame() {
      if (pendingTravel !== null && (pendingTravel.teleport.moved || getPlayer(world).teleport !== pendingTravel.teleport)) {
        if (pendingTravel.teleport.moved) {
          region = pendingTravel.id;
          replaceGameLocation(`${location.pathname}${freeWorldSearch(location.search, seed, gm, region, size)}`);
        }
        toolbar!.setRegion(region);
        pendingTravel = null;
      }
      // 原野左端连着城区；出生点在几格之内，只有特意走出去才回城。
      const body = getPlayer(world).body;
      if (!leaving && body.x - body.halfWidth < .05) {
        leaving = true;
        open(worldMapSearch(location.search, 'city'));
      }
    },
  });
  toolbar = createFreeWorldToolbar(page.querySelector<HTMLElement>('.room-preview-toolbar')!, {
    seed, gm, gmHint: 'reload', region, size,
    regions: [{ id: 'city', label: '城区', labelEn: 'City' }, { id: 'transit', label: '星舰交通中心', labelEn: 'Starship transit' }, ...regions],
    onSeed: (next, nextSize) => open(freeWorldSearch(location.search, next, gm, 'wilds', nextSize)),
    onGm: enabled => open(freeWorldSearch(location.search, seed, enabled, region, size)),
    onRegion: id => {
      if (id === 'city' || id === 'transit') { open(worldMapSearch(location.search, id)); return true; }
      const target = regions.find(item => item.id === id)!;
      travel(target.position, () => {
        if (teleportPlayer(world, target.position) === null) { toolbar!.setRegion(region); return; }
        scene.releaseInput();
        camera.skipIntro();
        pendingTravel = { id, teleport: getPlayer(world).teleport! };
        stage.canvas.focus({ preventScroll: true });
      });
      return true;
    },
    onSettings: null,
    onFocus: () => scene.releaseInput(),
    onFocusGame: () => stage.canvas.focus({ preventScroll: true }),
  });
  context.onDispose(() => toolbar!.dispose());
}
