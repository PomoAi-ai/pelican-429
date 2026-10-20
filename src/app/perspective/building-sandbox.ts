import { createResourceThumbnailRenderer } from '../../render/resource/resource-thumbnail.ts';
import * as THREE from 'three';
import { pieceLabel, residenceMessage } from '../residence/residence-text.ts';
import { RESIDENCE_RESOURCES, RESIDENCE_SUN, RESIDENCE_WORLD, getResidenceResource } from '../../config/residence.ts';
import { TILE_SHAPE_DEFINITIONS, type DefinitionDepthMode } from '../../config/definition-kit.ts';
import { BUILDING_SCENE_TUNING } from '../../config/ai-city-look.ts';
import { eraseBuildingBrush, buildingBrushLine, paintBuilding, checkBuildingPaint } from '../../sim/building-brush.ts';
import { buildingItemAt, buildingItemsIn, createBuildingState, placeBuilding, removeBuilding, toggleDoor, type BuildingItem, type BuildingPlacement } from '../../sim/building.ts';
import { solarTrackingAngle } from '../../physics/solar-panel.ts';
import { mapLevel } from '../../sim/definition-world.ts';
import { createSimWorld } from '../../sim/sim-world.ts';
import { createFluidMap } from '../../world/fluid-map.ts';
import { cityLightRules, createWorldLightField } from '../../world/light-field-tiles.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { SUBCELLS } from '../../world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_PAVING } from '../../world/tile-types.ts';
import { createCityLighting } from '../../render/stage/light-field-city.ts';
import { createLightFieldAtlas, GAME_LIGHT_SLOTS } from '../../render/stage/light-field-atlas.ts';
import { createBuildingLayerView, createBuildingPreview } from '../../render/building/building-layer-view.ts';
import { createPieceView } from '../../render/tile/piece-view.ts';
import { createDefinitionKit } from '../../render/building/definition-kit.ts';
import { createResourcePicker } from '../../ui/panels/resource-picker.tsx';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import { createBuildingFieldStage } from '../workspace/building-field-stage.ts';
import { createSceneViewControls, type SceneViewAngle } from '../../ui/panels/scene-view-controls.tsx';
import type { SceneMountContext } from '../workspace/scene-mount.ts';
import { t } from '../../config/i18n.ts';
import '../../ui/hud/building-sandbox.css';

/** 自由场地：64 × 36 格，第 1 行是固定基底（只画不建，地表 1.5 格）；页面切换保留，刷新后清空。 */
const bounds = { minX: 0, width: 64 };
const FIELD = { x: 0, y: 0, w: bounds.width, h: 37 };
const state = createBuildingState(createTileMap(FIELD.w, FIELD.h, DEFAULT_TILES),
  { minX: 0, maxX: bounds.width, bottom: 1, top: 36, foundationTop: 1, reserved: null }, solarTrackingAngle(RESIDENCE_SUN));
// 不可编辑的第 0 行铺街面板（不算建造构件、块视图不画，基底外观由下面的定义构件画）：模拟世界的地面与遮雨都落在这一行顶上。
for (let x = 0; x < FIELD.w; x++) state.map.set(x, 0, TILE_PAVING);
const allItems = (): BuildingItem[] => buildingItemsIn(state, 0, 0, FIELD.w, FIELD.h);

function createPanel(): HTMLElement {
  const page = document.createElement('section');
  page.className = 'building-sandbox';
  page.innerHTML = `<div class="room-preview-toolbar building-toolbar">
    <button type="button" data-tool="normal" aria-pressed="true">${t('普通')}</button>
    <button type="button" data-tool="place" aria-pressed="false">${t('铺设')}</button>
    <button type="button" data-tool="erase" aria-pressed="false">${t('清理刷')}</button>
    <label>${t('刷子')} <select data-brush aria-label="${t('清理刷大小')}"><option value="0">${t('单件')}</option><option value="0.5">${t('半格')}</option><option value="1">${t('1 格')}</option><option value="3">${t('3 格')}</option><option value="5">${t('5 格')}</option></select></label>
    <button type="button" data-clear>${t('一键清理')}</button><button type="button" data-undo disabled>${t('撤销清理')}</button>
    <span data-scene-view-controls></span>
    <button type="button" data-zoom="0.8" aria-label="${t('放大场地')}">${t('放大 ＋')}</button><button type="button" data-zoom="1.25" aria-label="${t('缩小场地')}">${t('缩小 −')}</button><button type="button" data-home>${t('重置镜头')}</button><span data-count></span></div>
    <div class="building-layout"><aside class="building-palette">
    <h2>${t('材质与形状')}</h2><div data-resource-picker></div>
    <label data-depth-label>${t('砖块深度')}<select data-depth aria-label="${t('砖块深度')}"><option value="normal">${t('普通 · 深 2 格')}</option><option value="deep">${t('加深 · 深 3 格')}</option></select></label>
    </aside><div class="building-canvas"><p class="building-instructions">${t('普通模式 · 鼠标点击不修改场地 · 右键拖动平移 · 中键旋转 · 滚轮缩放')}</p>
    <p class="building-feedback" role="status" data-status>${t('选择构件后点击格子铺设')}</p></div></div>
    <footer>${t('64 × 36 格 · 基底高 1.5 格，先用上半砖 C 找平至 2 格 · 本页切换保留，刷新后清空；不会改动住宅存档。')}</footer>`;
  return page;
}

export async function mountBuildingSandbox(context: SceneMountContext): Promise<void> {
  const page = createPanel(); context.root.append(page);
  context.onDispose(() => page.remove());
  context.attachToolbar(page.querySelector<HTMLElement>('.building-toolbar')!);
  const viewport = page.querySelector<HTMLElement>('.building-canvas')!;
  // 场地天气跑在同一张格子地图的模拟世界上（遮雨按格子实时算）。
  const world = createSimWorld({ level: mapLevel(state.map, { x: 1, y: 1 }) });
  context.onDispose(() => world.fluid.dispose());
  const field = createBuildingFieldStage(context, viewport, world);
  const { stage, orbit } = field;
  const viewControls = createSceneViewControls(page.querySelector<HTMLElement>('[data-scene-view-controls]')!, { presetsOnly: true });
  context.onDispose(viewControls.dispose);
  const setView = (angle: SceneViewAngle): void => { field.setView(angle); viewControls.set({ preset: angle }); };
  // 场地初始为斜视；预设只发视角动作，手动转动镜头后不再对应任何预设。
  viewControls.set({ preset: 'angle' });
  viewControls.on((action) => setView(action as SceneViewAngle), context.signal);
  orbit.addEventListener('start', () => viewControls.set({ preset: null }));
  const floor = createDefinitionKit({ style: 'ai-city' });
  floor.root.scale.z = -1;
  for (let x = bounds.minX; x < bounds.minX + bounds.width; x++) floor.solid('B', x, 1, 'ceramic');
  stage.scene.add(floor.root); context.onDispose(() => floor.dispose());
  const gridVertices: number[] = [];
  for (let x = 0; x <= bounds.width; x++) gridVertices.push(x, 1.5, 1.53, x, 36, 1.53);
  for (let y = 2; y <= 36; y++) gridVertices.push(0, y, 1.53, bounds.width, y, 1.53);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridVertices, 3)),
    new THREE.LineBasicMaterial({ color: '#6b8e9e', transparent: true, opacity: .22, depthWrite: false }));
  stage.scene.add(grid); context.onDispose(() => { grid.geometry.dispose(); grid.material.dispose(); });
  // 与城区同一套块视图、建筑层与城区光场（光场只算这块小地图）。
  const pieces = createPieceView(state.map);
  const view = createBuildingLayerView(state.map, state);
  const light = createWorldLightField({ map: state.map, fluid: createFluidMap(state.map), trees: [], decay: BUILDING_SCENE_TUNING.render.lighting.lightMap,
    rules: cityLightRules(state.site.foundationTop * SUBCELLS) });
  const atlas = createLightFieldAtlas(light, { slots: GAME_LIGHT_SLOTS, occlusion: true });
  const spatialLighting = createCityLighting(light, atlas, { slots: field.quality === 'low' ? 2 : 4, undergroundTop: state.site.foundationTop });
  spatialLighting.attach(floor.root);
  context.onDispose(() => { spatialLighting.dispose(); atlas.dispose(); light.dispose(); });
  stage.scene.add(pieces.root, view.root, spatialLighting.root); context.onDispose(() => { pieces.dispose(); view.dispose(); });
  let ghost: ReturnType<typeof createBuildingPreview>;
  context.onDispose(() => ghost.dispose());
  const status = page.querySelector<HTMLElement>('[data-status]')!;
  const picker = createResourcePicker(RESIDENCE_RESOURCES, createResourceThumbnailRenderer, 'ceramic-C');
  page.querySelector('[data-resource-picker]')!.append(picker.root);
  context.onDispose(() => picker.dispose());
  const depth = page.querySelector<HTMLSelectElement>('[data-depth]')!;
  const brush = page.querySelector<HTMLSelectElement>('[data-brush]')!;
  let selected = getResidenceResource('ceramic-C');
  let tool: 'normal' | 'place' | 'erase' = 'normal';
  let dragging = false;
  let position = { x: 0, y: 2 };
  let lastPosition = position;
  let inside = false;
  let hitItem: BuildingItem | null = null;
  let previousClear: BuildingPlacement[] | null = null;
  const undo = page.querySelector<HTMLButtonElement>('[data-undo]')!;
  const depthMode = (): DefinitionDepthMode => selected.kind === 'solid' && depth.value === 'deep' ? 'deep' : 'normal';
  const step = (): number => tool === 'erase' ? Number(brush.value) === 0 ? .5 : Math.min(1, Number(brush.value)) : ['solid', 'wall', 'glazing', 'door'].includes(selected.kind) ? 1 : .5;
  const report = (message: string, error = false): void => { status.textContent = message; status.dataset.error = String(error); };
  const count = (): void => { page.querySelector('[data-count]')!.textContent = t('{n} 个构件').replace('{n}', String(allItems().length)); };
  const valid = () => position.x >= bounds.minX && position.x + selected.width <= bounds.minX + bounds.width;
  const eraser = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, .02)), new THREE.LineBasicMaterial({ color: '#ffa27e', depthTest: false }));
  eraser.renderOrder = 2000; eraser.visible = false; stage.scene.add(eraser);
  context.onDispose(() => { eraser.geometry.dispose(); eraser.material.dispose(); });
  const hover = (): void => {
    if (tool === 'normal') {
      eraser.visible = ghost.root.visible = false;
      report(t('普通模式 · 鼠标点击不修改场地 · 右键平移 · 中键旋转 · 滚轮缩放'));
      return;
    }
    eraser.visible = inside;
    const width = tool === 'erase' ? Number(brush.value) || .5 : selected.width;
    const height = tool === 'erase' ? Number(brush.value) || .5 : selected.height;
    eraser.scale.set(width, height, 1);
    eraser.position.set(position.x + (tool === 'erase' ? Math.min(1, width) / 2 : width / 2), position.y + (tool === 'erase' ? Math.min(1, height) / 2 : height / 2), 1.53);
    eraser.material.color.set(tool === 'erase' ? '#ffa27e' : '#b7e587');
    ghost.root.visible = inside && tool === 'place';
    ghost.root.position.set(position.x, position.y, .025);
    if (!inside) return;
    if (tool === 'erase' && Number(brush.value) === 0) {
      const placement = hitItem;
      eraser.visible = placement !== undefined;
      if (!placement) { report(t('单件清理 · 指向构件以查看完整选区')); return; }
      const resource = getResidenceResource(placement.resourceId);
      let left = placement.x, bottom = placement.y, width = resource.width, height = resource.height;
      if (resource.kind === 'solid') {
        const points = TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.points;
        const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
        left += Math.min(...xs); bottom += Math.min(...ys);
        width = Math.max(...xs) - Math.min(...xs); height = Math.max(...ys) - Math.min(...ys);
      } else if (resource.kind === 'platform') {
        left += resource.platformWidth === 'right' ? .5 : 0;
        bottom += .3; width = resource.platformWidth === 'full' ? 1 : .5; height = .2;
      }
      eraser.scale.set(width, height, 1);
      eraser.position.set(left + width / 2, bottom + height / 2, hit.z + .02);
      report(`${t('单件清理')} · ${pieceLabel(resource)} · ${t('{w} × {h} 格').replace('{w}', String(width)).replace('{h}', String(height))} · ${t('点击移除整件')}`);
      return;
    }
    if (tool === 'erase') { report(`${t('清理刷 {n} × {n} 格').replaceAll('{n}', brush.value)} · ${position.x}, ${position.y} · ${t('清除覆盖范围内的整件构件')}`); return; }
    const result = valid() ? checkBuildingPaint(state, selected.id, position.x, position.y, depthMode(), RESIDENCE_WORLD.groundTop)
      : { ok: false, message: '超出自由场地范围' };
    report(`${pieceLabel(selected)} · ${position.x}, ${position.y} · ${residenceMessage(result.message)}`, !result.ok);
    ghost.root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material instanceof THREE.MeshStandardMaterial) material.emissive.set(result.ok ? '#167878' : '#ba1832');
      }
    });
  };
  const choose = (id: string): void => {
    selected = getResidenceResource(id);
    page.querySelector<HTMLElement>('[data-depth-label]')!.hidden = selected.kind !== 'solid';
    ghost?.dispose();
    ghost = createBuildingPreview(id, depthMode());
    ghost.root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = false;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        material.transparent = true; material.opacity = .45; material.depthWrite = false;
      }
    });
    stage.scene.add(ghost.root); hover();
  };
  picker.root.addEventListener('change', () => choose(picker.value), { signal: context.signal });
  brush.addEventListener('change', hover, { signal: context.signal });
  depth.addEventListener('change', () => choose(selected.id), { signal: context.signal });
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.53);
  const aim = (event: PointerEvent): boolean => {
    const rect = stage.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, stage.camera);
    const aimed = ray.ray.intersectPlane(plane, hit);
    // 单件清理按前后层次取指针处的构件：物件在墙与砖之前。
    hitItem = !aimed || tool !== 'erase' || Number(brush.value) !== 0 ? null
      : (['furniture', 'fixture', 'solid', 'wall'] as const).reduce<BuildingItem | null>((found, layer) => found ?? buildingItemAt(state, hit.x, hit.y, layer), null);
    if (!aimed || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)
      || hit.x < bounds.minX || hit.x >= bounds.minX + bounds.width || hit.y < 1 || hit.y >= 36) {
      dragging = false; inside = false; ghost.root.visible = false; eraser.visible = false;
      report(t('已超出自由场地：横向 0 至 64 格，高度 1 至 36 格；请在场地内重新按下开始铺设'));
      return false;
    }
    position = { x: Math.floor(hit.x / step()) * step(), y: Math.floor(hit.y / step()) * step() }; return true;
  };
  const paint = (): void => {
    const revision = state.revision;
    if (tool === 'erase' && Number(brush.value) === 0) {
      if (hitItem !== null) removeBuilding(state, hitItem);
      hitItem = null;
    }
    else for (const point of buildingBrushLine(lastPosition, position, step())) {
      if (tool === 'erase') eraseBuildingBrush(state, point.x, point.y, Number(brush.value));
      else if (point.x >= bounds.minX && point.x + selected.width <= bounds.minX + bounds.width) {
        const result = paintBuilding(state, selected.id, point.x, point.y, depthMode(), RESIDENCE_WORLD.groundTop);
        report(residenceMessage(result.message), !result.ok);
      }
    }
    lastPosition = position;
    if (revision !== state.revision) { previousClear = null; undo.disabled = true; count(); }
  };
  stage.canvas.addEventListener('pointerdown', event => {
    if (tool === 'normal' || event.button !== 0 || !aim(event)) return;
    inside = true; dragging = true; lastPosition = position;
    stage.canvas.setPointerCapture(event.pointerId); paint(); hover();
  }, { signal: context.signal });
  stage.canvas.addEventListener('pointermove', event => {
    if (tool === 'normal') return;
    inside = true;
    if (!aim(event)) return;
    if (dragging && (position.x !== lastPosition.x || position.y !== lastPosition.y)) paint();
    hover();
  }, { signal: context.signal });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.canvas.addEventListener(name, () => { dragging = false; }, { signal: context.signal });
  stage.canvas.addEventListener('pointerleave', () => { inside = false; ghost.root.visible = false; eraser.visible = false; }, { signal: context.signal });
  for (const button of page.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.addEventListener('click', () => {
    dragging = false;
    tool = button.dataset.tool as typeof tool;
    hitItem = null;
    page.querySelector<HTMLElement>('.building-instructions')!.textContent = t(tool === 'normal'
      ? '普通模式 · 鼠标点击不修改场地 · 右键拖动平移 · 中键旋转 · 滚轮缩放'
      : '无玩家 · 左键铺设 / 同格换材质形状 · 右键拖动平移 · 中键旋转 · 滚轮缩放');
    for (const other of page.querySelectorAll<HTMLButtonElement>('[data-tool]')) other.setAttribute('aria-pressed', String(other === button));
    hover();
  }, { signal: context.signal });
  for (const button of page.querySelectorAll<HTMLButtonElement>('[data-zoom]')) button.addEventListener('click', () => {
    const offset = stage.camera.position.clone().sub(orbit.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * Number(button.dataset.zoom), orbit.minDistance, orbit.maxDistance));
    stage.camera.position.copy(orbit.target).add(offset); orbit.update();
  }, { signal: context.signal });
  page.querySelector('[data-home]')!.addEventListener('click', () => { orbit.target.set(bounds.width / 2, 8, 0); setView('angle'); }, { signal: context.signal });
  page.querySelector('[data-clear]')!.addEventListener('click', () => {
    const items = allItems();
    if (!items.length) return;
    previousClear = items.map(({ resourceId, x, y, depthMode, open }) => ({ resourceId, x, y, depthMode, open }));
    for (const item of items) removeBuilding(state, item);
    undo.disabled = false; count(); report(t('已清空全部自建构件，可以撤销清理'));
  }, { signal: context.signal });
  undo.addEventListener('click', () => {
    // 清理前的布局整体合法，按原样逐件放回。
    for (const item of previousClear!) {
      const result = placeBuilding(state, item.resourceId, item.x, item.y, null, item.depthMode);
      if (!result.ok) throw new Error(`撤销清理失败：${item.resourceId} (${item.x}, ${item.y})：${result.message}`);
      if (item.open) toggleDoor(state, [...state.specials.values()].at(-1)!, null);
    }
    previousClear = null; undo.disabled = true; count(); report(t('已恢复清理前的构件'));
  }, { signal: context.signal });
  choose(picker.value); count();
  context.progress(t('准备自由搭建场'));
  await warmUpStage(stage, [], context.signal);
  context.signal.throwIfAborted();
  field.onFrame((time, _dt, world) => {
    // 新建的块与建筑网格接入城区光场着色。
    if (pieces.update(FIELD) > 0) spatialLighting.attach(pieces.root);
    if (view.update(time, null)) spatialLighting.attach(view.root);
    atlas.focus(FIELD);
    atlas.apply(light.sync());
    spatialLighting.setFrame(stage.camera, world.night, time, field.daylight.skyTint);
    if (ghost.root.visible) ghost.update(time);
  });
}
