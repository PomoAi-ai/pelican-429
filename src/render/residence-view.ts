import * as THREE from 'three';
import { getResidenceResource, RESIDENCE_SUN, type ResidenceResource } from '../config/residence.ts';
import type { ResidencePlacement, ResidenceState } from '../sim/residence.ts';
import { createSolarPanel, solarTrackingAngle, type SolarPanelState } from '../physics/solar-panel.ts';
import { createDefinitionKit } from './definition-kit.ts';
import { createDefinitionFurniture } from './definition-furniture.ts';
import type { WorkstationPlayer } from './workstation-display-state.ts';
import { createAiCityDoor, createAiCityFixture } from './ai-city-architecture.ts';

/** 合缝和实例化只改变绘制，命中仍返回玩家点击的那一个逻辑构件。 */
export function residenceIntersectionId(hit: THREE.Intersection): number | undefined {
  const data = hit.instanceId === undefined ? hit.object.userData : hit.object.userData.residenceInstances[hit.instanceId];
  return data.residencePairIds ? data.residencePairIds[hit.point.x >= data.residencePairX + 1 ? 1 : 0] : data.residenceId;
}

interface WalkObstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerZ: number;
  readonly frontZ: number;
  readonly standTop: number | null;
}

type ViewUpdate = (time: number, player: WorkstationPlayer | null) => void;

/** 门、家具与设施各自是独立对象，可以逐件增删并保留自身动画状态。 */
interface ResidencePart {
  readonly key: string;
  readonly root: THREE.Object3D;
  readonly update?: ViewUpdate;
  readonly obstacle?: WalkObstacle;
  readonly panel?: SolarPanelState;
  readonly dispose: () => void;
}

const KIT_KINDS = new Set<ResidenceResource['kind']>(['solid', 'wall', 'glazing', 'platform']);

/** 对象引用之外再比对决定外观的字段，原地改写资源或位置的同一对象也按替换处理。 */
const placementKey = (p: ResidencePlacement): string => `${p.resourceId}:${p.x}:${p.y}:${p.depthMode ?? 'normal'}`;

const tag = (object: THREE.Object3D, id: number): void => {
  object.traverse(node => { node.userData.residenceId = id; });
};

/** 合缝配对、方石实例化和平台挂墙都依赖整组 kit 构件，因此这一组只能整体重建。 */
function createResidenceKit(items: ReadonlyArray<{ placement: ResidencePlacement; resource: ResidenceResource }>) {
  const kit = createDefinitionKit({ style: 'ai-city' });
  const instanced: THREE.InstancedMesh[] = [];
  const addKit = (placement: ResidencePlacement, draw: () => void): void => {
    const count = kit.root.children.length;
    draw();
    for (const child of kit.root.children.slice(count)) tag(child, placement.id);
  };
  // 平台深度依墙体决定，先完成整面背景，再装配所有实体和平台。
  for (const { placement: p, resource: r } of items) {
    if (r.kind === 'wall') addKit(p, () => kit.wall(r.wallId, p.x, p.y));
    else if (r.kind === 'glazing') addKit(p, () => kit.window(r.width, r.height, p.x, p.y, 'rounded', true));
  }
  const paired = new Set<number>();
  const solidByCell = new Map(items.filter(item => item.resource.kind === 'solid')
    .map(item => [`${item.placement.x}:${item.placement.y}:${item.placement.resourceId}:${item.placement.depthMode ?? 'normal'}`, item.placement]));
  for (const { placement: p, resource: r } of items) {
    if (r.kind !== 'solid' || paired.has(p.id)) continue;
    if (r.material === 'ashlar' && ['A', 'B', 'C'].includes(r.shape) && p.x % 2 !== 0
      && solidByCell.has(`${p.x - 1}:${p.y}:${p.resourceId}:${p.depthMode ?? 'normal'}`)) continue;
    const mate = r.material === 'ashlar' && ['A', 'B', 'C'].includes(r.shape) && p.x % 2 === 0
      ? solidByCell.get(`${p.x + 1}:${p.y}:${p.resourceId}:${p.depthMode ?? 'normal'}`) : undefined;
    const count = kit.root.children.length;
    addKit(p, () => kit.solid(r.shape, p.x, p.y, r.material, p.depthMode, mate ? 2 : 1));
    if (mate) {
      paired.add(mate.id);
      for (const child of kit.root.children.slice(count)) {
        child.userData.residencePairIds = [p.id, mate.id];
        child.userData.residencePairX = p.x;
      }
    }
  }
  // 方石地表按区段实例化，保留逐实例构件编号用于逐格选取与拆除。
  const batches = new Map<string, THREE.Mesh[]>();
  for (const child of kit.root.children) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.material.name !== 'ai-city-ashlar') continue;
    const key = `${Math.floor(child.position.x / 128)}:${child.geometry.uuid}:${child.material.uuid}`;
    const batch = batches.get(key);
    if (batch) batch.push(child);
    else batches.set(key, [child]);
  }
  for (const batch of batches.values()) {
    if (batch.length < 2) continue;
    const first = batch[0]!;
    const instances = new THREE.InstancedMesh(first.geometry, first.material, batch.length);
    instances.castShadow = instances.receiveShadow = true;
    instances.userData.residenceInstances = batch.map(child => child.userData);
    batch.forEach((child, index) => {
      child.updateMatrix();
      instances.setMatrixAt(index, child.matrix);
      child.removeFromParent();
    });
    instances.computeBoundingSphere();
    kit.root.add(instances);
    instanced.push(instances);
  }
  for (const { placement: p, resource: r } of items) {
    if (r.kind === 'platform') addKit(p, () => kit.platform(r.platformWidth, p.y + .5, p.x, r.material));
  }
  return {
    root: kit.root,
    dispose(): void {
      for (const instances of instanced) instances.dispose();
      kit.dispose();
      kit.root.removeFromParent();
    },
  };
}

function createResidencePart(p: ResidencePlacement, r: ResidenceResource, key: string): ResidencePart {
  const place = (object: THREE.Object3D, z = 0): void => {
    object.position.set(p.x, p.y, z);
    tag(object, p.id);
  };
  const obstacle = (centerZ: number, frontZ: number, standTop: number | null): WalkObstacle =>
    ({ x: p.x, y: p.y, width: r.width, height: r.height, centerZ, frontZ, standTop });
  if (r.kind === 'door') {
    const view = createAiCityDoor(r.side);
    place(view.root);
    if (r.side === 'left') view.root.position.x += .5;
    view.setOpen(p.open!);
    return { key, root: view.root, update: time => { view.setOpen(p.open!); view.update(time); }, dispose: view.dispose };
  }
  if (r.kind === 'furniture') {
    const view = createDefinitionFurniture(r.furniture, { solarDepth: 2, ...r.chairFacing ? { chairFacing: r.chairFacing } : {} });
    view.root.scale.z = -1;
    place(view.root, r.furniture === 'solar' || r.furniture === 'pendant' ? 0 : .5);
    if (r.furniture === 'solar') {
      const panel = createSolarPanel(p.x + .5, p.y, solarTrackingAngle(RESIDENCE_SUN));
      view.update!(0, panel.angle, null);
      return { key, root: view.root, panel, update: time => view.update!(time, panel.angle, null), dispose: view.dispose };
    }
    return { key, root: view.root, dispose: view.dispose,
      ...view.update ? { update: (time: number, player: WorkstationPlayer | null) => view.update!(time, undefined, player) } : {},
      ...r.furniture !== 'pendant' ? { obstacle: obstacle(-.5, 0, r.standTop) } : {} };
  }
  if (r.kind !== 'fixture') throw new Error(`residence view: ${r.id} is not a standalone part`);
  const view = createAiCityFixture(r.fixture);
  const rearMounted = r.fixture === 'planter' || r.fixture === 'energy-column';
  // 深2地台前半留给通行，花槽和设备柱与家具一样靠后摆放。
  place(view.root, rearMounted ? .5 : 0);
  // 花槽工厂已复用正式花草几何，避免叠加第二套植物。
  return { key, root: view.root, update: view.update, dispose: view.dispose,
    ...rearMounted ? { obstacle: obstacle(-.5, 0, null) } : r.fixture === 'bollard-light' ? { obstacle: obstacle(0, .25, null) } : {} };
}

/** 一份住宅状态装配共享资源；渲染节点上的编号让交互直接指向存档构件。 */
export function createResidenceView(state: ResidenceState) {
  const root = new THREE.Group();
  root.name = 'ai-city-residence';
  root.scale.z = -1;
  let kit: ReturnType<typeof createResidenceKit> | undefined;
  let kitKeys = new Map<ResidencePlacement, string>();
  let parts = new Map<ResidencePlacement, ResidencePart>();
  let updates: ViewUpdate[] = [];
  let obstacles: WalkObstacle[] = [];
  // 应用与透视操控持有这一数组的引用，增删时原地修改。
  const solarPanels: SolarPanelState[] = [];
  /** 按构件对象引用比对上次装配：独立构件逐件增删，kit 构件有变化时只整体重建 kit。门开关只改 open，不进入这里。 */
  const sync = (): void => {
    const nextKitKeys = new Map<ResidencePlacement, string>();
    const kitItems: Array<{ placement: ResidencePlacement; resource: ResidenceResource }> = [];
    const nextParts = new Map<ResidencePlacement, ResidencePart>();
    for (const placement of state.placements) {
      const resource = getResidenceResource(placement.resourceId);
      const key = placementKey(placement);
      if (KIT_KINDS.has(resource.kind)) {
        nextKitKeys.set(placement, key);
        kitItems.push({ placement, resource });
        continue;
      }
      const kept = parts.get(placement);
      if (kept?.key === key) {
        nextParts.set(placement, kept);
        continue;
      }
      const part = createResidencePart(placement, resource, key);
      root.add(part.root);
      nextParts.set(placement, part);
    }
    for (const [placement, part] of parts) if (nextParts.get(placement) !== part) {
      part.root.removeFromParent();
      part.dispose();
    }
    parts = nextParts;
    const kitChanged = kit === undefined || nextKitKeys.size !== kitKeys.size
      || [...nextKitKeys].some(([placement, key]) => kitKeys.get(placement) !== key);
    if (kitChanged) {
      kit?.dispose();
      kit = createResidenceKit(kitItems);
      root.add(kit.root);
      kitKeys = nextKitKeys;
    }
    const list = [...parts.values()];
    updates = list.flatMap(part => part.update ? [part.update] : []);
    obstacles = list.flatMap(part => part.obstacle ? [part.obstacle] : []);
    solarPanels.splice(0, solarPanels.length, ...list.flatMap(part => part.panel ? [part.panel] : []));
  };
  sync();
  return {
    root,
    solarPanels,
    walkZ(x: number, y: number): number {
      const standing = obstacles.find(item => item.standTop !== null && x > item.x && x < item.x + item.width
        && y >= item.y + item.standTop - .05 && y < item.y + item.standTop + 1);
      if (standing) return standing.centerZ;
      let z = 0;
      for (const item of obstacles) {
        if (y >= item.y + item.height || y + 3.1 <= item.y) continue;
        const gap = Math.max(item.x - (x + .3), x - .3 - item.x - item.width, 0);
        const t = Math.max(0, 1 - gap);
        z = Math.max(z, (item.frontZ + .5) * t * t * (3 - 2 * t));
      }
      return z;
    },
    sync,
    update(time: number, player: WorkstationPlayer | null): void {
      for (const update of updates) update(time, player);
    },
    dispose(): void {
      for (const part of parts.values()) part.dispose();
      kit?.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
