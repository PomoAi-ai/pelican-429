import { FACILITY_CHAPTERS, FACILITY_SCENES, type FacilitySceneId } from '../config/facility-scenes.ts';
import { DEFAULT_PRECIP } from '../config/precip-rules.ts';
import { LANDING_POD, landingPodPlan } from '../config/transit.ts';
import { TUNING } from '../config/tuning.ts';
import { sampleWorldTime } from '../core/calendar.ts';
import { tileDefinitionCollision } from '../physics/tile-definition-collision.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createCameraRig } from '../render/camera-rig.ts';
import { computePrecipColumn } from '../render/precip-columns.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { levelGroundColumns } from '../render/surface-decor-view.ts';
import { createWorldViews } from '../render/world-views.ts';
import { parkedPod } from '../sim/pod-landing.ts';
import { beginPodLanding, createSimWorld, getPlayer } from '../sim/sim-world.ts';
import { replaceGameLocation } from '../ui/mobile-game-viewport.ts';
import { createFacilityLevel } from '../world/facility-level.ts';
import { createFacilityPresentation, facilityGameTuning } from './facility-presentation.ts';
import { createSceneDemoStage } from './scene-demo-stage.ts';
import { waitSceneResource, yieldScene, type SceneMountContext } from './scene-mount.ts';
import { loadTileActors, playTileScene } from './tile-scene.ts';

/** 四个机房复用正式关卡、模拟世界、实体视图与机房镜头；三个章节与游戏页同一出生点，停着可返回主世界的着陆舱。 */
export async function mountFacilityDemo(context: SceneMountContext, sceneId: FacilitySceneId): Promise<void> {
  const tuning = facilityGameTuning();
  const demoStage = createSceneDemoStage(context, tuning);
  const { page, stage } = demoStage;
  const chapter = sceneId === 'original' ? null : sceneId;
  // 网址边界：landing=1 由星舰发射或着陆测试场带来，读完即删，刷新或再次进入时不重放。
  const params = new URLSearchParams(location.search);
  const landing = params.get('landing');
  if (landing !== null && (landing !== '1' || chapter === null)) throw new Error(`未知着陆开关：${landing}（仅机房关卡可用 landing=1）`);
  if (landing !== null) {
    params.delete('landing');
    replaceGameLocation(`${location.pathname}?${params}`);
  }
  const level = chapter === null ? createFacilityLevel(sceneId) : { ...createFacilityLevel(chapter), spawn: FACILITY_CHAPTERS[chapter].spawn };
  context.onDispose(() => level.fluid.dispose());
  const world = createSimWorld({ level, tuning: TUNING, playerForm: 'human', windMode: 'breeze',
    precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const podPlan = chapter === null ? null
    : landingPodPlan(FACILITY_CHAPTERS[chapter].spawn, LANDING_POD.altitude[chapter], matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (podPlan !== null && landing === '1') beginPodLanding(world, podPlan);
  const pod = podPlan && (world.podLanding ?? parkedPod(podPlan, world.tuning.sim.step));
  await loadTileActors(context, world, '加载主角与机房角色');
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
  page.querySelector('[data-sample-label]')!.textContent = FACILITY_SCENES[sceneId].name;
  await playTileScene(context, demoStage, {
    level, world, worldViews: views, camera, tuning, minimapChapter: chapter ?? undefined, pod, teleport: null, facility,
    update(time, dt, alpha, view) {
      views.update(view, time, dt, alpha);
      const worldTime = sampleWorldTime(context.world.time);
      weather.setWeather(context.world.weather);
      weather.setSettings(context.world.weatherConfig);
      const atmosphere = weather.update(time, dt, worldTime, world.env);
      sky.setWorldTime(worldTime, atmosphere); sky.update();
    },
  });
}
