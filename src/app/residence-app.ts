import { createUtilityDroneFleet } from '../render/utility-drone.ts';
import { createResourcePicker } from '../ui/resource-picker.ts';
import { createResourceThumbnailRenderer } from '../render/resource-thumbnail.ts';
import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import { sampleWorldTime } from '../core/calendar.ts';
import { solarTrackingAngle } from '../physics/solar-panel.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AI_CITY_HARBOR_LOOK, AI_CITY_LAYERS, AI_CITY_RESIDENCE_LOOK, BUILDING_SCENE_TUNING } from '../config/ai-city-look.ts';
import { resolveQuality } from '../config/lighting-rules.ts';
import { getResidenceResource, RESIDENCE_RESOURCES, RESIDENCE_SEGMENT_WIDTH, RESIDENCE_SEGMENTS, RESIDENCE_TRANSIT, RESIDENCE_WORLD, type ResidenceVariant } from '../config/residence.ts';
import { landingPodPlan, TRANSIT, TRANSIT_LANDING } from '../config/transit.ts';
import { addResidenceBasement, buildResidenceCollision, checkResidencePlacement, createResidence, findSafeResidenceSpawn, placeResidence, removeResidence, reserveResidenceSite, updateResidenceDoors, type ResidenceResult } from '../sim/residence.ts';
import type { DefinitionCollision } from '../physics/definition-collision.ts';
import { createStage, attachStage, WEBGL_STAGE_BACKEND } from '../render/stage.ts';
import { residenceTerrainPlacement } from '../sim/residence-terrain.ts';
import { createResidenceTerrainView } from '../render/residence-terrain.ts';
import { createResidenceView, residenceIntersectionId } from '../render/residence-view.ts';
import { createAiCityEnvironment } from '../render/ai-city-environment.ts';
import { createHarborResidenceEnvironment } from '../render/harbor-residence-environment.ts';
import { createResidenceThreeEnvironment } from '../render/residence-three-environment.ts';
import { createResidenceLight } from '../sim/residence-light.ts';
import { createResidenceLighting } from '../render/residence-lighting.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { createGrassyRig, disposeGrassyAssets, loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { compileForStage, warmUpStage } from '../render/warm-up.ts';
import { createResidenceHud } from '../ui/residence-hud.ts';
import { createPerspectiveControls, tiltCamera } from './perspective-controls.ts';
import { SCENE_VIEW_ANGLES, type SceneViewAngle } from '../ui/scene-view-controls.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { loadResidence, saveResidence, RESIDENCE_SAVE_KEY, RESIDENCE_HARBOR_SAVE_KEY, RESIDENCE_THREE_SAVE_KEY } from './residence-save.ts';
import { TUNING } from '../config/tuning.ts';
import { createSceneWorld, waitSceneResource, yieldScene, type SceneMountContext } from './scene-mount.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createPlayableDefinitionMinimap } from './perspective-minimap.ts';
import { createSceneGameOverlays } from './scene-game-overlays.ts';
import { createSceneLoading } from './scene-loading.ts';
import { createFlyingRoadster } from '../entities/flying-roadster.ts';
import { loadFlyingRoadsterAsset, disposeFlyingRoadsterAsset } from '../render/flying-roadster-view.ts';
import { gameHost, replaceGameLocation } from '../ui/mobile-game-viewport.ts';
import { freeWorldSearch, parseMainWorldParams, worldMapSearch } from './free-world-navigation.ts';
import { createFreeWorldToolbar } from '../ui/free-world-toolbar.ts';
import { createTransitInterface } from './transit-controls.ts';
import type { TransitOwner } from './transit-handoff.ts';
import { createTransitStation } from './transit-station.ts';
import { createLandingPod, type LandingPod } from '../render/transit-landing-pod.ts';
import { createReturnCorridorOverlay } from '../render/return-corridor-overlay.ts';

// 城区深度在交通中心用地两端这段距离内过渡到交通中心街道深度。
const SITE_DEPTH_BLEND = 8;
const RESIDENCE_TITLES: Record<ResidenceVariant, string> = { original: 'AI 住宅', harbor: 'AI 住宅 2', three: 'AI 住宅 3' };

export async function startResidence(mode: 'saved', onError: (error: unknown) => void, variant: ResidenceVariant = 'original'): Promise<void> {
  const title = RESIDENCE_TITLES[variant];
  const loading = createSceneLoading(document.body, () => location.reload());
  // 坐着陆舱回来时接着机房页的穿梭画面加载；着陆舱开场等它开始淡出才下降，否则前段在幕后播完。
  const corridor = new URLSearchParams(location.search).get('landing') === '1' ? createReturnCorridorOverlay(document.body, true) : null;
  if (corridor === null) loading.show(title, 'RESIDENCE', 4);
  document.getElementById('loading')!.hidden = true;
  const arrival = corridor && (async () => corridor.hide(.8));
  // 启动失败留在加载画面上显示中断与“重新加载”，错误仍交给上层记录。
  try { await mountResidence(mode, onError, corridor ? corridor.progress : loading.progress, undefined, null, variant, arrival); }
  catch (error) {
    corridor?.hide(0);
    loading.show(title, 'RESIDENCE', 4);
    loading.error(error);
    throw error;
  }
  if (corridor === null) loading.hide();
}

/** owner 由工作区提供：星舰穿越播完后由它打开目的地场景。 */
export function mountResidenceDemo(context: SceneMountContext, owner: TransitOwner, variant: ResidenceVariant = 'original'): Promise<void> {
  return mountResidence('demo', context.reportError, context.progress, context, owner, variant, null);
}

/** 场景页的主世界就是游戏里的城区：同一份存档与网址世界参数，走进原野时切到原野条目。 */
export function mountMainWorld(context: SceneMountContext, owner: TransitOwner): Promise<void> {
  return mountResidence('saved', context.reportError, context.progress, context, owner, 'harbor', null);
}

async function mountResidence(mode: 'demo' | 'saved', onError: (error: unknown) => void, progress: SceneMountContext['progress'], context: SceneMountContext | undefined, contextOwner: TransitOwner | null, variant: ResidenceVariant,
  arrival: (() => Promise<void>) | null): Promise<void> {
  const harbor = variant !== 'original';
  const title = RESIDENCE_TITLES[variant];
  const example = createResidence();
  if (harbor) addResidenceBasement(example);
  const saveKey = variant === 'three' ? RESIDENCE_THREE_SAVE_KEY : harbor ? RESIDENCE_HARBOR_SAVE_KEY : RESIDENCE_SAVE_KEY;
  const existing = mode === 'saved' ? loadResidence(window.localStorage, saveKey) : undefined;
  const state = mode === 'demo' ? example : existing ?? (variant === 'harbor' ? loadResidence(window.localStorage) : undefined) ?? example;
  // 港湾城区左侧是星舰交通中心：读入的任何布局都先清出用地，v2 存档因此不含用地内的地面构件。
  if (harbor) reserveResidenceSite(state, RESIDENCE_TRANSIT.minX, RESIDENCE_TRANSIT.maxX);
  if (mode === 'saved' && harbor && existing === undefined) saveResidence(window.localStorage, state, saveKey);
  const needed = new Set([...example.placements, ...state.placements].map(item => item.resourceId));
  needed.add('ceramic-A');
  const siteSpawn = { x: RESIDENCE_TRANSIT.origin.x + TRANSIT.spawnX, y: RESIDENCE_TRANSIT.origin.y };
  // 城区右端连着原野：从原野左端走回来时出生在城区右端；从原野快速旅行到交通中心时出生在交通中心街面。
  const exitToWilds = mode === 'saved' && variant === 'harbor';
  const from = exitToWilds ? new URLSearchParams(location.search).get('from') : null;
  if (from !== null && from !== 'wilds' && from !== 'transit') throw new Error(`未知城区入口：from=${from}`);
  // 从机房坐着陆舱返回主世界时网址带 landing=1，由着陆舱开场；着陆测试场也用它重放。
  const landingValue = new URLSearchParams(location.search).get('landing');
  if (landingValue !== null && (landingValue !== '1' || !exitToWilds)) throw new Error(`未知着陆开关：${landingValue}（仅主世界城区可用 landing=1）`);
  // 开场只播一次：留在网址里会被带进原野（机房以外不认 landing）并在走回城区或刷新时重放。
  if (landingValue !== null) {
    const next = new URLSearchParams(location.search);
    next.delete('landing');
    replaceGameLocation(`${location.pathname}?${next}`);
  }
  const plan = landingValue === '1'
    ? landingPodPlan({ x: RESIDENCE_TRANSIT.origin.x + TRANSIT_LANDING.exitX, y: RESIDENCE_TRANSIT.origin.y }, TRANSIT_LANDING.altitude, matchMedia('(prefers-reduced-motion: reduce)').matches)
    : null;
  const spawn = plan ? { x: plan.exitX, y: plan.ground } : from === 'transit' ? siteSpawn : findSafeResidenceSpawn(state, from === 'wilds' ? RESIDENCE_WORLD.maxX - 8 : undefined);
  // 从门口外侧向空旷河岸巡航，车顶是可跳上的真实移动平台。
  const carriers = harbor
    ? [createFlyingRoadster(2, { x: spawn.x - 6, y: spawn.y + .8 }, TUNING, -1)] : [];
  const resources = RESIDENCE_RESOURCES.filter(resource => needed.has(resource.id) || resource.kind === 'solid');
  const ui = createResidenceHud(resources, exitToWilds ? 'world' : mode, context?.root);
  if (harbor && mode === 'demo') {
    ui.root.setAttribute('aria-label', title);
    ui.root.querySelector('h1')!.firstChild!.textContent = `${title} `;
    const link = ui.root.querySelector<HTMLAnchorElement>('.residence-actions a')!;
    link.href = variant === 'three' ? './?mode=lab&demo=residence-2' : './?mode=game&level=harbor';
    if (variant === 'three') link.textContent = '对照 AI 住宅 2';
    const labels = variant === 'three'
      ? { garden: '近岸花园 · 地表衔接', architecture: '近岸露台与交通', canyon: '开阔水体', city: '对岸城市', distance: '远城天际线' }
      : { garden: '近岸花园 · 背景一', architecture: '背景二 · 近轨列车与近岸低屋', canyon: '开阔湖面 · 对岸与列车', city: '远城轮廓', distance: '最远天际剪影' };
    for (const layer of AI_CITY_LAYERS) ui.root.querySelector(`[data-city-layer="${layer.id}"]`)!.parentElement!.lastChild!.textContent = labels[layer.id];
  }
  const siteSegment = Math.floor(siteSpawn.x / RESIDENCE_SEGMENT_WIDTH);
  const select = createResourcePicker(resources, createResourceThumbnailRenderer);
  ui.root.querySelector('[data-resource-picker]')!.append(select.root);
  const depthSelect = ui.root.querySelector<HTMLSelectElement>('[data-depth-mode]')!;
  let depthMode: DefinitionDepthMode = 'normal';
  const placementDepth = (): DefinitionDepthMode => getResidenceResource(select.value).kind === 'solid' ? depthMode : 'normal';
  const tool = ui.root.querySelector<HTMLSelectElement>('[data-tool]')!;
  const buildButton = ui.root.querySelector<HTMLButtonElement>('[data-build]')!;
  const playButton = ui.root.querySelector<HTMLButtonElement>('[data-play]')!;
  const cameraButton = ui.root.querySelector<HTMLButtonElement>('[data-camera]')!;
  const playViewButton = ui.root.querySelector<HTMLButtonElement>('[data-play-view]')!;
  const viewButtons = ui.root.querySelectorAll<HTMLButtonElement>('[data-scene-view]');
  const status = ui.root.querySelector<HTMLElement>('[data-build-status]')!;
  const actionStatus = ui.root.querySelector<HTMLElement>('[data-action-status]')!;
  const saveStatus = ui.root.querySelector<HTMLElement>('[data-save-status]')!;
  document.title = exitToWilds ? '主世界 · 城区' : `${title} · ${mode === 'demo' ? '游戏演示' : '建造与游玩'}`;
  progress('装配住宅');
  if (context) await yieldScene(context.signal);
  const quality = resolveQuality(new URLSearchParams(location.search).get('quality'), BUILDING_SCENE_TUNING.render.lighting.quality);
  const pixelRatio = context?.renderer.getPixelRatio();
  // 工作台各页面共用渲染器，离开时还原像素比；须在挂舞台前设置，后期缓冲按此尺寸分配。
  if (context && quality === 'low') { context.renderer.setPixelRatio(1); context.onDispose(() => context.renderer.setPixelRatio(pixelRatio!)); }
  const stage = context
    ? attachStage(ui.viewport, context.renderer, BUILDING_SCENE_TUNING, { quality, antialias: 'smaa' }, WEBGL_STAGE_BACKEND)
    : createStage(ui.viewport, BUILDING_SCENE_TUNING, { quality, antialias: 'smaa' });
  if (!context && quality === 'low') {
    // 独立页面独占渲染器；随后按新像素比重新分配后期缓冲。
    stage.renderer.setPixelRatio(1);
    stage.setSize(ui.viewport.clientWidth, ui.viewport.clientHeight);
  }
  // 原版住宅的背景是固定黄昏原画，前景配色取自原画；住宅 2 用自己的背景，沿用共享配色。
  const lighting = createAiCityLighting(stage, harbor ? AI_CITY_HARBOR_LOOK : AI_CITY_RESIDENCE_LOOK);
  lighting.setEnabled(true);
  // 工作区提供世界时间与天气；独立页面由自己的场景工具条持有，每帧推进。
  const scene = context ? null : createSceneWorld(harbor ? '主世界' : 'AI 住宅');
  const sceneWorld = context?.world ?? scene!.world;
  scene?.bar.attach(ui.root.querySelector<HTMLElement>('.residence-toolbar')!);
  stage.canvas.setAttribute('aria-label', 'AI住宅游戏画面，建造模式下点击放置选中构件');
  const entrance = state.placements.filter(item => item.resourceId === 'door-left' || item.resourceId === 'door-right').sort((a, b) => a.y - b.y)[0];
  const homeCenter = entrance ? entrance.x + (entrance.resourceId === 'door-left' ? 8.5 : -8.5) : spawn.x;
  stage.camera.far = RESIDENCE_WORLD.width * 8;
  stage.camera.updateProjectionMatrix();
  const view = createResidenceView(state);
  const terrain = variant === 'three'
    ? createResidenceTerrainView(state, -10, RESIDENCE_WORLD.minY - 32)
    : createResidenceTerrainView(state);
  const light = createResidenceLight(state);
  let lightRevision = state.revision;
  const spatialLighting = createResidenceLighting(light, { slots: quality === 'low' ? 2 : 4 });
  spatialLighting.attach(view.root); spatialLighting.attach(terrain.root);
  const minY = state.underground ? RESIDENCE_WORLD.minY : RESIDENCE_WORLD.foundationTop;
  const initialCollision = buildResidenceCollision(state);
  const collision = { solids: [...initialCollision.solids, ...view.solarPanels.map(panel => panel.collider)], platforms: [...initialCollision.platforms] };
  // 交通中心随角色一起创建；之后每次重建城市碰撞都并入它的街面、舰体与电梯平台。
  let siteCollision: DefinitionCollision = { solids: [], platforms: [] };
  const minimap = createPlayableDefinitionMinimap(ui.viewport, collision,
    { minX: RESIDENCE_WORLD.minX, minY, maxX: RESIDENCE_WORLD.maxX, maxY: RESIDENCE_WORLD.height });
  // 主世界控件片段插在城区工具条里，与原野同一套。
  let mainToolbar: ReturnType<typeof createFreeWorldToolbar> | null = null;
  // 工作区里切到原野条目；独立页整页跳转。
  const go = (url: string): void => {
    gameplay?.releaseInput();
    if (context) context.open(url);
    else gameHost().location.assign(url);
  };
  if (exitToWilds) {
    const params = parseMainWorldParams(new URLSearchParams(location.search));
    const { seed, size } = params;
    let gm = params.gm;
    const toWilds = (nextSeed: number, nextSize: typeof size): void => go(`${location.pathname}${freeWorldSearch(location.search, nextSeed, gm, 'wilds', nextSize)}`);
    mainToolbar = createFreeWorldToolbar(ui.root.querySelector<HTMLElement>('.residence-toolbar')!, {
      seed, gm, gmHint: 'wilds', size, region: String(Math.floor(spawn.x / RESIDENCE_SEGMENT_WIDTH)),
      regions: [...RESIDENCE_SEGMENTS.map(segment => {
        const label = segment.index === siteSegment ? `星舰交通中心 · ${segment.label}` : segment.label;
        return { id: String(segment.index), label, labelEn: label };
      }), { id: 'wilds', label: '原野入口', labelEn: 'Wilds entrance' }],
      onSeed: toWilds,
      // 城区没有 GM 功能，只记进网址，进原野时生效。
      onGm: enabled => {
        gm = enabled;
        const next = new URLSearchParams(location.search);
        next.set('gm', enabled ? '1' : '0');
        replaceGameLocation(`${location.pathname}?${next}`);
      },
      onRegion: id => {
        // 角色加载完成前没有可传送的人物，下拉框退回原值。
        // 交通中心接管期间每帧写入镜头与角色，不能被传送打断。
        // 着陆舱开场期间输入锁定，同样不能传送。
        if (gameplay === null || station?.active === true || gameplay.landing !== null) return false;
        if (id === 'wilds') toWilds(seed, size);
        else travelTo(Number(id));
        return true;
      },
      onSettings: null,
      onFocus: () => gameplay?.releaseInput(),
      onFocusGame: () => stage.canvas.focus(),
    });
  }
  const overlays = createSceneGameOverlays(ui.root.querySelector<HTMLElement>('.residence-toolbar')!, ui.viewport, stage, minimap);
  const weather = createResidenceWeather(stage, () => collision.solids);
  const environment = variant === 'three' ? createResidenceThreeEnvironment(homeCenter, RESIDENCE_TRANSIT)
    : harbor ? createHarborResidenceEnvironment(homeCenter, RESIDENCE_TRANSIT) : createAiCityEnvironment({ homeCenter, scenery: 'full' });
  stage.scene.add(environment.root, view.root, terrain.root, spatialLighting.root);
  // 视图同步时原地改写这组面板，人物与碰撞持有的引用保持有效。
  const solarPanels = view.solarPanels;
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.minDistance = 8;
  orbit.maxDistance = RESIDENCE_WORLD.width * 6;
  const section: SceneSection = { id: 'residence', title: 'AI住宅', description: '双层能量门住宅', x: RESIDENCE_WORLD.minX, y: minY,
    width: RESIDENCE_WORLD.width, height: RESIDENCE_WORLD.height - minY,
    playerX: spawn.x, playerY: spawn.y, items: [], walkZ(x, y) {
      const city = view.walkZ(x, y);
      if (!station || x <= RESIDENCE_TRANSIT.minX || x >= RESIDENCE_TRANSIT.maxX) return city;
      const edge = Math.min(x - RESIDENCE_TRANSIT.minX, RESIDENCE_TRANSIT.maxX - x);
      return THREE.MathUtils.lerp(city, station.walkZ(x, y), THREE.MathUtils.smoothstep(edge, 0, SITE_DEPTH_BLEND));
    } };
  let gameplay: ReturnType<typeof createPerspectiveControls> | null = null;
  let station: ReturnType<typeof createTransitStation> | null = null;
  let transitUi: ReturnType<typeof createTransitInterface> | null = null;
  // 发射后目的地已在用角色与飞车的共享资源，交接后释放城市时不能一并销毁。
  let handedOff = false;
  let rig: ReturnType<typeof createGrassyRig> | null = null;
  let lander: LandingPod | null = null;
  let ghost: ReturnType<typeof createResidenceView> | null = null;
  let frame = 0;
  let disposed = false;
  let editing = false;
  let pointerInside = false;
  let position = { x: 0, y: 0 };
  const events = new AbortController();
  const syncEditingCamera = (): void => {
    if (!editing) return;
    orbit.mouseButtons.LEFT = null;
    orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    ui.root.querySelector<HTMLElement>('[data-mode]')!.textContent = '建造中 · 已暂停';
    ui.root.querySelector<HTMLElement>('.room-preview-hint')!.textContent = '选择资源 · 左键放置 / 拆除 · 中键旋转 · 右键平移 · 滚轮缩放';
  };
  let wholeWorld = false;
  let areaCenter = homeCenter;
  let areaWidth = mode === 'demo' ? 34 : 96;
  let areaY = 7;
  let areaHeight = 18;
  let inspectionView: SceneViewAngle = 'front';
  const markView = (preset: string | null): void => {
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.sceneView === preset));
    playViewButton.setAttribute('aria-pressed', String(gameplay?.following === true));
  };
  const overview = (): void => {
    gameplay?.observe();
    syncEditingCamera();
    const height = wholeWorld ? Math.max(32, (RESIDENCE_WORLD.width + 8) / stage.camera.aspect) * 1.2 : Math.max(areaHeight, areaWidth / stage.camera.aspect);
    const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    orbit.target.set(wholeWorld ? (RESIDENCE_WORLD.minX + RESIDENCE_WORLD.maxX) / 2 : areaCenter, wholeWorld ? (RESIDENCE_WORLD.height + minY) / 2 : areaY, 0);
    tiltCamera(stage.camera, orbit.target, distance, SCENE_VIEW_ANGLES[inspectionView]);
    orbit.update();
    markView(inspectionView);
  };
  const resize = new ResizeObserver(() => {
    stage.setSize(ui.viewport.clientWidth, ui.viewport.clientHeight);
    if (!gameplay?.following) overview();
  });
  resize.observe(ui.viewport);
  stage.setSize(ui.viewport.clientWidth, ui.viewport.clientHeight);
  overview();
  const gridPoints: number[] = [];
  for (let x = RESIDENCE_WORLD.minX; x <= RESIDENCE_WORLD.maxX; x++) gridPoints.push(x, minY, 1.52, x, RESIDENCE_WORLD.height, 1.52);
  for (let y = minY; y <= RESIDENCE_WORLD.height; y++) gridPoints.push(RESIDENCE_WORLD.minX, y, 1.52, RESIDENCE_WORLD.maxX, y, 1.52);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x428dbe, transparent: true, opacity: .2, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  grid.visible = false;
  stage.scene.add(grid);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    events.abort(); resize.disconnect(); gameplay?.dispose(); orbit.dispose();
    if (!handedOff) mainToolbar?.dispose();
    scene?.dispose();
    station?.dispose(); transitUi?.section.remove(); lander?.dispose();
    if (carriers.length > 0 && !handedOff) disposeFlyingRoadsterAsset();
    overlays.dispose(); minimap.dispose();
    spatialLighting.dispose();
    ghost?.dispose(); view.dispose(); terrain.dispose(); environment.dispose(); weather.dispose(); rig?.dispose();
    gridGeometry.dispose(); gridMaterial.dispose(); lighting.dispose(); stage.dispose(); if (!context && !handedOff) disposeGrassyAssets(); select.dispose(); ui.dispose();
  };
  if (context) context.onDispose(dispose);
  else window.addEventListener('pagehide', dispose, { once: true, signal: events.signal });
  const save = (): void => {
    if (mode === 'demo') {
      saveStatus.textContent = '演示修改仅本次有效 · 刷新后恢复示例';
      return;
    }
    try {
      saveResidence(window.localStorage, state, saveKey);
      saveStatus.textContent = '已保存到本机';
      saveStatus.dataset.error = 'false';
    } catch (error) {
      saveStatus.textContent = `未保存：${error instanceof Error ? error.message : String(error)}。当前布局仍保留，请重试保存。`;
      saveStatus.dataset.error = 'true';
    }
  };
  const updateCount = (): void => { ui.root.querySelector<HTMLElement>('[data-count]')!.textContent = `${state.placements.length} 个构件${state.underground ? ` · ${RESIDENCE_WORLD.width * (RESIDENCE_WORLD.foundationTop - minY) - state.underground.size} 个地下格` : ""}`; };
  const syncCollision = (): void => {
    const next = buildResidenceCollision(state);
    // 人物、骑行和弹体持有这些数组，不能替换数组引用。
    collision.solids.splice(0, collision.solids.length, ...next.solids, ...solarPanels.map(panel => panel.collider), ...siteCollision.solids);
    collision.platforms.splice(0, collision.platforms.length, ...next.platforms, ...siteCollision.platforms);
    minimap.refresh();
  };
  const rebuild = (): void => {
    view.sync();
    // 重建的 kit 带来新材质，需要重新接入光场。
    spatialLighting.attach(view.root);
    syncCollision(); updateCount(); save();
  };
  const feedback = (message: string, error = false): void => {
    status.textContent = message;
    status.dataset.error = String(error);
    actionStatus.textContent = message;
    actionStatus.dataset.error = String(error);
  };
  const apply = (result: ResidenceResult): void => {
    feedback(result.message, !result.ok);
    if (!result.ok) return;
    if (result.id !== undefined && result.id < 0) {
      terrain.refresh(result.id);
      syncCollision(); updateCount(); save();
    } else rebuild();
  };
  const updateGhost = (): void => {
    if (!ghost) return;
    ghost.root.visible = editing && pointerInside && tool.value === 'place';
    ghost.root.position.set(position.x, position.y, .015);
    if (ghost.root.visible) {
      const result = checkResidencePlacement(state, select.value, position.x, position.y, gameplay!.body, placementDepth());
      status.textContent = `${getResidenceResource(select.value).label} · ${position.x}, ${position.y} · ${result.message}`;
      status.dataset.error = String(!result.ok);
      ghost.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) material.emissive.set(result.ok ? 0x149d9d : 0xcc203b);
        }
      });
    }
  };
  const chooseResource = (): void => {
    const resource = getResidenceResource(select.value);
    ui.root.querySelector<HTMLElement>('[data-depth-field]')!.hidden = resource.kind !== 'solid';
    ui.root.querySelector<HTMLElement>('[data-resource-note]')!.textContent = `${resource.label} · 占位 ${resource.width} × ${resource.height} 格。${resource.kind === 'solid' ? placementDepth() === 'deep' ? '深3，同格不能放背景墙；一格一块，可连续拼接。' : '深2，可与背景墙共存。' : ''}拆除只选择与此构件相同的一层。`;
    ghost?.dispose();
    ghost = createResidenceView({ placements: [{ id: 0, resourceId: resource.id, x: 0, y: 0, ...resource.kind === 'solid' ? { depthMode } : {}, ...resource.kind === 'door' ? { open: false } : {} }], nextId: 1, revision: 0 });
    ghost.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true; material.opacity = .45; material.depthWrite = false;
      }
    });
    stage.scene.add(ghost.root);
    updateGhost();
  };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const aim = (event: PointerEvent): boolean => {
    const rect = stage.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, stage.camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return false;
    const r = getResidenceResource(select.value);
    const step = ['solid', 'wall', 'glazing', 'door'].includes(r.kind) ? 1 : .5;
    position = { x: Math.floor(hit.x / step) * step, y: Math.floor(hit.y / step) * step };
    return true;
  };
  const playView = (): void => {
    gameplay!.setViewAngles(SCENE_VIEW_ANGLES[inspectionView]);
    syncEditingCamera();
    markView(inspectionView);
  };
  const edit = (enabled: boolean): void => {
    editing = enabled;
    ui.root.classList.toggle('is-building', enabled);
    buildButton.textContent = enabled ? '结束建造' : mode === 'demo' ? '体验建造' : '建造';
    buildButton.setAttribute('aria-pressed', String(enabled));
    buildButton.setAttribute('aria-expanded', String(enabled));
    playButton.disabled = enabled;
    cameraButton.disabled = enabled;
    gameplay!.setPlaying(!enabled);
    if (enabled) {
      gameplay!.observe();
      syncEditingCamera();
    }
    markView(null);
    grid.visible = enabled;
    updateGhost();
  };
  const travelTo = (segment: number): void => {
    // 交通中心用地内的安全点可能落在舰体或电梯上，直接送到街面出生点。
    const point = harbor && segment === siteSegment ? siteSpawn : findSafeResidenceSpawn(state, segment === 0 ? undefined : segment * RESIDENCE_SEGMENT_WIDTH + 43);
    gameplay!.select({ ...section, playerX: point.x, playerY: point.y });
    wholeWorld = false; areaCenter = segment === 0 ? homeCenter : segment * RESIDENCE_SEGMENT_WIDTH + 59;
    areaWidth = segment === 0 ? 34 : 90;
    gameplay!.setFollowing(true); markView(null);
    if (editing) edit(true);
  };
  try {
    progress('加载角色', 0, 1);
    const grassy = loadGrassyAsset('game');
    if (context) await waitSceneResource(grassy, context.signal);
    else await grassy;
    context?.signal.throwIfAborted();
    progress('加载角色', 1, 1);
    if (disposed) return;
    rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(window.localStorage).current());
    rig.root.position.set(section.playerX, section.playerY, 0);
    animateGrassy(rig, 'idle', 0, 0, null);
    spatialLighting.attach(rig.root);
    stage.scene.add(rig.root);
    await compileForStage(stage, rig.root);
    context?.signal.throwIfAborted();
    if (disposed) return;
    if (carriers.length > 0) await loadFlyingRoadsterAsset();
    if (disposed) return;
    const droneFleet = createUtilityDroneFleet(stage.scene, stage.createPmrem());
    if (disposed) { droneFleet.dispose(); return; }
    if (harbor) {
      transitUi = createTransitInterface(ui.viewport, true);
      // 交接时叠层先移到 body，再把城市画面所在的视口放进叠层，画布随过渡画面一起留在页面上。
      // 目的地可能是原野并挂自己的工具条，城区工具条须先移除。
      const leave = (): void => { handedOff = true; mainToolbar?.dispose(); scene?.dispose(); transitUi!.viewport.append(ui.viewport); ui.dispose(); };
      const owner: TransitOwner = contextOwner ?? { leave, dispose };
      station = createTransitStation({ stage, lighting, ui: transitUi, rig, origin: RESIDENCE_TRANSIT.origin, hosted: true,
        signal: events.signal, owner, body: () => gameplay!.body,
        teleport(x, y) { gameplay!.select({ ...section, playerX: x, playerY: y }); },
        playing: () => gameplay!.playing,
        // 重新进入游玩状态会释放全部按住的键并重绑输入。
        clearInput() { gameplay!.setPlaying(gameplay!.playing); },
        stopInput() { gameplay!.setPlaying(false); },
        reportError: onError });
      siteCollision = station.collision;
      syncCollision();
      const transit = station;
      // 用地内 E 是交通中心交互而不是技能 4，须在游戏输入的冒泡监听之前拦下。
      window.addEventListener('keydown', event => {
        if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
        if (event.code === 'Escape' && transit.active) { event.preventDefault(); transit.cancel(); return; }
        if (event.code !== 'KeyE' || event.ctrlKey || event.metaKey || event.altKey || !gameplay!.playing || gameplay!.landing !== null || !transit.near(gameplay!.body)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) transit.interact();
      }, { capture: true, signal: events.signal });
    }
    gameplay = createPerspectiveControls(ui.root, stage, droneFleet, orbit, rig, collision,
      new THREE.Box3(new THREE.Vector3(RESIDENCE_WORLD.minX, minY, -1.5), new THREE.Vector3(RESIDENCE_WORLD.maxX, RESIDENCE_WORLD.height, 1.5)), section, [0, 0], solarPanels, false, { cameraMode: 'game', tuning: TUNING, applyForce: weather.applyToBody, airWind: weather.airWind, carriers,
        world: sceneWorld, steer: station?.steer, lander: () => lander });
    gameplay.hud.attachMap(minimap.root);
    gameplay.select(section);
    if (plan) {
      gameplay.land(plan);
      const controls = gameplay, avatar = rig;
      lander = createLandingPod(stage, controls.landing!, { landing: () => controls.landing, body: () => controls.body, step: TUNING.sim.step,
        planeZ: TRANSIT.groundLaneZ, cameraDistance: TUNING.camera.distance,
        carry(pose) {
          // After handback the controls write the rig every frame again; the walk-out already ends at the lane depth facing left.
          if (pose === null) return;
          avatar.root.position.set(pose.x, pose.y + pose.lift, pose.z);
          avatar.root.rotation.y = pose.yaw - Math.PI / 2;
        } });
      lander.update(0, 0, 0);
    }
    markView(inspectionView);
    environment.setCamera(stage.camera);
    await environment.prepare(context ? context.signal : events.signal, step => progress('装配城市与空中交通', step.completed, step.total));
    progress('准备光照与首帧');
    await warmUpStage(stage, [], context?.signal);
    updateCount(); chooseResource();
    saveStatus.textContent = mode === 'demo' ? '演示修改仅本次有效 · 刷新后恢复示例' : '本机独立存档 · 修改后自动保存';
    const listen = (selector: string, action: () => void): void => {
      ui.root.querySelector(selector)!.addEventListener('click', action, { signal: events.signal });
    };
    buildButton.addEventListener('click', () => edit(!editing), { signal: events.signal });
    playViewButton.addEventListener('click', playView, { signal: events.signal });
    orbit.addEventListener('start', () => markView(null));
    for (const button of viewButtons) button.addEventListener('click', () => {
      inspectionView = button.dataset.sceneView as SceneViewAngle;
      if (gameplay!.following) {
        gameplay!.setViewAngles(SCENE_VIEW_ANGLES[inspectionView]);
        markView(inspectionView);
      } else overview();
    }, { signal: events.signal });
    listen('[data-camera]', () => markView(null));
    // 场景位置与背景分层只在住宅场景里；主世界城区由控件片段负责快速旅行。
    if (!exitToWilds) {
      const travel = ui.root.querySelector<HTMLSelectElement>('[data-travel]')!;
      if (harbor) {
        const option = travel.querySelector(`option[value="${siteSegment}"]`)!;
        option.textContent = `星舰交通中心 · ${option.textContent}`;
      }
      listen('[data-overview]', () => { travel.value = '0'; wholeWorld = false; areaCenter = homeCenter; areaWidth = 34; areaY = 7; areaHeight = 18; overview(); });
      listen('[data-underground]', () => { wholeWorld = false; areaCenter = gameplay!.body.x; areaWidth = 80; areaY = (minY + RESIDENCE_WORLD.foundationTop) / 2; areaHeight = RESIDENCE_WORLD.foundationTop - minY + 8; overview(); });
      listen('[data-world]', () => { wholeWorld = true; overview(); });
      listen('[data-spawn]', () => {
        travel.value = '0';
        const spawn = findSafeResidenceSpawn(state);
        section.playerX = spawn.x; section.playerY = spawn.y;
        gameplay!.select(section);
        wholeWorld = false; areaCenter = homeCenter; areaWidth = 34; gameplay!.setFollowing(true); markView(null);
        if (editing) edit(true);
      });
      listen('[data-save]', save);
      travel.addEventListener('change', () => travelTo(Number(travel.value)), { signal: events.signal });
      for (const layer of AI_CITY_LAYERS) ui.root.querySelector<HTMLInputElement>(`[data-city-layer="${layer.id}"]`)!.addEventListener('change', event => {
        environment.setLayerVisible(layer.id, (event.target as HTMLInputElement).checked);
      }, { signal: events.signal });
      const reflections = ui.root.querySelector<HTMLInputElement>('[data-reflections]')!;
      // 低画质关闭 AO，反射依附 AO，开关无效。
      reflections.disabled = quality === 'low';
      reflections.addEventListener('change', () => stage.postFx.setReflections(reflections.checked), { signal: events.signal });
    }
    select.root.addEventListener('change', chooseResource, { signal: events.signal });
    depthSelect.addEventListener('change', () => {
      const value = depthSelect.value;
      if (value !== 'normal' && value !== 'deep') throw new Error(`未知砖块深度规格：${value}`);
      depthMode = value;
      chooseResource();
    }, { signal: events.signal });
    tool.addEventListener('change', updateGhost, { signal: events.signal });
    stage.canvas.addEventListener('pointermove', event => { pointerInside = true; if (editing && aim(event)) updateGhost(); }, { signal: events.signal });
    stage.canvas.addEventListener('pointerleave', () => { pointerInside = false; updateGhost(); }, { signal: events.signal });
    stage.canvas.addEventListener('pointerdown', event => {
      if (!editing || event.button !== 0 || !aim(event)) return;
      if (tool.value === 'place') apply(placeResidence(state, select.value, position.x, position.y, gameplay!.body, placementDepth()));
      else {
        const layer = getResidenceResource(select.value).layer;
        const target = raycaster.intersectObjects([view.root, terrain.root], true).find(item => {
          const id = residenceIntersectionId(item);
          const p = id === undefined ? undefined : id < 0 ? residenceTerrainPlacement(state, id) : state.placements.find(p => p.id === id);
          return p && getResidenceResource(p.resourceId).layer === layer;
        });
        if (target) apply(removeResidence(state, residenceIntersectionId(target)!));
        else feedback('这里没有当前层的构件');
      }
    }, { signal: events.signal });
    let previous: number | null = null;
    let time = 0;
    let firstFrame = true;
    let leaving = false;
    let nearWilds = false;
    const draw = (now: number, schedule = true): void => {
      if (disposed || context?.signal.aborted) return;
      try {
        overlays.begin();
        const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, .05));
        previous = now; time += dt;
        scene?.bar.advance(dt);
        weather.setWeather(sceneWorld.weather); weather.setSettings(sceneWorld.weatherConfig);
        const world = sampleWorldTime(sceneWorld.time);
        const solarAngle = solarTrackingAngle(world.sunDirection);
        for (const panel of solarPanels) panel.sunAngle = solarAngle;
        if (gameplay!.playing && !editing && updateResidenceDoors(state, gameplay!.body)) syncCollision();
        // 乘梯、登舱与发射期间交通中心驱动角色和镜头；它写镜头必须在 orbit 之后。
        if (!station?.active) gameplay!.update(dt);
        orbit.update();
        const body = gameplay!.body;
        if (station) {
          station.update(dt);
          transitUi!.section.hidden = !station.active && (!station.near(body) || gameplay!.landing !== null);
          // The station writes the camera every frame while active, as does the arrival pod, so build mode and pausing would fight it.
          if (!editing) {
            buildButton.disabled = station.active || gameplay!.landing !== null;
            playButton.disabled = buildButton.disabled;
          }
        }
        if (exitToWilds && !station!.active) {
          if (!leaving && body.x > RESIDENCE_WORLD.maxX - 1) {
            leaving = true;
            go(`${location.pathname}${worldMapSearch(location.search, 'wilds')}`);
          }
          const near = body.x > RESIDENCE_WORLD.maxX - 12;
          if (near !== nearWilds) { nearWilds = near; actionStatus.textContent = near ? '继续向右进入原野 →' : ''; }
        }
        // 穿越航道时城市已整体隐藏，环境、天气与光照不再推进；舞台铺满全屏，只留航道与交通中心叠层。
        ui.root.classList.toggle('residence-in-flight', station?.travelling === true);
        if (!station?.travelling) {
          if (lightRevision !== state.revision) {
            spatialLighting.update(stage.renderer, light.sync());
            lightRevision = state.revision;
          }
          if (terrain.update(stage.camera)) spatialLighting.attach(terrain.root);
          const atmosphere = weather.update(time, dt, world);
          lighting.setWorldTime(world, atmosphere);
          spatialLighting.setFrame(stage.camera, world.night, time, lighting.skyTint); view.update(time, body);
          if (ghost?.root.visible) ghost.update(time, null);
          environment.setWeather(atmosphere); environment.setNightFactor(world.night, world.moonLight); environment.setCamera(stage.camera); environment.update(time);
          lighting.update(); minimap.update(body.x, body.y);
        }
        overlays.render();
        if (schedule) frame = requestAnimationFrame(draw);
      } catch (error) {
        if (firstFrame) throw error;
        if (station?.handoff.active) { station.handoff.error(error); return; }
        dispose(); onError(error);
      }
    };
    // 先画出首帧再等加载层揭幕；揭幕后从零时长重新计时，着陆舱下降不会在幕后提前走完。
    const begin = (): void => {
      if (disposed) return;
      gameplay!.setPlaying(true);
      previous = null;
      frame = requestAnimationFrame(draw);
    };
    if (context) {
      draw(performance.now(), false);
      // 不能 await：工作区要等挂载返回才撤加载层、兑现 revealed。
      void context.revealed.then(begin);
    } else if (arrival) {
      progress('准备抵达');
      draw(performance.now(), false);
      await arrival();
      begin();
    } else draw(performance.now());
    firstFrame = false;
  } catch (error) { dispose(); throw error; }
}
