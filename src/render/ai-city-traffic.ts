import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH } from '../config/residence.ts';
import { AI_CITY_LAYERS } from '../config/ai-city-look.ts';

/** 轨道与列车采样同一条世界曲线，跨园区分段时位置和切线连续。 */
export function aiCityRailPoint(x: number): THREE.Vector3 {
  return new THREE.Vector3(x, 7.2 + Math.sin(x * Math.PI / 128) * .7, -34 + Math.sin(x * Math.PI / 128) * 2);
}

type VehicleMaterial = 'hull' | 'glass' | 'light';

export function createVehicleTemplates(materials: Record<VehicleMaterial, THREE.Material>) {
  const capsule = new THREE.CapsuleGeometry(.5, 1, 3, 8);
  capsule.rotateZ(Math.PI / 2); capsule.scale(.5, 1, 1);
  const sphere = new THREE.SphereGeometry(.5, 16, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const templates: THREE.Group[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  function vehicle(build: (put: (shape: THREE.BufferGeometry, material: VehicleMaterial,
    x: number, y: number, z: number, w: number, h: number, d: number) => void) => void): THREE.Group {
    const parts: Record<VehicleMaterial, THREE.BufferGeometry[]> = { hull: [], glass: [], light: [] };
    build((shape, material, x, y, z, w, h, d) => {
      parts[material].push(shape.clone().scale(w, h, d).translate(x, y, z));
    });
    const group = new THREE.Group();
    for (const material of ['hull', 'glass', 'light'] as const) {
      const geometry = mergeGeometries(parts[material])!;
      for (const part of parts[material]) part.dispose();
      geometries.push(geometry);
      group.add(new THREE.Mesh(geometry, materials[material]));
    }
    templates.push(group);
    return group;
  }
  // 每款载具只保留三份合并网格，巡航实例共享几何与材质。
  const train = vehicle(put => {
    for (let car = 0; car < 3; car++) {
      const x = -car * 3.95;
      put(capsule, 'hull', x, 0, 0, 3.7, 1.08, 1.35);
      put(capsule, 'glass', x, -.38, 0, 3.5, .27, 1.12);
      for (const side of [-1, 1]) {
        put(capsule, 'glass', x, .16, side * .655, 3.02, .43, .07);
        put(capsule, 'light', x, -.36, side * .6, 3.26, .065, .07);
        for (const window of [-.85, 0, .85]) {
          put(capsule, 'light', x + window, .22, side * .699, .45, .05, .02);
          put(box, 'hull', x + window - .34, .16, side * .7, .065, .43, .025);
        }
      }
      if (car < 2) put(capsule, 'glass', x - 1.98, -.08, 0, .5, .62, .76);
    }
    for (const [x, direction] of [[1.48, 1], [-9.38, -1]] as const) {
      put(sphere, 'hull', x, -.05, 0, 1.28, .82, 1.24);
      put(sphere, 'glass', x + direction * .2, .2, 0, .7, .46, 1.1);
      for (const side of [-1, 1]) put(sphere, 'light', x + direction * .48, -.19, side * .34, .14, .1, .19);
    }
  });
  const flyers = [0, 1, 2].map(kind => vehicle(put => {
    const length = [3.3, 2.8, 4][kind]!;
    const depth = kind === 0 ? 2.1 : 1.55;
    put(sphere, 'hull', 0, 0, 0, length, .95, depth);
    put(sphere, 'glass', .15, .36, 0, length * .67, .73, depth * .8);
    put(sphere, 'hull', -.2, .64, 0, length * .59, .19, depth * .61);
    put(capsule, 'glass', 0, -.3, 0, length * .76, .36, depth * .67);
    for (const side of [-1, 1]) {
      put(capsule, 'light', .1, .29, side * depth * .37, length * .47, .08, .06);
      for (const window of [-.55, .15, .8]) {
        put(box, 'hull', window * length / 3.3, .37, side * depth * .35, .07, .33, .08);
      }
      const nacelleX = kind === 1 ? -.7 : -.35;
      put(capsule, 'hull', nacelleX, -.19, side * depth * .52, 1.34, .38, .48);
      put(sphere, 'glass', nacelleX, -.36, side * depth * .52, .73, .26, .46);
      put(sphere, 'light', nacelleX, -.49, side * depth * .52, .54, .075, .31);
      put(sphere, 'light', length * .42, -.06, side * depth * .15, .12, .1, .16);
    }
    if (kind === 2) {
      put(capsule, 'hull', -.9, .74, 0, 1.12, .2, .3);
      put(capsule, 'light', -.9, .85, 0, .62, .035, .16);
    }
  }));
  capsule.dispose(); sphere.dispose(); box.dispose();
  return { train, flyers, dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    for (const template of templates) template.clear();
  } };
}

const layerDepth = (id: 'architecture' | 'canyon'): number => AI_CITY_LAYERS.find(layer => layer.id === id)!.depth;

/** 近轨在近水层、远轨在近城层；y 为轨道梁中心，z 为世界深度。环境轨道梁与交通层共用。 */
export const AI_CITY_RAILS = {
  near: { y: 2.3, z: layerDepth('architecture'), scale: 1 },
  far: { y: 6, z: layerDepth('canyon'), scale: .7 },
} as const;

// 近处无人机在近轨上方穿行，远处一群缩小后浮在主城前方，形成两层空中交通。
const FLYERS = {
  near: { scale: 1, y: [9, 15], z: [-22, -27], speed: 1.4 },
  far: { scale: .55, y: [13, 24], z: [-55, -82], speed: .8 },
} as const;

export function createAiCityTraffic(homeCenter: number, depths: readonly ('near' | 'far')[], flyers: boolean) {
  const root = new THREE.Group(); root.name = 'ai-city-traffic';
  const near = new THREE.Group(), far = new THREE.Group();
  near.name = 'ai-city-traffic-near'; far.name = 'ai-city-traffic-far';
  root.add(near, far);
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeae0, metalness: .2, roughness: .38 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x174d73, emissive: 0x238cbd, emissiveIntensity: .23,
    metalness: .25, roughness: .23 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x92edff, toneMapped: false });
  const templates = createVehicleTemplates({ hull: hullMaterial, glass: glassMaterial, light: lightMaterial });
  const minX = RESIDENCE_WORLD.minX - RESIDENCE_SEGMENT_WIDTH * 2;
  const span = RESIDENCE_WORLD.width + RESIDENCE_SEGMENT_WIDTH * 4;
  const vehicles: Array<{ object: THREE.Object3D; offset: number; speed: number; place(x: number, time: number): void }> = [];
  for (const depth of depths) {
    const group = depth === 'near' ? near : far;
    const rail = AI_CITY_RAILS[depth];
    const trainCount = Math.ceil(span / (depth === 'near' ? 90 : 60));
    for (let i = 0; i < trainCount; i++) {
      const direction = i % 2 ? -1 : 1;
      const train = templates.train.clone(); train.name = `ai-city-maglev-${depth}-${i}`;
      train.scale.setScalar(rail.scale); if (direction < 0) train.rotation.y = Math.PI;
      group.add(train);
      vehicles.push({ object: train, offset: homeCenter + 28 + i * span / trainCount, speed: (depth === 'near' ? 3.2 : 2) * direction,
        place(x): void { train.position.set(x, rail.y + .76 * rail.scale, rail.z); } });
    }
    if (!flyers) continue;
    const look = FLYERS[depth];
    const droneCount = Math.ceil(span / (depth === 'near' ? 70 : 40));
    for (let i = 0; i < droneCount; i++) {
      const direction = i % 2 ? -1 : 1;
      const kind = i % 3, u = (i * .618) % 1;
      const drone = templates.flyers[kind]!.clone(); drone.name = `ai-city-flyer-${depth}-${i}`;
      drone.scale.setScalar(look.scale); group.add(drone);
      const y = look.y[0] + (look.y[1] - look.y[0]) * u, z = look.z[0] + (look.z[1] - look.z[0]) * ((u * 3.7) % 1);
      vehicles.push({ object: drone, offset: homeCenter - 18 + i * span / droneCount, speed: look.speed * (1 + kind * .25) * direction,
        place(x, time): void {
          drone.position.set(x, y + Math.sin(time * .65 + i) * .24, z);
          drone.rotation.set(Math.sin(time * .42 + i) * .025, direction < 0 ? Math.PI : 0, Math.sin(time * .5 + i) * .025 - direction * .025);
        } });
    }
  }
  return { root, near, far,
    update(time: number, range: { x: number; w: number }): void {
      const first = range.x - 160, last = range.x + range.w + 160;
      for (const vehicle of vehicles) {
        const x = minX + THREE.MathUtils.euclideanModulo(vehicle.offset - minX + time * vehicle.speed, span);
        vehicle.object.visible = x >= first && x <= last;
        if (vehicle.object.visible) vehicle.place(x, time);
      }
    },
    setNightFactor(night: number): void { glassMaterial.emissiveIntensity = .23 + night * .85; },
    dispose(): void {
      templates.dispose(); hullMaterial.dispose(); glassMaterial.dispose(); lightMaterial.dispose();
      root.removeFromParent(); near.clear(); far.clear(); root.clear();
    },
  };
}
