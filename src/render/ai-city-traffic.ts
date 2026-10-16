import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH } from '../config/residence.ts';
import { AI_CITY_LAYERS } from '../config/ai-city-look.ts';

const canyonDepth = AI_CITY_LAYERS.find(layer => layer.id === 'canyon')!.depth;

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

export function createAiCityTraffic(homeCenter: number) {
  const root = new THREE.Group(); root.name = 'ai-city-traffic';
  const trainLayer = new THREE.Group(), droneLayer = new THREE.Group();
  root.add(trainLayer, droneLayer);
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeae0, metalness: .2, roughness: .38 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x174d73, emissive: 0x238cbd, emissiveIntensity: .23,
    metalness: .25, roughness: .23 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x92edff, toneMapped: false });
  const templates = createVehicleTemplates({ hull: hullMaterial, glass: glassMaterial, light: lightMaterial });
  const trains = new Map<number, THREE.Group>();
  const drones = new Map<number, THREE.Group>();
  const minX = RESIDENCE_WORLD.minX - RESIDENCE_SEGMENT_WIDTH * 2;
  const span = RESIDENCE_WORLD.width + RESIDENCE_SEGMENT_WIDTH * 4;
  const trainCount = Math.ceil(span / 196);
  const droneCount = Math.ceil(span / 112);
  const tangent = new THREE.Vector3(), axis = new THREE.Vector3(1, 0, 0);
  return { root, trains: trainLayer, drones: droneLayer,
    update(time: number, range: { x: number; w: number }): void {
      const first = range.x - 160, last = range.x + range.w + 160;
      for (let i = 0; i < trainCount; i++) {
        const direction = i % 2 ? -1 : 1;
        const x = minX + THREE.MathUtils.euclideanModulo(homeCenter + 28 - minX + i * span / trainCount + time * 1.7 * direction, span);
        const visible = x >= first && x <= last;
        let train = trains.get(i);
        if (!train && visible) {
          train = templates.train.clone(); train.name = `ai-city-maglev-${i}`;
          trainLayer.add(train); trains.set(i, train);
        }
        if (!train) continue;
        train.visible = visible;
        if (!visible) continue;
        train.position.copy(aiCityRailPoint(x)); train.position.y += .87; train.position.z += canyonDepth + 35;
        tangent.copy(aiCityRailPoint(x + .1)).sub(aiCityRailPoint(x - .1)).normalize();
        train.quaternion.setFromUnitVectors(axis, tangent);
        if (direction < 0) train.rotateY(Math.PI);
      }
      for (let i = 0; i < droneCount; i++) {
        const direction = i % 2 ? -1 : 1;
        const kind = i % 3;
        const x = minX + THREE.MathUtils.euclideanModulo(homeCenter - 18 - minX + i * span / droneCount + time * (1 + kind * .25) * direction, span);
        const visible = x >= first && x <= last;
        let drone = drones.get(i);
        if (!drone && visible) {
          drone = templates.flyers[kind]!.clone(); drone.name = `ai-city-civilian-flyer-${i}`;
          drones.set(i, drone); droneLayer.add(drone);
        }
        if (!drone) continue;
        drone.visible = visible;
        if (!visible) continue;
        drone.position.set(x, 12.5 + kind * 3.7 + Math.sin(time * .65 + i) * .24, -26 - kind * 10);
        drone.rotation.set(Math.sin(time * .42 + i) * .025, direction < 0 ? Math.PI : 0,
          Math.sin(time * .5 + i) * .025 - direction * .025);
      }
    },
    setNightFactor(night: number): void { glassMaterial.emissiveIntensity = .23 + night * .85; },
    dispose(): void {
      templates.dispose(); hullMaterial.dispose(); glassMaterial.dispose(); lightMaterial.dispose();
      root.removeFromParent(); trainLayer.clear(); droneLayer.clear(); root.clear(); trains.clear(); drones.clear();
    },
  };
}
