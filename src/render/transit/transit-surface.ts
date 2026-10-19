import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hash01 } from '../../core/rng.ts';
import type { EnvironmentGenerator } from '../stage/stage.ts';

/** Local gantry reflections give steel a readable polish without changing the city's sky or lights. Takes ownership of pmrem. */
export function createTransitSurface(pmrem: EnvironmentGenerator) {
  const room = new RoomEnvironment();
  const panelGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, y, z, width, height, tint] of [
    [-5.5, 6.5, 7.8, .75, 18, 0xe9f2ff],
    [7.7, 7.5, 4.2, 1.15, 19, 0xffe2b8],
  ] as const) {
    const panel = new THREE.Mesh(panelGeometry, new THREE.MeshLambertMaterial({ color: 0,
      emissive: tint, emissiveIntensity: 7 }));
    panel.position.set(x, y, z);
    panel.scale.set(width, height, .12);
    panel.lookAt(0, y, 0);
    room.add(panel);
  }
  room.rotation.y = -.35;
  // Inside the corridor the steel mirrors coloured light rings around its axis, the white core ahead
  // and the exhaust glow behind, instead of a bright studio.
  const tunnel = new THREE.Scene();
  const tunnelGeometries = [new THREE.TorusGeometry(6, .22, 8, 64), new THREE.SphereGeometry(1, 24, 16), new THREE.BoxGeometry(.18, 26, .18)];
  const tunnelMaterials = [0x3f8dff, 0x9b4dff, 0xdfe9ff, 0xffffff, 0xff7a4a, 0x55c8ff].map((color, i) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar([2.2, 2.2, 1.6, 8, 3, 1.4][i]!) }));
  [-9, -4, 1, 6, 11, 16].forEach((y, i) => {
    const ring = new THREE.Mesh(tunnelGeometries[0], tunnelMaterials[i % 3]);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; tunnel.add(ring);
  });
  for (const [y, radius, material] of [[42, 9, 3], [-14, 4, 4]] as const) {
    const glow = new THREE.Mesh(tunnelGeometries[1], tunnelMaterials[material]);
    glow.position.y = y; glow.scale.setScalar(radius); tunnel.add(glow);
  }
  for (let i = 0; i < 8; i++) {
    const streak = new THREE.Mesh(tunnelGeometries[2], tunnelMaterials[5]);
    streak.position.set(Math.cos(i * Math.PI / 4) * 7.5, 4, Math.sin(i * Math.PI / 4) * 7.5); tunnel.add(streak);
  }
  let environment: THREE.RenderTarget, corridor: THREE.RenderTarget;
  try { environment = pmrem.fromScene(room, .02); corridor = pmrem.fromScene(tunnel, .02); }
  finally {
    room.dispose(); pmrem.dispose();
    for (const item of [...tunnelGeometries, ...tunnelMaterials]) item.dispose();
  }

  const width = 128, height = 256;
  const roughPixels = new Uint8Array(width * height * 4);
  const normalPixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const stroke = hash01(y, 17, 891) - .5;
    const grain = hash01(x, y, 476) - .5;
    const roughness = Math.round(210 + stroke * 38 + grain * 10);
    roughPixels.set([roughness, roughness, roughness, 255], index);
    normalPixels.set([128 + Math.round(grain * 3), 128 + Math.round(stroke * 24), 255, 255], index);
  }
  const roughness = new THREE.DataTexture(roughPixels, width, height);
  const normal = new THREE.DataTexture(normalPixels, width, height);
  for (const texture of [roughness, normal]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 8);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  roughness.name = 'fine rolled steel roughness';
  normal.name = 'circumferential brushed steel grain';
  return {
    environment: environment.texture, corridor: corridor.texture, roughness, normal,
    dispose(): void { environment.dispose(); corridor.dispose(); roughness.dispose(); normal.dispose(); },
  };
}
