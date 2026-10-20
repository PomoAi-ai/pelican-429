/**
 * 城区建造功能（游戏内插件）：建造面板、建造幽灵、放置/拆除、自动存档，以及主世界城区右端去原野的出口。
 * 建造时世界在 stepSim 内冻结（城区建造模式），放置与拆除作为命令在下一 tick 应用；镜头仍是游戏镜头。
 */
import * as THREE from 'three';
import type { DefinitionDepthMode } from '../../config/definition-kit.ts';
import { t } from '../../config/i18n.ts';
import { getResidenceResource, RESIDENCE_RESOURCES } from '../../config/residence.ts';
import type { Vec2 } from '../../core/math.ts';
import { createBuildingPreview } from '../../render/building/building-layer-view.ts';
import { createResourceThumbnailRenderer } from '../../render/resource/resource-thumbnail.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import { buildingItemAt, checkBuilding, type BuildingResult } from '../../sim/building.ts';
import { getPlayer, type SimWorld } from '../../sim/sim-world.ts';
import { gameHost } from '../../ui/hud/mobile-game-viewport.ts';
import { createResidenceHud } from '../../ui/hud/residence-hud.ts';
import { createResourcePicker } from '../../ui/panels/resource-picker.tsx';
import { worldMapSearch } from '../game/free-world-navigation.ts';
import type { GameFeature } from '../game/frame-loop.ts';
import { pieceLabel, residenceMessage } from '../residence/residence-text.ts';
import { saveCity } from './city-save.ts';
import '../../ui/hud/residence.css';

/** 建造改动后多久写入存档（秒）；页面隐藏与离开时另外立即保存。 */
const SAVE_DELAY = 1;
/** 离城区右端多少格内提示去原野。 */
const WILDS_HINT = 12;

export interface CityFeatureOptions {
  readonly world: SimWorld;
  readonly stage: Stage<StageRenderer>;
  readonly cameraRig: CameraRig;
  /** 进出建造模式与离开城区时释放按住的输入。 */
  readonly releaseInput: () => void;
  /** 本次读档删除了旧住宅存档。 */
  readonly discarded: boolean;
}

export interface CityFeature extends GameFeature {
  readonly building: boolean;
  setBuilding(enabled: boolean): void;
  persist(): void;
  dispose(): void;
}

export function createCityFeature(o: CityFeatureOptions): CityFeature {
  const { world, stage, cameraRig } = o;
  const city = world.city!;
  const state = city.building;
  const canvas = stage.canvas;
  const ui = createResidenceHud(RESIDENCE_RESOURCES);
  const picker = createResourcePicker(RESIDENCE_RESOURCES, createResourceThumbnailRenderer);
  ui.root.querySelector('[data-resource-picker]')!.append(picker.root);
  const depthSelect = ui.root.querySelector<HTMLSelectElement>('[data-depth-mode]')!;
  const tool = ui.root.querySelector<HTMLSelectElement>('[data-tool]')!;
  const status = ui.root.querySelector<HTMLElement>('[data-build-status]')!;
  const saveStatus = ui.root.querySelector<HTMLElement>('[data-save-status]')!;
  const actionStatus = ui.root.querySelector<HTMLElement>('[data-action-status]')!;
  if (o.discarded) saveStatus.textContent = t('旧住宅存档不再兼容，已丢弃；城区从默认布局开始。');
  const events = new AbortController();
  let building = false;
  let depthMode: DefinitionDepthMode = 'normal';
  let ghost: ReturnType<typeof createBuildingPreview> | null = null;
  let pointer: Vec2 | null = null;
  const at: Vec2 = { x: 0, y: 0 };
  const placementDepth = (): DefinitionDepthMode => getResidenceResource(picker.value).kind === 'solid' ? depthMode : 'normal';

  let savedRevision = state.revision;
  let dirtyFor = 0;
  const persist = (): void => {
    try {
      saveCity(window.localStorage, city);
      savedRevision = state.revision;
      saveStatus.textContent = t('已保存到本机');
      saveStatus.dataset.error = 'false';
    } catch (error) {
      // 写入失败（配额、隐私模式）不丢当前布局：明确提示，下一次改动或离开时重试。
      saveStatus.textContent = t('未保存：{error}。当前布局仍保留，请重试保存。').replace('{error}', error instanceof Error ? error.message : String(error));
      saveStatus.dataset.error = 'true';
    }
  };

  const feedback = (result: BuildingResult): void => {
    status.textContent = residenceMessage(result.message);
    status.dataset.error = String(!result.ok);
  };
  /** 放置按资源对齐整格或半格；拆除取指针所在点。 */
  const snap = (point: Vec2): Vec2 => {
    const kind = getResidenceResource(picker.value).kind;
    const step = kind === 'solid' || kind === 'wall' || kind === 'glazing' || kind === 'door' ? 1 : .5;
    return { x: Math.floor(point.x / step) * step, y: Math.floor(point.y / step) * step };
  };
  const tint = (ok: boolean): void => ghost!.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.emissive.set(ok ? 0x149d9d : 0xcc203b);
    }
  });
  const updateGhost = (): void => {
    if (!ghost) return;
    ghost.root.visible = building && pointer !== null && tool.value === 'place';
    if (!ghost.root.visible) return;
    const p = snap(pointer!);
    ghost.root.position.set(p.x, p.y, .015);
    const result = checkBuilding(state, picker.value, p.x, p.y, getPlayer(world).body, placementDepth());
    status.textContent = `${pieceLabel(getResidenceResource(picker.value))} · ${p.x}, ${p.y} · ${residenceMessage(result.message)}`;
    status.dataset.error = String(!result.ok);
    tint(result.ok);
  };
  const chooseResource = (): void => {
    const resource = getResidenceResource(picker.value);
    ui.root.querySelector<HTMLElement>('[data-depth-field]')!.hidden = resource.kind !== 'solid';
    ui.root.querySelector<HTMLElement>('[data-resource-note]')!.textContent = `${pieceLabel(resource)} · ${t('占位 {w} × {h} 格。').replace('{w}', String(resource.width)).replace('{h}', String(resource.height))}${resource.kind === 'solid' ? t(placementDepth() === 'deep' ? '深3，同格不能放背景墙；一格一块，可连续拼接。' : '深2，可与背景墙共存。') : ''}${t('拆除只选择与此构件相同的一层。')}`;
    ghost?.dispose();
    ghost = createBuildingPreview(resource.id, placementDepth());
    ghost.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true; material.opacity = .45; material.depthWrite = false;
        material.userData.noLightMap = true;
      }
    });
    stage.scene.add(ghost.root);
    updateGhost();
  };
  const aim = (event: PointerEvent): boolean => {
    pointer = cameraRig.screenToWorld(event.clientX, event.clientY, at) && { x: at.x, y: at.y };
    return pointer !== null;
  };
  const setBuilding = (enabled: boolean): void => {
    building = city.editing = enabled;
    ui.root.classList.toggle('is-building', enabled);
    o.releaseInput();
    if (!enabled) pointer = null;
    updateGhost();
  };

  picker.root.addEventListener('change', chooseResource, { signal: events.signal });
  depthSelect.addEventListener('change', () => {
    const value = depthSelect.value;
    if (value !== 'normal' && value !== 'deep') throw new Error(`未知砖块深度规格：${value}`);
    depthMode = value;
    chooseResource();
  }, { signal: events.signal });
  tool.addEventListener('change', updateGhost, { signal: events.signal });
  canvas.addEventListener('pointermove', event => { if (building && aim(event)) updateGhost(); }, { signal: events.signal });
  canvas.addEventListener('pointerleave', () => { pointer = null; updateGhost(); }, { signal: events.signal });
  canvas.addEventListener('pointerdown', event => {
    if (!building || event.button !== 0 || !aim(event)) return;
    if (tool.value === 'place') {
      const p = snap(pointer!);
      city.commands.push({ kind: 'place', resourceId: picker.value, x: p.x, y: p.y, depthMode: placementDepth() });
    } else {
      const item = buildingItemAt(state, pointer!.x, pointer!.y, getResidenceResource(picker.value).layer);
      if (item) city.commands.push({ kind: 'remove', item });
      else { status.textContent = t('这里没有当前层的构件'); status.dataset.error = 'false'; }
    }
  }, { signal: events.signal });
  chooseResource();

  let leaving = false;
  let nearWilds = false;
  return {
    paused: false,
    get building() { return building; },
    setBuilding,
    persist,
    update(_view, time, frameDt) {
      ghost?.update(time);
      const results = city.results.splice(0);
      if (results.length > 0) {
        feedback(results.at(-1)!);
        updateGhost();
      }
      if (state.revision !== savedRevision) {
        dirtyFor += frameDt;
        if (dirtyFor >= SAVE_DELAY) { dirtyFor = 0; persist(); }
      } else dirtyFor = 0;
      if (city.variant !== 'harbor' || building) return;
      // 主世界城区右端连着原野：走到边上即进入原野左端。
      const body = getPlayer(world).body;
      const edge = state.site.maxX;
      if (!leaving && body.x + body.halfWidth > edge - .05) {
        leaving = true;
        persist();
        o.releaseInput();
        gameHost().location.assign(`${location.pathname}${worldMapSearch(location.search, 'wilds')}`);
      }
      const near = body.x > edge - WILDS_HINT;
      if (near !== nearWilds) { nearWilds = near; actionStatus.textContent = near ? t('继续向右进入原野 →') : ''; }
    },
    dispose() {
      events.abort();
      ghost?.dispose();
      picker.dispose();
      ui.dispose();
    },
  };
}
