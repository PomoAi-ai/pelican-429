import * as THREE from 'three';
import { FACILITY_SCENES } from '../config/facility-scenes.ts';

export interface FacilitySkyTextures {
  readonly sky: THREE.Texture;
  readonly farCity: THREE.Texture;
  readonly middleDistrict: THREE.Texture;
  readonly nearRooftops: THREE.Texture;
}

/** Separate city depths keep the skyline stable while nearby roofs move with a jump. */
export function createFacilitySky(textures: FacilitySkyTextures) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const root = new THREE.Group();
  root.name = 'fortress-city-depth';
  const layers = ([
    ['sky', -120, 0, 0],
    ['farCity', -92, 0.06, 0.075],
    ['middleDistrict', -60, 0.32, -0.045],
    ['nearRooftops', -28, 0.9, 0],
  ] as const).map(([name, z, parallax, lift], index) => {
    const texture = textures[name];
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, fog: false, transparent: name !== 'sky', depthWrite: false });
    material.userData.noLightMap = true;
    material.userData.noCloudShadow = true;
    material.userData.noPrecip = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fortress-city-${name}`;
    mesh.position.z = z;
    mesh.renderOrder = index - 4;
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, material, texture, parallax, lift };
  });
  return {
    root,
    update(camera: THREE.Camera) {
      const projection = camera.projectionMatrix.elements;
      const aspect = projection[5]! / projection[0]!;
      const cover = Math.max(1.45, aspect / 1.5 * 1.08);
      const horizon = THREE.MathUtils.clamp(0.72 + (aspect - 16 / 9) * 0.11, 0.72, 0.82);
      const halfWidth = FACILITY_SCENES.fortress.width / 2;
      const travelX = THREE.MathUtils.clamp((camera.position.x - halfWidth) / halfWidth, -1, 1);
      const travelY = THREE.MathUtils.clamp((camera.position.y - 52.5) / 47.5, -1, 1);
      for (const { mesh, parallax, lift } of layers) {
        const distance = camera.position.z - mesh.position.z;
        const viewHeight = 2 * distance / projection[5]!;
        const viewWidth = 2 * distance / projection[0]!;
        // Keep the artwork scale stable; z alone must not enlarge a distant building.
        const height = viewHeight * cover;
        const width = height * 1.5;
        const marginX = (width - viewWidth) / 2;
        const marginY = (height - viewHeight) / 2;
        // Lower the shared horizon in wide previews so the tallest distant tower stays visible.
        const horizontalTravel = Math.min(marginX, viewWidth * 0.13);
        const verticalTravel = viewHeight * 0.12 * parallax;
        // Separate the banks with open water, reserving each layer's full jump travel.
        const framing = THREE.MathUtils.clamp(
          viewHeight * (0.5 + cover * (0.57 - 0.5) - horizon + lift),
          -marginY + verticalTravel, marginY - verticalTravel,
        );
        mesh.scale.set(width, height, 1);
        // Spread travel across the full fortress bounds so a jump never hits a layer's edge early.
        mesh.position.x = camera.position.x - travelX * horizontalTravel * parallax;
        mesh.position.y = camera.position.y + framing - travelY * verticalTravel;
      }
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      for (const { material, texture } of layers) {
        material.dispose();
        texture.dispose();
      }
    },
  };
}
