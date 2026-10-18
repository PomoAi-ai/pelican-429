import * as THREE from 'three';

interface PaintedLayer {
  readonly name: string;
  readonly texture: THREE.Texture;
  readonly z: number;
  readonly parallax: number;
  readonly lift: number;
  readonly scale?: number;
  readonly aspect?: number;
}

interface PaintedFraming {
  readonly centerX: number;
  readonly halfWidth: number;
  readonly centerY: number;
  readonly halfHeight: number;
  readonly horizon?: number;
  readonly cover?: number;
  readonly aspect?: number;
  readonly cameraFacing?: boolean;
}

/** Frame authored banks and water together before applying bounded layer travel. */
export function createPaintedBackdrop(definitions: readonly PaintedLayer[], framing: PaintedFraming) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const root = new THREE.Group();
  const layers = definitions.map((definition, index) => {
    const { name, texture, z } = definition;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, fog: false, transparent: name !== 'sky', depthWrite: false });
    material.userData.noLightMap = true;
    material.userData.noCloudShadow = true;
    material.userData.noPrecip = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.z = z;
    mesh.renderOrder = index - definitions.length;
    mesh.frustumCulled = false;
    root.add(mesh);
    return { ...definition, mesh, material };
  });
  const cameraPosition = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();
  const rootRotation = new THREE.Quaternion();
  const imageAspect = framing.aspect ?? 1.5;
  return {
    root,
    layers,
    update(camera: THREE.Camera) {
      const projection = camera.projectionMatrix.elements;
      const aspect = projection[5]! / projection[0]!;
      const cover = Math.max(framing.cover ?? 1.45, aspect / imageAspect * 1.08);
      const horizon = framing.horizon ?? THREE.MathUtils.clamp(0.72 + (aspect - 16 / 9) * 0.11, 0.72, 0.82);
      const travelX = THREE.MathUtils.clamp((camera.position.x - framing.centerX) / framing.halfWidth, -1, 1);
      const travelY = THREE.MathUtils.clamp((camera.position.y - framing.centerY) / framing.halfHeight, -1, 1);
      if (framing.cameraFacing) {
        camera.getWorldPosition(cameraPosition);
        camera.getWorldQuaternion(cameraRotation);
        root.updateWorldMatrix(true, false);
        root.getWorldQuaternion(rootRotation).invert();
      }
      for (const { mesh, z, parallax, lift, scale = 1, aspect: layerAspect = imageAspect } of layers) {
        const distance = camera.position.z - z;
        const viewHeight = 2 * distance / projection[5]!;
        const viewWidth = 2 * distance / projection[0]!;
        const layerCover = cover * scale;
        const height = viewHeight * layerCover;
        const width = height * layerAspect;
        const marginX = Math.max(0, (width - viewWidth) / 2);
        const marginY = Math.max(0, (height - viewHeight) / 2);
        const partial = scale < 1;
        const horizontalTravel = partial ? viewWidth * 0.13 : Math.min(marginX, viewWidth * 0.13);
        const verticalTravel = partial ? viewHeight * 0.12 * parallax : Math.min(marginY, viewHeight * 0.12 * parallax);
        const framedY = viewHeight * (0.5 + layerCover * (0.57 - 0.5) - horizon + lift);
        // Small transparent skyline inserts need placement, not full-screen edge protection.
        const offsetY = (partial ? framedY : THREE.MathUtils.clamp(
          framedY, -marginY + verticalTravel, marginY - verticalTravel,
        )) - travelY * verticalTravel;
        const offsetX = -travelX * horizontalTravel * parallax;
        mesh.scale.set(width, height, 1);
        if (framing.cameraFacing) {
          // Keep painted water flat on screen while foreground geometry retains real perspective.
          mesh.position.set(offsetX, offsetY, -distance).applyQuaternion(cameraRotation).add(cameraPosition);
          root.worldToLocal(mesh.position);
          mesh.quaternion.copy(rootRotation).multiply(cameraRotation);
        } else {
          mesh.position.set(camera.position.x + offsetX, camera.position.y + offsetY, z);
        }
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
