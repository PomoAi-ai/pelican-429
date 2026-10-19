import * as THREE from 'three';
import { FACILITY_SCENES } from '../../config/facility-scenes.ts';
import { createPaintedBackdrop } from '../sky/painted-backdrop.ts';

export interface FacilitySkyTextures {
  readonly sky: THREE.Texture;
  readonly farCity: THREE.Texture;
  readonly middleDistrict: THREE.Texture;
  readonly nearRooftops: THREE.Texture;
}

/** Separate city depths keep the skyline stable while nearby roofs move with a jump. */
export function createFacilitySky(textures: FacilitySkyTextures) {
  const backdrop = createPaintedBackdrop(([
    ['sky', -120, 0, 0],
    ['farCity', -92, 0.06, 0.075],
    ['middleDistrict', -60, 0.32, -0.045],
    ['nearRooftops', -28, 0.9, 0],
  ] as const).map(([name, z, parallax, lift]) => ({ name, texture: textures[name], z, parallax, lift })), {
    centerX: FACILITY_SCENES.fortress.width / 2,
    halfWidth: FACILITY_SCENES.fortress.width / 2,
    centerY: 52.5,
    halfHeight: 47.5,
  });
  backdrop.root.name = 'fortress-city-depth';
  for (const { mesh } of backdrop.layers) mesh.name = `fortress-city-${mesh.name}`;
  return backdrop;
}
