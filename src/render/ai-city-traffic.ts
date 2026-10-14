import * as THREE from 'three';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH } from '../config/residence.ts';
import { AI_CITY_LAYERS } from '../config/ai-city-look.ts';
import { createEnemyRig } from './enemy-rig.ts';

const canyonDepth = AI_CITY_LAYERS.find(layer => layer.id === 'canyon')!.depth;

/** 轨道与列车采样同一条世界曲线，跨园区分段时位置和切线连续。 */
export function aiCityRailPoint(x: number): THREE.Vector3 {
  return new THREE.Vector3(x, 7.2 + Math.sin(x * Math.PI / 128) * .7, -34 + Math.sin(x * Math.PI / 128) * 2);
}

export function createAiCityTraffic(homeCenter: number) {
  const root = new THREE.Group(); root.name = 'ai-city-traffic';
  const trainLayer = new THREE.Group(), droneLayer = new THREE.Group();
  root.add(trainLayer, droneLayer);
  const hullGeometry = new THREE.BoxGeometry(1, 1, 1);
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xd6dfe2, metalness: .28, roughness: .4 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x245978, emissive: 0x76c6df, emissiveIntensity: .16, roughness: .3 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xd4f6ff, toneMapped: false });
  const trains = new Map<number, THREE.Group>();
  const drones = new Map<number, ReturnType<typeof createEnemyRig>>();
  const minX = RESIDENCE_WORLD.minX - RESIDENCE_SEGMENT_WIDTH * 2;
  const span = RESIDENCE_WORLD.width + RESIDENCE_SEGMENT_WIDTH * 4;
  const trainCount = Math.ceil(span / 196);
  const droneCount = Math.ceil(span / 112);
  const tangent = new THREE.Vector3(), axis = new THREE.Vector3(1, 0, 0);
  function makeTrain(): THREE.Group {
    const group = new THREE.Group(); trainLayer.add(group);
    for (let car = 0; car < 3; car++) {
      const hull = new THREE.Mesh(hullGeometry, hullMaterial);
      hull.scale.set(1.8, .64, .86); hull.position.x = -car * 1.94;
      const glass = new THREE.Mesh(hullGeometry, glassMaterial);
      glass.scale.set(1.44, .31, .045); glass.position.set(-car * 1.94, .07, .45);
      group.add(hull, glass);
    }
    const lamp = new THREE.Mesh(hullGeometry, lightMaterial);
    lamp.scale.set(.08, .12, .56); lamp.position.set(.91, -.08, 0); group.add(lamp);
    return group;
  }
  return { root, trains: trainLayer, drones: droneLayer,
    update(time: number, range: { x: number; w: number }): void {
      const first = range.x - 160, last = range.x + range.w + 160;
      for (let i = 0; i < trainCount; i++) {
        const x = minX + THREE.MathUtils.euclideanModulo(i * span / trainCount + time * 2.6, span);
        const visible = x >= first && x <= last;
        let train = trains.get(i);
        if (!train && visible) { train = makeTrain(); trains.set(i, train); }
        if (!train) continue;
        train.visible = visible;
        if (!visible) continue;
        train.position.copy(aiCityRailPoint(x)); train.position.y += .7; train.position.z += canyonDepth + 35;
        tangent.copy(aiCityRailPoint(x + .1)).sub(aiCityRailPoint(x - .1)).normalize();
        train.quaternion.setFromUnitVectors(axis, tangent);
      }
      for (let i = 0; i < droneCount; i++) {
        const direction = i % 2 ? -1 : 1;
        const x = minX + THREE.MathUtils.euclideanModulo(homeCenter - 22 - minX + i * span / droneCount + time * 2.15 * direction, span);
        const visible = x >= first && x <= last;
        let drone = drones.get(i);
        if (!drone && visible) {
          drone = createEnemyRig('watchWasp', i % 2 ? 7 : 0);
          drone.root.name = `ai-city-courier-${i}`;
          drone.root.scale.setScalar(.62);
          drone.root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false; });
          drones.set(i, drone); droneLayer.add(drone.root);
        }
        if (!drone) continue;
        drone.root.visible = visible;
        if (!visible) continue;
        drone.root.position.set(x, 12 + i % 3 * 2.2 + Math.sin(time * .45 + i) * .25, -24 - i % 2 * 11);
        drone.root.rotation.set(0, direction < 0 ? Math.PI : 0, -direction * .045);
        drone.pose('move', (time + i * .37) % drone.duration('move'), 0, 0, null);
      }
    },
    setNightFactor(night: number): void { glassMaterial.emissiveIntensity = .16 + night * 1.1; },
    dispose(): void {
      for (const drone of drones.values()) drone.dispose();
      hullGeometry.dispose(); hullMaterial.dispose(); glassMaterial.dispose(); lightMaterial.dispose();
      root.removeFromParent(); root.clear(); trains.clear(); drones.clear();
    },
  };
}
