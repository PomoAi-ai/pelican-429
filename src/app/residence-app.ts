import { createWorldClock, sampleWorldTime } from '../core/world-clock.ts';
import { solarTrackingAngle } from '../physics/solar-panel.ts';
import { bindWorldControls } from '../ui/world-controls.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AI_CITY_LAYERS, BUILDING_SCENE_TUNING } from '../config/ai-city-look.ts';
import { getResidenceResource, RESIDENCE_RESOURCES, RESIDENCE_SEGMENT_WIDTH, RESIDENCE_WORLD } from '../config/residence.ts';
import { resolveSceneWeatherMode, resolveWindMode } from '../config/weather-rules.ts';
import { buildResidenceCollision, checkResidencePlacement, createResidence, findSafeResidenceSpawn, placeResidence, removeResidence, updateResidenceDoors, type ResidenceResult } from '../sim/residence.ts';
import { createStage, attachStage } from '../render/stage.ts';
import { createResidenceView } from '../render/residence-view.ts';
import { createAiCityEnvironment } from '../render/ai-city-environment.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createResidenceWeather } from '../render/residence-weather.ts';
import { createGrassyRig, disposeGrassyAssets, loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { compileForStage, warmUpStage } from '../render/warm-up.ts';
import { createResidenceHud } from '../ui/residence-hud.ts';
import { createPerspectiveControls } from './perspective-controls.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { loadResidence, saveResidence } from './residence-save.ts';
import { TUNING } from '../config/tuning.ts';
import { waitSceneResource, yieldScene, type SceneMountContext } from './scene-mount.ts';
import type { SceneSection } from './definition-scene-layout.ts';

export function startResidence(mode: 'saved', onError: (error: unknown) => void): Promise<void> {
  return mountResidence(mode, onError);
}

export function mountResidenceDemo(context: SceneMountContext): Promise<void> {
  return mountResidence('demo', context.reportError, context);
}

async function mountResidence(mode: 'demo' | 'saved', onError: (error: unknown) => void, context?: SceneMountContext): Promise<void> {
  const example = createResidence();
  const state = mode === 'demo' ? example : loadResidence(window.localStorage) ?? example;
  const needed = new Set([...example.placements, ...state.placements].map(item => item.resourceId));
  needed.add('ceramic-A');
  const spawn = findSafeResidenceSpawn(state);
  const ui = createResidenceHud(RESIDENCE_RESOURCES.filter(resource => needed.has(resource.id)), mode, context?.root);
  const select = ui.root.querySelector<HTMLSelectElement>('[data-resource]')!;
  const travel = ui.root.querySelector<HTMLSelectElement>('[data-travel]')!;
  const tool = ui.root.querySelector<HTMLSelectElement>('[data-tool]')!;
  const buildButton = ui.root.querySelector<HTMLButtonElement>('[data-build]')!;
  const playButton = ui.root.querySelector<HTMLButtonElement>('[data-play]')!;
  const cameraButton = ui.root.querySelector<HTMLButtonElement>('[data-camera]')!;
  const playViewButton = ui.root.querySelector<HTMLButtonElement>('[data-play-view]')!;
  const viewButtons = ui.root.querySelectorAll<HTMLButtonElement>('[data-residence-view]');
  const status = ui.root.querySelector<HTMLElement>('[data-build-status]')!;
  const saveStatus = ui.root.querySelector<HTMLElement>('[data-save-status]')!;
  document.title = mode === 'demo' ? 'AI 住宅 · 游戏演示' : 'AI 住宅 · 建造与游玩';
  context?.progress('装配住宅');
  if (context) await yieldScene(context.signal);
  const stage = context
    ? attachStage(ui.viewport, context.renderer, BUILDING_SCENE_TUNING, { quality: 'high', antialias: 'smaa' })
    : createStage(ui.viewport, BUILDING_SCENE_TUNING, { quality: 'high', antialias: 'smaa' });
  const lighting = createAiCityLighting(stage);
  lighting.setEnabled(true);
  const worldClock = context ? context.world.clock : createWorldClock();
  const worldControls = context ? null : bindWorldControls(ui.root, worldClock);
  stage.canvas.setAttribute('aria-label', 'AI住宅游戏画面，建造模式下点击放置选中构件');
  const entrance = state.placements.filter(item => item.resourceId === 'door-left' || item.resourceId === 'door-right').sort((a, b) => a.y - b.y)[0];
  const homeCenter = entrance ? entrance.x + (entrance.resourceId === 'door-left' ? 8.5 : -8.5) : spawn.x;
  stage.camera.far = RESIDENCE_WORLD.width * 8;
  stage.camera.updateProjectionMatrix();
  let view = createResidenceView(state);
  const initialCollision = buildResidenceCollision(state);
  const collision = { solids: [...initialCollision.solids, ...view.solarPanels.map(panel => panel.collider)], platforms: [...initialCollision.platforms] };
  const weather = createResidenceWeather(stage, () => collision.solids);
  const environment = createAiCityEnvironment({ homeCenter, wind: weather.wind });
  stage.scene.add(environment.root, view.root);
  const solarPanels = [...view.solarPanels];
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.minDistance = 8;
  orbit.maxDistance = RESIDENCE_WORLD.width * 6;
  const section: SceneSection = { id: 'residence', title: 'AI住宅', description: '双层能量门住宅', x: RESIDENCE_WORLD.minX, y: 0,
    width: RESIDENCE_WORLD.width, height: RESIDENCE_WORLD.height,
    playerX: spawn.x, playerY: spawn.y, items: [], walkZ: (x, y) => view.walkZ(x, y) };
  let gameplay: ReturnType<typeof createPerspectiveControls> | null = null;
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
  const viewAngles = { front: [0, 0], angle: [13, 9], top: [0, 78] } as const;
  let inspectionView: keyof typeof viewAngles = 'front';
  const markView = (preset: string | null): void => {
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.residenceView === preset));
    playViewButton.setAttribute('aria-pressed', String(gameplay?.following === true));
  };
  const overview = (): void => {
    gameplay?.observe();
    syncEditingCamera();
    const height = wholeWorld ? Math.max(32, (RESIDENCE_WORLD.width + 8) / stage.camera.aspect) * 1.2 : Math.max(18, areaWidth / stage.camera.aspect);
    const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    orbit.target.set(wholeWorld ? (RESIDENCE_WORLD.minX + RESIDENCE_WORLD.maxX) / 2 : areaCenter, wholeWorld ? 10 : 7, 0);
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
  for (let x = RESIDENCE_WORLD.minX; x <= RESIDENCE_WORLD.maxX; x++) gridPoints.push(x, 1.5, 1.08, x, RESIDENCE_WORLD.height, 1.08);
  for (let y = 2; y <= RESIDENCE_WORLD.height; y++) gridPoints.push(RESIDENCE_WORLD.minX, y, 1.08, RESIDENCE_WORLD.maxX, y, 1.08);
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
    ghost?.dispose(); view.dispose(); environment.dispose(); weather.dispose(); rig?.dispose();
    gridGeometry.dispose(); gridMaterial.dispose(); lighting.dispose(); stage.dispose(); if (!context) disposeGrassyAssets(); ui.dispose();
  };
  if (context) context.onDispose(dispose);
  else window.addEventListener('pagehide', dispose, { once: true, signal: events.signal });
  const save = (): void => {
    if (mode === 'demo') {
      saveStatus.textContent = '演示修改仅本次有效 · 刷新后恢复示例';
      return;
    }
    try {
      saveResidence(window.localStorage, state);
      saveStatus.textContent = '已保存到本机';
      saveStatus.dataset.error = 'false';
    } catch (error) {
      saveStatus.textContent = `未保存：${error instanceof Error ? error.message : String(error)}。当前布局仍保留，请重试保存。`;
      saveStatus.dataset.error = 'true';
    }
  };
  const updateCount = (): void => { ui.root.querySelector<HTMLElement>('[data-count]')!.textContent = `${state.placements.length} 个构件`; };
  const syncCollision = (): void => {
    const next = buildResidenceCollision(state);
    // 人物、骑行和弹体持有这些数组，不能替换数组引用。
    collision.solids.splice(0, collision.solids.length, ...next.solids, ...solarPanels.map(panel => panel.collider));
    collision.platforms.splice(0, collision.platforms.length, ...next.platforms);
  };
  const rebuild = (): void => {
    view.dispose();
    view = createResidenceView(state);
    stage.scene.add(view.root);
    solarPanels.splice(0, solarPanels.length, ...view.solarPanels);
    syncCollision(); updateCount(); save();
  };
  const feedback = (message: string, error = false): void => {
    status.textContent = message;
    status.dataset.error = String(error);
    const actionStatus = ui.root.querySelector<HTMLElement>('[data-action-status]')!;
    actionStatus.textContent = message;
    actionStatus.dataset.error = String(error);
  };
  const apply = (result: ResidenceResult): void => { feedback(result.message, !result.ok); if (result.ok) rebuild(); };
  const updateGhost = (): void => {
    if (!ghost) return;
    ghost.root.visible = editing && pointerInside && tool.value === 'place';
    ghost.root.position.set(position.x, position.y, .015);
    if (ghost.root.visible) {
      const result = checkResidencePlacement(state, select.value, position.x, position.y, gameplay!.body);
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
    ui.root.querySelector<HTMLElement>('[data-resource-note]')!.textContent = `${resource.label} · 占位 ${resource.width} × ${resource.height} 格。拆除只选择与此构件相同的一层。`;
    ghost?.dispose();
    ghost = createResidenceView({ placements: [{ id: 0, resourceId: resource.id, x: 0, y: 0, ...resource.kind === 'door' ? { open: false } : {} }], nextId: 1, revision: 0 }, { lighting: false });
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
    context?.progress('加载角色', 0, 1);
    const grassy = loadGrassyAsset('game');
    if (context) await waitSceneResource(grassy, context.signal);
    else await grassy;
    context?.signal.throwIfAborted();
    context?.progress('加载角色', 1, 1);
    if (disposed) return;
    rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(window.localStorage).current());
    rig.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.stencilWrite = true; material.stencilRef = 1; material.stencilZPass = THREE.ReplaceStencilOp;
      }
    });
    rig.root.position.set(section.playerX, section.playerY, 0);
    animateGrassy(rig, 'idle', 0, 0, null);
    stage.scene.add(rig.root);
    await compileForStage(stage, rig.root);
    context?.signal.throwIfAborted();
    if (disposed) return;
    gameplay = createPerspectiveControls(ui.root, stage, orbit, rig, collision,
      new THREE.Box3(new THREE.Vector3(RESIDENCE_WORLD.minX, 0, -1), new THREE.Vector3(RESIDENCE_WORLD.maxX, RESIDENCE_WORLD.height, 1)), section, [0, 0], solarPanels, false, { cameraMode: 'game', tuning: TUNING, applyForce: weather.applyToBody, airWind: weather.airWind });
    gameplay.select(section);
    markView(null);
    environment.setCamera(stage.camera);
    await environment.prepare(context ? context.signal : events.signal, progress => context?.progress('装配城市与空中交通', progress.completed, progress.total));
    context?.progress('准备光照与首帧');
    await warmUpStage(stage, [], context?.signal);
    updateCount(); chooseResource();
    saveStatus.textContent = mode === 'demo' ? '演示修改仅本次有效 · 刷新后恢复示例' : '本机独立存档 · 修改后自动保存';
    const listen = (selector: string, action: () => void): void => {
      ui.root.querySelector(selector)!.addEventListener('click', action, { signal: events.signal });
    };
    listen('[data-build]', () => edit(!editing));
    for (const button of viewButtons) button.addEventListener('click', () => {
      inspectionView = button.dataset.residenceView as keyof typeof viewAngles;
      overview();
    }, { signal: events.signal });
    listen('[data-play-view]', () => {
      if (editing) edit(false);
      gameplay!.setPlaying(true);
      gameplay!.setFollowing(true);
      markView(null);
    });
    listen('[data-camera]', () => markView(null));
    orbit.addEventListener('start', () => markView(null));
    if (!context) ui.root.querySelector<HTMLSelectElement>('[data-weather]')!.addEventListener('change', event => {
      weather.setWeather(resolveSceneWeatherMode((event.target as HTMLSelectElement).value));
    }, { signal: events.signal });
    if (!context) ui.root.querySelector<HTMLSelectElement>('[data-wind]')!.addEventListener('change', event => {
      weather.wind.setMode(resolveWindMode((event.target as HTMLSelectElement).value, 'breeze'));
    }, { signal: events.signal });
    listen('[data-overview]', () => { travel.value = '0'; wholeWorld = false; areaCenter = homeCenter; areaWidth = 34; overview(); });
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
    select.addEventListener('change', chooseResource, { signal: events.signal });
    tool.addEventListener('change', updateGhost, { signal: events.signal });
    stage.canvas.addEventListener('pointermove', event => { pointerInside = true; if (editing && aim(event)) updateGhost(); }, { signal: events.signal });
    stage.canvas.addEventListener('pointerleave', () => { pointerInside = false; updateGhost(); }, { signal: events.signal });
    stage.canvas.addEventListener('pointerdown', event => {
      if (!editing || event.button !== 0 || !aim(event)) return;
      if (tool.value === 'place') apply(placeResidence(state, select.value, position.x, position.y, gameplay!.body));
      else {
        const layer = getResidenceResource(select.value).layer;
        const target = raycaster.intersectObject(view.root, true).find(item => {
          const p = state.placements.find(p => p.id === item.object.userData.residenceId);
          return p && getResidenceResource(p.resourceId).layer === layer;
        });
        if (target) apply(removeResidence(state, target.object.userData.residenceId as number));
        else feedback('这里没有当前层的构件');
      }
    }, { signal: events.signal });
    let previous: number | null = null;
    let time = 0;
    let firstFrame = true;
    const draw = (now: number): void => {
      if (disposed || context?.signal.aborted) return;
      try {
        const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, .05));
        previous = now; time += dt;
        worldClock.update(dt); worldControls?.update();
        if (context) { weather.setWeather(context.world.weather); weather.setSettings(context.world.weatherConfig); }
        const world = sampleWorldTime(worldClock.hour);
        const solarAngle = solarTrackingAngle(world.sunDirection);
        for (const panel of solarPanels) panel.sunAngle = solarAngle;
        if (gameplay!.playing && !editing && updateResidenceDoors(state, gameplay!.body)) syncCollision();
        gameplay!.update(dt); orbit.update();
        const atmosphere = weather.update(time, dt, world);
        lighting.setWorldTime(world, atmosphere);
        view.setLighting(stage.camera, world.night); view.update(time);
        if (ghost?.root.visible) ghost.update(time);
        environment.setWeather(atmosphere); environment.setNightFactor(world.night); environment.setCamera(stage.camera); environment.update(time);
        lighting.update(); stage.render();
        frame = requestAnimationFrame(draw);
      } catch (error) {
        if (firstFrame) throw error;
        dispose(); onError(error);
      }
    };
    draw(performance.now());
    firstFrame = false;
    if (!context) document.getElementById('loading')!.hidden = true;
  } catch (error) { dispose(); throw error; }
}
