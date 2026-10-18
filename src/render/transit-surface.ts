import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hash01 } from '../core/rng.ts';

/** Local gantry reflections give steel a readable polish without changing the city's sky or lights. */
export function createTransitSurface(renderer: THREE.WebGLRenderer) {
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget;
  try { environment = pmrem.fromScene(room, .02); }
  finally { room.dispose(); pmrem.dispose(); }

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
    environment: environment.texture, roughness, normal,
    dispose(): void { environment.dispose(); roughness.dispose(); normal.dispose(); },
  };
}
