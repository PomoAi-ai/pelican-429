import type { Material } from 'three';
import { addNodePatch } from '../stage/node-patches.ts';

// fogFar − fogNear 是雾色达到一半的距离，最多混到 65%，避免远处地形比身后的远山还淡。
export const DEPTH_HAZE_HALF_DISTANCE = 25;
export const HAZE_MAX = .65;
const HAZE_FRAGMENT = /* glsl */ `
  #ifdef USE_FOG
    float fogFactor = min(1.0 - exp2(-max(vFogDepth - fogNear, 0.0) / (fogFar - fogNear)), ${HAZE_MAX.toFixed(2)});
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif`;

/** 与着色器同式的静态雾量：平面 z 上的物体（起雾点在 z=.3，场景雾 near = 镜头 z − .3），给不接受雾的环境层直接混色。 */
export function depthHazeAmount(z: number): number {
  return Math.min(1 - 2 ** (-Math.max(.3 - z, 0) / DEPTH_HAZE_HALF_DISTANCE), HAZE_MAX);
}

export function applyDepthHaze(material: Material): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', HAZE_FRAGMENT);
  };
  material.customProgramCacheKey = () => `${key.call(material)}|depth-haze`;
  addNodePatch(material, { kind: 'depth-haze' });
}
