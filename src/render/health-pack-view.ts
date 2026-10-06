import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp } from '../core/math.ts';
import type { EntityViewFactory } from './view-registry.ts';

interface SharedHeart {
  readonly geometry: THREE.BufferGeometry;
  readonly red: THREE.MeshLambertMaterial;
  readonly ringGeometry: THREE.RingGeometry;
}

// 全部血包共用同一份几何体与心形材质：逐个生成会在击杀掉落时卡顿。整个会话常驻，不随单个血包释放。
let shared: SharedHeart | null = null;

function createSharedHeart(): SharedHeart {
  const sphere = new THREE.SphereGeometry(1, 64, 48);
  const positions = sphere.attributes.position!;
  // 只压低上缘中央、收窄下半部，保留整颗球的连续鼓面，不沿中线折叠左右两瓣。
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const notch = .4 * Math.exp(-x * x / .065) * Math.max(0, y) ** 2;
    positions.setXYZ(i, .5 * x * (.78 + .22 * y), .44 + .37 * (y - notch), .24 * z);
  }
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  geometry.computeVertexNormals();
  const red = new THREE.MeshLambertMaterial({ color: '#df3449', emissive: '#8d1725', emissiveIntensity: .12 });
  red.userData.lightFloor = .6;
  return { geometry, red, ringGeometry: new THREE.RingGeometry(.43, .48, 32) };
}

export const createHealthPackView: EntityViewFactory = entity => {
  const { geometry, red, ringGeometry } = (shared ??= createSharedHeart());
  const root = new THREE.Group();
  root.name = 'health-pack';
  const heart = new THREE.Mesh(geometry, red);
  heart.castShadow = true;
  heart.receiveShadow = true;
  // 环的透明度按各自相位脉动，材质保持每个血包一份。
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ff8b9e', transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide });
  ringMaterial.userData.noLightMap = true;
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .035;
  root.add(heart, ring);
  let time = entity.id * .9;
  return {
    object: root,
    sync(e, alpha, frameDt) {
      time += frameDt;
      root.position.set(lerp(e.body.prevX, e.body.x, alpha), lerp(e.body.prevY, e.body.y, alpha), .18);
      heart.position.y = .025 + Math.sin(time * 2.5) * .035;
      heart.rotation.y = .25 + Math.sin(time * 1.1) * .45;
      ringMaterial.opacity = .18 + Math.sin(time * 2.5) * .04;
    },
    dispose() {
      root.removeFromParent();
      ringMaterial.dispose();
    },
  };
};
