/**
 * 建筑层视图（由住宅视图改写）：墙层按区块实例化定义构件（窗为圆角玻璃窗），摆放物件（家具、装饰）与特殊构件
 * （能量门、太阳能板）各自是独立对象，按格子世界的内容增删并保留自身动画；门的开合、板面角度每帧取建造状态。
 * 另给出单件预览（建造幽灵、资源缩略图）。
 */
import * as THREE from 'three';
import type { DefinitionDepthMode } from '../../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_SUN, residenceWallResource, type ResidenceResource } from '../../config/residence.ts';
import { createSolarPanel, solarTrackingAngle } from '../../physics/solar-panel.ts';
import type { BuildingState, SpecialItem } from '../../sim/building.ts';
import type { PlacedObject, WallPlacement } from '../../world/building-layers.ts';
import { CHUNK_SIZE, type TileMap } from '../../world/tile-map.ts';
import { createAiCityDoor, createAiCityFixture } from '../city/ai-city-architecture.ts';
import type { WorkstationPlayer } from '../residence/workstation-display-state.ts';
import { createDefinitionTemplates, createTemplateBatch, type DefinitionTemplates } from '../tile/piece-view.ts';
import { createDefinitionFurniture } from './definition-furniture.ts';

type ViewUpdate = (time: number, player: WorkstationPlayer | null) => void;

interface BuildingPart {
  readonly root: THREE.Object3D;
  readonly update?: ViewUpdate;
  readonly dispose: () => void;
}

/** 门、家具与装饰的独立对象，左下角锚点放在 (x,y)；special 为门或太阳能板的城区状态（预览时为 null）。 */
function createBuildingPart(resource: ResidenceResource, x: number, y: number, special: SpecialItem | null): BuildingPart {
  const place = (object: THREE.Object3D, z = 0): void => { object.position.set(x, y, z); };
  if (resource.kind === 'door') {
    const view = createAiCityDoor(resource.side);
    place(view.root);
    if (resource.side === 'left') view.root.position.x += .5;
    view.setOpen(special?.open ?? false);
    return { root: view.root, update: time => { view.setOpen(special?.open ?? false); view.update(time); }, dispose: view.dispose };
  }
  if (resource.kind === 'furniture') {
    const view = createDefinitionFurniture(resource.furniture, { solarDepth: 2, ...resource.chairFacing ? { chairFacing: resource.chairFacing } : {} });
    view.root.scale.z = -1;
    place(view.root, resource.furniture === 'solar' || resource.furniture === 'pendant' ? 0 : .5);
    if (resource.furniture === 'solar') {
      const panel = special?.panel ?? createSolarPanel(x + .5, y, solarTrackingAngle(RESIDENCE_SUN));
      view.update!(0, panel.angle, null);
      return { root: view.root, update: time => view.update!(time, panel.angle, null), dispose: view.dispose };
    }
    return { root: view.root, dispose: view.dispose,
      ...view.update ? { update: (time: number, player: WorkstationPlayer | null) => view.update!(time, undefined, player) } : {} };
  }
  if (resource.kind !== 'fixture') throw new Error(`building-layer-view: ${resource.id} is not a standalone part`);
  const view = createAiCityFixture(resource.fixture);
  // 深2地台前半留给通行，花槽和设备柱与家具一样靠后摆放。
  place(view.root, resource.fixture === 'planter' || resource.fixture === 'energy-column' ? .5 : 0);
  return { root: view.root, update: view.update, dispose: view.dispose };
}

const drawWall = (templates: DefinitionTemplates, wall: WallPlacement) => {
  const resource = residenceWallResource(wall.wallId);
  return resource.kind === 'glazing' ? templates.window(wall.width, wall.height) : templates.wall(wall.wallId);
};

export interface BuildingLayerView {
  readonly root: THREE.Group;
  /** 同步增删的墙与对象并推进动画。 */
  update(time: number, player: WorkstationPlayer | null): void;
  dispose(): void;
}

/** building 为建造状态（门与太阳能板的开合、板面角度从这里取）；没有建造状态的世界为 null。 */
export function createBuildingLayerView(map: TileMap, building: BuildingState | null): BuildingLayerView {
  const root = new THREE.Group();
  root.name = 'building-layers';
  // 定义坐标 +Z 指向后沿。
  root.scale.z = -1;
  const templates = createDefinitionTemplates();
  const wallChunks = new Map<number, { group: THREE.Group; meshes: THREE.InstancedMesh[] }>();
  const keyOf = (cx: number, cy: number): number => cy * map.chunksX + cx;
  const chunkOf = (x: number, y: number): number => keyOf(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
  const buildWalls = (key: number): void => {
    const old = wallChunks.get(key);
    if (old) {
      for (const mesh of old.meshes) mesh.dispose();
      old.group.removeFromParent();
      wallChunks.delete(key);
    }
    const walls = map.building.walls().filter(wall => chunkOf(wall.x, wall.y) === key);
    if (walls.length === 0) return;
    const batch = createTemplateBatch();
    for (const wall of walls) batch.add(drawWall(templates, wall), wall.x, wall.y);
    const group = new THREE.Group();
    group.name = `walls-${key}`;
    wallChunks.set(key, { group, meshes: batch.build(group) });
    root.add(group);
  };
  const dirtyWalls = new Set(map.building.walls().map(wall => chunkOf(wall.x, wall.y)));
  let partsDirty = true;
  let revision = building?.revision ?? 0;
  const unsubscribe = map.building.onChange((x0, y0, x1, y1) => {
    partsDirty = true;
    for (let cy = Math.max(0, Math.floor(y0 / CHUNK_SIZE)); cy <= Math.min(map.chunksY - 1, Math.floor((y1 - 1) / CHUNK_SIZE)); cy++) {
      for (let cx = Math.max(0, Math.floor(x0 / CHUNK_SIZE)); cx <= Math.min(map.chunksX - 1, Math.floor((x1 - 1) / CHUNK_SIZE)); cx++) dirtyWalls.add(keyOf(cx, cy));
    }
  });
  let parts = new Map<PlacedObject | SpecialItem, BuildingPart>();
  let updates: ViewUpdate[] = [];
  const syncParts = (): void => {
    const next = new Map<PlacedObject | SpecialItem, BuildingPart>();
    const keep = (key: PlacedObject | SpecialItem, create: () => BuildingPart): void => {
      let part = parts.get(key);
      if (!part) {
        part = create();
        root.add(part.root);
      }
      next.set(key, part);
    };
    for (const object of map.building.objects()) keep(object, () => createBuildingPart(getResidenceResource(object.objectId), object.x, object.y, null));
    for (const item of building?.specials.values() ?? []) keep(item, () => createBuildingPart(getResidenceResource(item.resourceId), item.x, item.y, item));
    for (const [key, part] of parts) if (next.get(key) !== part) {
      part.root.removeFromParent();
      part.dispose();
    }
    parts = next;
    updates = [...parts.values()].flatMap(part => part.update ? [part.update] : []);
  };
  return {
    root,
    update(time, player) {
      for (const key of dirtyWalls) buildWalls(key);
      dirtyWalls.clear();
      // 门与太阳能板不在建筑层，按建造版本发现增删。
      if (building && building.revision !== revision) { revision = building.revision; partsDirty = true; }
      if (partsDirty) { syncParts(); partsDirty = false; }
      for (const update of updates) update(time, player);
    },
    dispose() {
      unsubscribe();
      for (const part of parts.values()) part.dispose();
      for (const chunk of wallChunks.values()) for (const mesh of chunk.meshes) mesh.dispose();
      templates.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

/** 单件预览（建造幽灵、资源缩略图）：与游戏同一套定义构件与对象，锚点在原点。 */
export function createBuildingPreview(resourceId: string, depthMode: DefinitionDepthMode) {
  const resource = getResidenceResource(resourceId);
  const root = new THREE.Group();
  root.name = `building-preview-${resourceId}`;
  root.scale.z = -1;
  let templates: DefinitionTemplates | null = null;
  let part: BuildingPart | null = null;
  if (resource.kind === 'solid' || resource.kind === 'platform' || resource.kind === 'wall' || resource.kind === 'glazing') {
    templates = createDefinitionTemplates();
    const template = resource.kind === 'solid' ? templates.solid(resource.shape, resource.material, depthMode, 1)
      : resource.kind === 'platform' ? templates.platform(resource.platformWidth, .5, resource.material, false)
        : resource.kind === 'wall' ? templates.wall(resource.wallId) : templates.window(resource.width, resource.height);
    for (const mesh of template) {
      const object = new THREE.Mesh(mesh.geometry, mesh.material);
      object.position.copy(mesh.offset);
      object.castShadow = mesh.castShadow;
      object.renderOrder = mesh.renderOrder;
      root.add(object);
    }
  } else {
    part = createBuildingPart(resource, 0, 0, null);
    root.add(part.root);
  }
  return {
    root,
    update(time: number): void { part?.update?.(time, null); },
    dispose(): void {
      part?.dispose();
      templates?.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
