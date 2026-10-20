import * as THREE from 'three';
import { FACILITY_SCENES } from '../../config/facility-scenes.ts';
import { createPaintedBackdrop } from '../sky/painted-backdrop.ts';
import { DEPTH_G } from '../../config/depth-layers.ts';

const { distance } = DEPTH_G;

export interface FacilitySkyTextures {
  readonly sky: THREE.Texture;
  readonly farCity: THREE.Texture;
  readonly middleDistrict: THREE.Texture;
  readonly nearRooftops: THREE.Texture;
}

/** 三层城景按方案 G 的三层远景层距摆放（天空在最远层之后），远处天际线稳定、近处屋顶随跳跃移动；画面按层距取景，换层距不改构图。 */
export function createFacilitySky(textures: FacilitySkyTextures) {
  const backdrop = createPaintedBackdrop(([
    ['sky', distance['distance-far'] - 10, 0, 0],
    ['farCity', distance['distance-far'], 0.06, 0.075],
    ['middleDistrict', distance['distance-mid'], 0.32, -0.045],
    ['nearRooftops', distance['distance-near'], 0.9, 0],
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
