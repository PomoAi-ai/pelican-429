import * as THREE from 'three';
import { createEnemyRig, loadEnemyAsset } from '../character/enemy-rig.ts';
import { HARBOR_RAILS, HARBOR_LAKE_RAILS } from '../../config/harbor-painted.ts';

// 图集区域按原图1536×1024的可见轮廓裁切，从左上角计量。
const CAR_REGIONS = [
  [12 / 1536, 160 / 1024, 762 / 1536, 535 / 1024],
  [774 / 1536, 160 / 1024, 1526 / 1536, 535 / 1024],
  [12 / 1536, 675 / 1024, 763 / 1536, 925 / 1024],
  [774 / 1536, 675 / 1024, 1527 / 1536, 925 / 1024],
] as const;
const TRAIN_REGIONS = [
  [31 / 1536, 223 / 1024, 1513 / 1536, 457 / 1024],
  [52 / 1536, 593 / 1024, 1489 / 1536, 835 / 1024],
] as const;
type Region = readonly [left: number, top: number, right: number, bottom: number];

/** 正式载具的侧视原画与哨蜂模型共用XY横版镜头，各自在自己的景深层巡航。 */
export async function createHarborPaintedTraffic(width: number, textures: ReadonlyMap<string, THREE.Texture>, centerX = width / 2,
  layout: 'canal' | 'lake' = 'canal') {
  const lake = layout === 'lake';
  const rails = lake ? HARBOR_LAKE_RAILS : HARBOR_RAILS;
  const travelMargin = lake ? 400 : 40;
  await loadEnemyAsset('watchWasp');
  const root = new THREE.Group(); root.name = 'harbor-painted-traffic';
  const trainsRoot = new THREE.Group(), airRoot = new THREE.Group();
  root.add(trainsRoot, airRoot);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const moving: Array<{ object: THREE.Object3D; offset: number; speed: number; y: number; bob: number }> = [];

  function templates(map: THREE.Texture, regions: readonly Region[]) {
    const image = map.image as HTMLImageElement;
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: .75,
      depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
    material.userData.noLightMap = true;
    materials.push(material);
    return regions.map(([left, top, right, bottom]) => {
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, left + uv.getX(i) * (right - left), 1 - bottom + uv.getY(i) * (bottom - top));
      }
      geometries.push(geometry);
      const aspect = image.width * (right - left) / (image.height * (bottom - top));
      return { geometry, material, aspect };
    });
  }

  const cars = templates(textures.get('cars.png')!, CAR_REGIONS);
  const trains = templates(textures.get('trains.png')!, TRAIN_REGIONS);
  const carPlans = [
    { kind: 0, z: -16, y: 6.2, length: 3.8, speed: 2.2, offset: 42 },
    { kind: 1, z: -35, y: 9.6, length: 3.8, speed: -2.6, offset: 71 },
    { kind: 2, z: -16, y: 8.4, length: 3.5, speed: -2.8, offset: 114 },
    { kind: 3, z: -70, y: 12.6, length: 3.6, speed: 2.1, offset: 147 },
    { kind: 0, z: -35, y: 11.5, length: 3.7, speed: 2.4, offset: 183 },
    { kind: 1, z: -70, y: 8.7, length: 4, speed: -1.9, offset: 221 },
    { kind: 2, z: -35, y: 7.4, length: 3.5, speed: 2.9, offset: 260 },
    { kind: 3, z: -16, y: 12, length: 3.4, speed: -2.3, offset: 299 },
  ];
  for (const [index, plan] of carPlans.entries()) {
    const template = cars[plan.kind]!;
    const object = new THREE.Mesh(template.geometry, template.material);
    object.name = `harbor-painted-car-${index}`;
    // 原画车头朝左；正向巡航只翻侧视平面，不旋转到图背面。
    const length = plan.length * (lake ? .85 : 1);
    object.scale.set(plan.speed > 0 ? -length : length, length / template.aspect, 1);
    object.position.z = lake ? plan.z * 4 - 10 : plan.z;
    airRoot.add(object);
    moving.push({ object, offset: plan.offset, speed: plan.speed, y: plan.y * (lake ? 1.7 : 1), bob: .08 });
  }
  for (const [index, plan] of [
    { ...rails[0], length: 11, speed: 4.2, offset: 76 },
    { ...rails[1], length: 10, speed: -3.6, offset: 118 },
  ].entries()) {
    const template = trains[index]!;
    const object = new THREE.Mesh(template.geometry, template.material);
    object.name = index === 0 ? 'harbor-enclosed-maglev' : 'harbor-open-air-maglev';
    object.scale.set(plan.speed > 0 ? -plan.length : plan.length, plan.length / template.aspect, 1);
    object.position.z = plan.z;
    trainsRoot.add(object);
    moving.push({ object, offset: plan.offset, speed: plan.speed, y: plan.top, bob: 0 });
  }

  const drones = [
    { z: -7, y: 5.1, speed: 1.2, offset: 38 },
    { z: -16, y: 7.5, speed: -1.5, offset: 83 },
    { z: -7, y: 8.7, speed: -1.1, offset: 132 },
    { z: -16, y: 6.4, speed: 1.4, offset: 174 },
  ].map((plan, index) => {
    const rig = createEnemyRig('watchWasp', index);
    rig.root.name = `harbor-watch-wasp-${index}`;
    rig.root.position.z = lake ? plan.z * 3 : plan.z;
    if (lake) rig.root.scale.multiplyScalar(.7);
    rig.root.rotation.y = plan.speed < 0 ? Math.PI : 0;
    rig.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.userData.noLightMap = true;
    });
    airRoot.add(rig.root);
    moving.push({ object: rig.root, offset: plan.offset, speed: plan.speed, y: plan.y, bob: .14 });
    return rig;
  });

  return { root, trains: trainsRoot, air: airRoot,
    setNightFactor(night: number): void {
      for (const material of materials) {
        if (material instanceof THREE.MeshBasicMaterial) material.color.setRGB(1 - night * .55, 1 - night * .48, 1 - night * .3);
      }
    },
    update(time: number): void {
      for (const item of moving) {
        item.object.position.x = THREE.MathUtils.euclideanModulo(item.offset + centerX - 88 + time * item.speed + travelMargin,
          width + travelMargin * 2) - travelMargin;
        item.object.position.y = item.y + Math.sin(time * .9 + item.offset) * item.bob;
      }
      for (const [index, rig] of drones.entries()) rig.pose('move', (time + index * .37) % rig.duration('move'), 0, 0, null);
    },
    dispose(): void {
      for (const rig of drones) rig.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}
