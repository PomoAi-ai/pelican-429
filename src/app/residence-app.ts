import { loadUtilityDroneFleet } from '../render/utility-drone.ts';
import { createResourcePicker } from '../ui/resource-picker.ts';
import { createResourceThumbnailRenderer } from '../render/resource-thumbnail.ts';
import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import { sampleWorldTime } from '../core/calendar.ts';
import { solarTrackingAngle } from '../physics/solar-panel.ts';
import { bindWorldControls } from '../ui/world-controls.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AI_CITY_HARBOR_LOOK, AI_CITY_LAYERS, AI_CITY_RESIDENCE_LOOK, BUILDING_SCENE_TUNING } from '../config/ai-city-look.ts';
import { resolveQuality } from '../config/lighting-rules.ts';
import { getResidenceResource, RESIDENCE_RESOURCES, RESIDENCE_SEGMENT_WIDTH, RESIDENCE_WORLD } from '../config/residence.ts';
import { resolveSceneWeatherMode, resolveWindMode } from '../config/weather-rules.ts';
import { buildResidenceCollision, checkResidencePlacement, createResidence, findSafeResidenceSpawn, placeResidence, removeResidence, updateResidenceDoors, type ResidenceResult } from '../sim/residence.ts';
import { createStage, attachStage } from '../render/stage.ts';
import { residenceTerrainPlacement } from '../sim/residence-terrain.ts';
import { createResidenceTerrainView } from '../render/residence-terrain.ts';
import { createResidenceView, residenceIntersectionId } from '../render/residence-view.ts';
import { createAiCityEnvironment } from '../render/ai-city-environment.ts';
import { createHarborResidenceEnvironment } from '../render/harbor-residence-environment.ts';
import { createResidenceLight } from '../sim/residence-light.ts';
import { createResidenceLighting } from '../render/residence-lighting.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { createGrassyRig, disposeGrassyAssets, loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { compileForStage, warmUpStage } from '../render/warm-up.ts';
import { createResidenceHud } from '../ui/residence-hud.ts';
import { createPerspectiveControls } from './perspective-controls.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { loadResidence, saveResidence, RESIDENCE_SAVE_KEY, RESIDENCE_HARBOR_SAVE_KEY } from './residence-save.ts';
import { TUNING } from '../config/tuning.ts';
import { waitSceneResource, yieldScene, type SceneMountContext } from './scene-mount.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createPlayableDefinitionMinimap } from './perspective-minimap.ts';
import { createSceneGameOverlays } from './scene-game-overlays.ts';
import { createSceneLoading } from './scene-loading.ts';
import { createFlyingRoadster } from '../entities/flying-roadster.ts';
import { loadFlyingRoadsterAsset, disposeFlyingRoadsterAsset } from '../render/flying-roadster-view.ts';

export async function startResidence(mode: 'saved', onError: (error: unknown) => void, variant: 'original' | 'harbor' = 'original'): Promise<void> {
  const loading = createSceneLoading(document.body, () => location.reload());
  loading.show(variant === 'harbor' ? 'AI 住宅 2' : 'AI 住宅', 'RESIDENCE', 4);
  document.getElementById('loading')!.hidden = true;
  // 启动失败留在加载画面上显示中断与“重新加载”，错误仍交给上层记录。
  try { await mountResidence(mode, onError, loading.progress, undefined, variant); }
  catch (error) { loading.error(error); throw error; }
  loading.hide();
}

export function mountResidenceDemo(context: SceneMountContext, variant: 'original' | 'harbor' = 'original'): Promise<void> {
  return mountResidence('demo', context.reportError, context.progress, context, variant);
}

async function mountResidence(mode: 'demo' | 'saved', onError: (error: unknown) => void, progress: SceneMountContext['progress'], context: SceneMountContext | undefined, variant: 'original' | 'harbor'): Promise<void> {
  const example = createResidence();
  const saveKey = variant === 'harbor' ? RESIDENCE_HARBOR_SAVE_KEY : RESIDENCE_SAVE_KEY;
  const existing = mode === 'saved' ? loadResidence(window.localStorage, saveKey) : undefined;
  const state = mode === 'demo' ? example : existing ?? (variant === 'harbor' ? loadResidence(window.localStorage) : undefined) ?? example;
  if (mode === 'saved' && variant === 'harbor' && existing === undefined) saveResidence(window.localStorage, state, saveKey);
  const needed = new Set([...example.placements, ...state.placements].map(item => item.resourceId));
  needed.add('ceramic-A');
  const spawn = findSafeResidenceSpawn(state);
  // 从门口外侧向空旷河岸巡航，车顶是可跳上的真实移动平台。
  const carriers = variant === 'harbor'
    ? [createFlyingRoadster(2, { x: spawn.x - 6, y: spawn.y + .8 }, TUNING, -1)] : [];
  const resources = RESIDENCE_RESOURCES.filter(resource => needed.has(resource.id) || resource.kind === 'solid');
  const ui = createResidenceHud(resources, mode, context?.root);
  if (variant === 'harbor') {
    ui.root.setAttribute('aria-label', 'AI 住宅 2');
    ui.root.querySelector('h1')!.firstChild!.textContent = 'AI 住宅 2 ';
    const link = ui.root.querySelector<HTMLAnchorElement>('.residence-actions a')!;
    link.href = mode === 'saved' ? './?mode=lab&demo=residence-2' : './?mode=game&level=harbor';
    const labels = { garden: '近岸花园 · 背景一', architecture: '对岸低屋与列车', canyon: '大湖与对岸街区', city: '远城塔群', distance: '远城剪影与天际线' };
    for (const layer of AI_CITY_LAYERS) ui.root.querySelector(`[data-city-layer="${layer.id}"]`)!.parentElement!.lastChild!.textContent = labels[layer.id];
  }
  const select = createResourcePicker(resources, createResourceThumbnailRenderer);
  ui.root.querySelector('[data-resource-picker]')!.append(select.root);
  const depthSelect = ui.root.querySelector<HTMLSelectElement>('[data-depth-mode]')!;
  let depthMode: DefinitionDepthMode = 'normal';
  const placementDepth = (): DefinitionDepthMode => getResidenceResource(select.value).kind === 'solid' ? depthMode : 'normal';
  const travel = ui.root.querySelector<HTMLSelectElement>('[data-travel]')!;
  const tool = ui.root.querySelector<HTMLSelectElement>('[data-tool]')!;
  const buildButton = ui.root.querySelector<HTMLButtonElement>('[data-build]')!;
  const playButton = ui.root.querySelector<HTMLButtonElement>('[data-play]')!;
  const cameraButton = ui.root.querySelector<HTMLButtonElement>('[data-camera]')!;
  const playViewButton = ui.root.querySelector<HTMLButtonElement>('[data-play-view]')!;
  const viewButtons = ui.root.querySelectorAll<HTMLButtonElement>('[data-residence-view]');
  const status = ui.root.querySelector<HTMLElement>('[data-build-status]')!;
  const saveStatus = ui.root.querySelector<HTMLElement>('[data-save-status]')!;
  document.title = `${variant === 'harbor' ? 'AI 住宅 2' : 'AI 住宅'} · ${mode === 'demo' ? '游戏演示' : '建造与游玩'}`;
  progress('装配住宅');
  if (context) await yieldScene(context.signal);
  const quality = resolveQuality(new URLSearchParams(location.search).get('quality'), BUILDING_SCENE_TUNING.render.lighting.quality);
  const pixelRatio = context?.renderer.getPixelRatio();
  // 工作台各页面共用渲染器，离开时还原像素比；须在挂舞台前设置，后期缓冲按此尺寸分配。
  if (context && quality === 'low') { context.renderer.setPixelRatio(1); context.onDispose(() => context.renderer.setPixelRatio(pixelRatio!)); }
  const stage = context
    ? attachStage(ui.viewport, context.renderer, BUILDING_SCENE_TUNING, { quality, antialias: 'smaa' })
    : createStage(ui.viewport, BUILDING_SCENE_TUNING, { quality, antialias: 'smaa' });
  if (!context && quality === 'low') {
    // 独立页面独占渲染器；随后按新像素比重新分配后期缓冲。
    stage.renderer.setPixelRatio(1);
    stage.setSize(ui.viewport.clientWidth, ui.viewport.clientHeight);
  }
  // 原版住宅的背景是固定黄昏原画，前景配色取自原画；住宅 2 用自己的背景，沿用共享配色。
  const lighting = createAiCityLighting(stage, variant === 'harbor' ? AI_CITY_HARBOR_LOOK : AI_CITY_RESIDENCE_LOOK);
  lighting.setEnabled(true);
  const worldControls = context ? null : bindWorldControls(ui.root);
  const gameTime = context ? context.world.time : worldControls!.time;
  stage.canvas.setAttribute('aria-label', 'AI住宅游戏画面，建造模式下点击放置选中构件');
  const entrance = state.placements.filter(item => item.resourceId === 'door-left' || item.resourceId === 'door-right').sort((a, b) => a.y - b.y)[0];
  const homeCenter = entrance ? entrance.x + (entrance.resourceId === 'door-left' ? 8.5 : -8.5) : spawn.x;
  stage.camera.far = RESIDENCE_WORLD.width * 8;
  stage.camera.updateProjectionMatrix();
  const view = createResidenceView(state);
  const terrain = createResidenceTerrainView(state);
  const light = createResidenceLight(state);
  let lightRevision = state.revision;
  const spatialLighting = createResidenceLighting(light, { slots: quality === 'low' ? 2 : 4 });
  spatialLighting.attach(view.root); spatialLighting.attach(terrain.root);
  const minY = state.underground ? RESIDENCE_WORLD.minY : RESIDENCE_WORLD.foundationTop;
  const initialCollision = buildResidenceCollision(state);
  const collision = { solids: [...initialCollision.solids, ...view.solarPanels.map(panel => panel.collider)], platforms: [...initialCollision.platforms] };
  const minimap = createPlayableDefinitionMinimap(ui.viewport, collision,
    { minX: RESIDENCE_WORLD.minX, minY, maxX: RESIDENCE_WORLD.maxX, maxY: RESIDENCE_WORLD.height });
  const overlays = createSceneGameOverlays(ui.root.querySelector<HTMLElement>('.residence-toolbar')!, ui.viewport, stage, minimap);
  const weather = createResidenceWeather(stage, () => collision.solids);
  const environment = variant === 'harbor' ? createHarborResidenceEnvironment(homeCenter) : createAiCityEnvironment({ homeCenter });
  stage.scene.add(environment.root, view.root, terrain.root, spatialLighting.root);
  // 视图同步时原地改写这组面板，人物与碰撞持有的引用保持有效。
  const solarPanels = view.solarPanels;
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.minDistance = 8;
  orbit.maxDistance = RESIDENCE_WORLD.width * 6;
  const section: SceneSection = { id: 'residence', title: 'AI住宅', description: '双层能量门住宅', x: RESIDENCE_WORLD.minX, y: minY,
    width: RESIDENCE_WORLD.width, height: RESIDENCE_WORLD.height - minY,
    playerX: spawn.x, playerY: spawn.y, items: [], walkZ: (x, y) => view.walkZ(x, y) };
  let gameplay: ReturnType<typeof createPerspectiveControls> | null = null;
  // 存档模式没有场景世界，天气以下拉框为准（演示模式该下拉框已移除）。
  let weatherMode = context ? context.world.weather : resolveSceneWeatherMode(ui.root.querySelector<HTMLSelectElement>('[data-weather]')!.value);
  let rig: ReturnType<typeof createGrassyRig> | null = null;
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
  const viewAngles = { front: [0, 0], angle: [13, 9], top: [0, 78] } as const;
  let inspectionView: keyof typeof viewAngles = 'front';
  const markView = (preset: string | null): void => {
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.residenceView === preset));
    playViewButton.setAttribute('aria-pressed', String(gameplay?.following === true));
  };
  const overview = (): void => {
    gameplay?.observe();
    syncEditingCamera();
    const height = wholeWorld ? Math.max(32, (RESIDENCE_WORLD.width + 8) / stage.camera.aspect) * 1.2 : Math.max(areaHeight, areaWidth / stage.camera.aspect);
    const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    orbit.target.set(wholeWorld ? (RESIDENCE_WORLD.minX + RESIDENCE_WORLD.maxX) / 2 : areaCenter, wholeWorld ? (RESIDENCE_WORLD.height + minY) / 2 : areaY, 0);
    const yaw = THREE.MathUtils.degToRad(viewAngles[inspectionView][0]);
    const pitch = THREE.MathUtils.degToRad(viewAngles[inspectionView][1]);
    stage.camera.position.set(orbit.target.x + distance * Math.sin(yaw) * Math.cos(pitch),
      orbit.target.y + distance * Math.sin(pitch), distance * Math.cos(yaw) * Math.cos(pitch));
    stage.camera.lookAt(orbit.target);
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
    if (carriers.length > 0) disposeFlyingRoadsterAsset();
    overlays.dispose(); minimap.dispose();
    spatialLighting.dispose();
    ghost?.dispose(); view.dispose(); terrain.dispose(); environment.dispose(); weather.dispose(); rig?.dispose();
    gridGeometry.dispose(); gridMaterial.dispose(); lighting.dispose(); stage.dispose(); if (!context) disposeGrassyAssets(); select.dispose(); ui.dispose();
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
    collision.solids.splice(0, collision.solids.length, ...next.solids, ...solarPanels.map(panel => panel.collider));
    collision.platforms.splice(0, collision.platforms.length, ...next.platforms);
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
    const actionStatus = ui.root.querySelector<HTMLElement>('[data-action-status]')!;
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
    const droneFleet = await loadUtilityDroneFleet(stage.scene);
    if (disposed) { droneFleet.dispose(); return; }
    gameplay = createPerspectiveControls(ui.root, stage, droneFleet, orbit, rig, collision,
      new THREE.Box3(new THREE.Vector3(RESIDENCE_WORLD.minX, minY, -1.5), new THREE.Vector3(RESIDENCE_WORLD.maxX, RESIDENCE_WORLD.height, 1.5)), section, [0, 0], solarPanels, false, { cameraMode: 'game', tuning: TUNING, applyForce: weather.applyToBody, airWind: weather.airWind, carriers,
        world: { time: gameTime, get weather() { return context ? context.world.weather : weatherMode; } } });
    gameplay.hud.attachMap(minimap.root);
    gameplay.select(section);
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
    listen('[data-build]', () => edit(!editing));
    for (const button of viewButtons) button.addEventListener('click', () => {
      inspectionView = button.dataset.residenceView as keyof typeof viewAngles;
      if (gameplay!.following) {
        gameplay!.setViewAngles(viewAngles[inspectionView]);
        markView(inspectionView);
      } else overview();
    }, { signal: events.signal });
    listen('[data-play-view]', () => {
      gameplay!.setViewAngles(viewAngles[inspectionView]);
      syncEditingCamera();
      markView(inspectionView);
    });
    listen('[data-camera]', () => markView(null));
    orbit.addEventListener('start', () => markView(null));
    if (!context) ui.root.querySelector<HTMLSelectElement>('[data-weather]')!.addEventListener('change', event => {
      weatherMode = resolveSceneWeatherMode((event.target as HTMLSelectElement).value);
      weather.setWeather(weatherMode);
    }, { signal: events.signal });
    if (!context) ui.root.querySelector<HTMLSelectElement>('[data-wind]')!.addEventListener('change', event => {
      weather.wind.setMode(resolveWindMode((event.target as HTMLSelectElement).value, 'breeze'));
    }, { signal: events.signal });
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
    travel.addEventListener('change', event => {
      const segment = Number((event.target as HTMLSelectElement).value);
      const point = findSafeResidenceSpawn(state, segment === 0 ? undefined : segment * RESIDENCE_SEGMENT_WIDTH + 43);
      gameplay!.select({ ...section, playerX: point.x, playerY: point.y });
      wholeWorld = false; areaCenter = segment === 0 ? homeCenter : segment * RESIDENCE_SEGMENT_WIDTH + 59;
      areaWidth = segment === 0 ? 34 : 90;
      gameplay!.setFollowing(true); markView(null);
      if (editing) edit(true);
    }, { signal: events.signal });
    for (const layer of AI_CITY_LAYERS) ui.root.querySelector<HTMLInputElement>(`[data-city-layer="${layer.id}"]`)!.addEventListener('change', event => {
      environment.setLayerVisible(layer.id, (event.target as HTMLInputElement).checked);
    }, { signal: events.signal });
    const reflections = ui.root.querySelector<HTMLInputElement>('[data-reflections]')!;
    // 低画质关闭 AO，反射依附 AO，开关无效。
    reflections.disabled = quality === 'low';
    reflections.addEventListener('change', () => stage.postFx.setReflections(reflections.checked), { signal: events.signal });
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
    const draw = (now: number): void => {
      if (disposed || context?.signal.aborted) return;
      try {
        overlays.begin();
        const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, .05));
        previous = now; time += dt;
        worldControls?.advance(dt);
        if (context) { weather.setWeather(context.world.weather); weather.setSettings(context.world.weatherConfig); }
        const world = sampleWorldTime(gameTime);
        const solarAngle = solarTrackingAngle(world.sunDirection);
        for (const panel of solarPanels) panel.sunAngle = solarAngle;
        if (gameplay!.playing && !editing && updateResidenceDoors(state, gameplay!.body)) syncCollision();
        gameplay!.update(dt); orbit.update();
        if (lightRevision !== state.revision) {
          spatialLighting.update(stage.renderer, light.sync());
          lightRevision = state.revision;
        }
        if (terrain.update(stage.camera)) spatialLighting.attach(terrain.root);
        const atmosphere = weather.update(time, dt, world);
        lighting.setWorldTime(world, atmosphere);
        spatialLighting.setFrame(stage.camera, world.night, time, lighting.skyTint); view.update(time, gameplay!.body);
        if (ghost?.root.visible) ghost.update(time, null);
        environment.setWeather(atmosphere); environment.setNightFactor(world.night); environment.setCamera(stage.camera); environment.update(time);
        lighting.update(); minimap.update(gameplay!.body.x, gameplay!.body.y); overlays.render();
        frame = requestAnimationFrame(draw);
      } catch (error) {
        if (firstFrame) throw error;
        dispose(); onError(error);
      }
    };
    draw(performance.now());
    firstFrame = false;
  } catch (error) { dispose(); throw error; }
}
