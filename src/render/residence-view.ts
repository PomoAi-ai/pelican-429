import * as THREE from 'three';
import { getResidenceResource, RESIDENCE_SUN, type ResidenceResource } from '../config/residence.ts';
import type { ResidencePlacement, ResidenceState } from '../sim/residence.ts';
import { createSolarPanel, solarTrackingAngle, type SolarPanelState } from '../physics/solar-panel.ts';
import { createDefinitionKit } from './definition-kit.ts';
import { createDefinitionFurniture } from './definition-furniture.ts';
import type { WorkstationPlayer } from './workstation-display-state.ts';
import { createAiCityDoor, createAiCityFixture } from './ai-city-architecture.ts';
import { createFacilityLighting, type FacilityLamp } from './facility-lighting.ts';

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

/** 一份住宅状态装配共享资源；渲染节点上的编号让交互直接指向存档构件。 */
export function createResidenceView(state: ResidenceState, { lighting = true }: { lighting?: boolean } = {}) {
  const root = new THREE.Group();
  root.name = 'ai-city-residence';
  root.scale.z = -1;
  const kit = createDefinitionKit({ style: 'ai-city' });
  root.add(kit.root);
  const disposers: Array<() => void> = [() => kit.dispose()];
  const updates: Array<(time: number, player: WorkstationPlayer | null) => void> = [];
  const solarPanels: SolarPanelState[] = [];
  const obstacles: WalkObstacle[] = [];
  const placements = state.placements.map(placement => ({ placement, resource: getResidenceResource(placement.resourceId) }));
  const tag = (object: THREE.Object3D, id: number): void => {
    object.traverse(node => { node.userData.residenceId = id; });
  };
  const addKit = (placement: ResidencePlacement, draw: () => void): void => {
    const count = kit.root.children.length;
    draw();
    for (const child of kit.root.children.slice(count)) tag(child, placement.id);
  };
  const addObject = (placement: ResidencePlacement, object: THREE.Object3D, z = 0): void => {
    object.position.set(placement.x, placement.y, z);
    tag(object, placement.id);
    root.add(object);
  };
  // 平台深度依墙体决定，先完成整面背景，再装配所有实体和平台。
  for (const { placement: p, resource: r } of placements) {
    if (r.kind === 'wall') addKit(p, () => kit.wall(r.wallId, p.x, p.y));
    else if (r.kind === 'glazing') addKit(p, () => kit.window(r.width, r.height, p.x, p.y, 'rounded', true));
  }
  const paired = new Set<number>();
  const solidByCell = new Map(placements.filter(item => item.resource.kind === 'solid')
    .map(item => [`${item.placement.x}:${item.placement.y}:${item.placement.resourceId}:${item.placement.depthMode ?? 'normal'}`, item.placement]));
  for (const { placement: p, resource: r } of placements) {
    if (r.kind === 'solid') {
      if (paired.has(p.id)) continue;
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
    else if (r.kind === 'door') {
      const view = createAiCityDoor(r.side);
      addObject(p, view.root);
      if (r.side === 'left') view.root.position.x += .5;
      view.setOpen(p.open!);
      updates.push(time => { view.setOpen(p.open!); view.update(time); });
      disposers.push(view.dispose);
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
    disposers.push(() => instances.dispose());
  }
  for (const { placement: p, resource: r } of placements) {
    if (r.kind === 'platform') addKit(p, () => kit.platform(r.platformWidth, p.y + .5, p.x, r.material));
  }
  const obstacle = (p: ResidencePlacement, r: ResidenceResource, centerZ: number, frontZ: number, standTop: number | null): void => {
    obstacles.push({ x: p.x, y: p.y, width: r.width, height: r.height, centerZ, frontZ, standTop });
  };
  for (const { placement: p, resource: r } of placements) {
    if (r.kind === 'furniture') {
      const view = createDefinitionFurniture(r.furniture, { solarDepth: 2, ...r.chairFacing ? { chairFacing: r.chairFacing } : {} });
      view.root.scale.z = -1;
      addObject(p, view.root, r.furniture === 'solar' || r.furniture === 'pendant' ? 0 : .5);
      if (r.furniture === 'solar') {
        const panel = createSolarPanel(p.x + .5, p.y, solarTrackingAngle(RESIDENCE_SUN));
        solarPanels.push(panel);
        view.update!(0, panel.angle, null);
        updates.push(time => view.update!(time, panel.angle, null));
      } else {
        if (view.update) updates.push((time, player) => view.update!(time, undefined, player));
        if (r.furniture !== 'pendant') obstacle(p, r, -.5, 0, r.standTop);
      }
      disposers.push(view.dispose);
    } else if (r.kind === 'fixture') {
      const view = createAiCityFixture(r.fixture);
      const rearMounted = r.fixture === 'planter' || r.fixture === 'energy-column';
      // 深2地台前半留给通行，花槽和设备柱与家具一样靠后摆放。
      addObject(p, view.root, rearMounted ? .5 : 0);
      updates.push(view.update);
      disposers.push(view.dispose);
      // 花槽工厂已复用正式花草几何，避免叠加第二套植物。
      if (rearMounted) obstacle(p, r, -.5, 0, null);
      else if (r.fixture === 'bollard-light') obstacle(p, r, 0, .25, null);
    }
  }
  const lamps: Array<FacilityLamp & { readonly power: number; readonly signal: boolean }> = [];
  if (lighting) for (const p of state.placements) {
    const lamp = p.resourceId === 'pendant' ? { x: .5, y: .06, z: 0, power: 36, distance: 8, signal: false }
      : p.resourceId === 'eave-light' ? { x: .5, y: -.1, z: 0, power: 24, distance: 7, signal: false }
      : p.resourceId === 'wall-light' ? { x: .25, y: .5, z: .64, power: 14, distance: 6, signal: true }
      : p.resourceId === 'bollard-light' ? { x: .25, y: .77, z: 0, power: 1.6, distance: 3.8, signal: false }
      : null;
    if (lamp) lamps.push({ position: new THREE.Vector3(p.x + lamp.x, p.y + lamp.y, lamp.z),
      color: new THREE.Color(lamp.signal ? 0x79cfff : p.resourceId === 'bollard-light' ? 0xffead4 : 0xffdfb7), intensity: lamp.power * .12,
      power: lamp.power, distance: lamp.distance, signal: lamp.signal });
  }
  const localLighting = createFacilityLighting(root, lamps.filter(lamp => !lamp.signal), lamps.filter(lamp => lamp.signal));
  disposers.push(localLighting.dispose);
  const viewRay = new THREE.Ray();
  const facadePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const worldFocus = new THREE.Vector3();
  const lightFocus = new THREE.Vector3();
  let animationTime = 0;
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
    setLighting(camera: THREE.Camera, night: number, skyAt: (x: number, y: number) => number): void {
      camera.getWorldPosition(viewRay.origin);
      camera.getWorldDirection(viewRay.direction);
      root.getWorldPosition(worldFocus);
      facadePlane.constant = -worldFocus.z;
      // 自由镜头恰好侧视墙面时保留原焦点，防止平行射线把灯源选择推到远处。
      if (viewRay.intersectPlane(facadePlane, worldFocus)) lightFocus.copy(root.worldToLocal(worldFocus));
      for (const lamp of lamps) lamp.intensity = lamp.power * (1 - .88 * (1 - night) * skyAt(lamp.position.x, lamp.position.y));
      localLighting.update(lightFocus, animationTime);
    },
    update(time: number, player: WorkstationPlayer | null): void {
      animationTime = time;
      for (const update of updates) update(time, player);
    },
    dispose(): void {
      for (const dispose of disposers.reverse()) dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
