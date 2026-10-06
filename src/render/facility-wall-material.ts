import * as THREE from 'three';
import { injectAfter } from './tile-material.ts';

/** 后墙保持屏幕构图，近距离行走不会把整座大厅的图片放大成色块。 */
export function createFacilityWallMaterial(background: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: background, emissiveMap: background, emissive: 0xffffff,
    emissiveIntensity: 0.25, roughness: 0.68, metalness: 0,
  });
  const declarations = 'varying vec4 vWallClip;\nvarying vec2 vWallCover;';
  material.onBeforeCompile = shader => {
    shader.uniforms.uWallAspect = { value: background.image.width / background.image.height };
    shader.vertexShader = injectAfter(shader.vertexShader, 'common', `${declarations}\nuniform float uWallAspect;`, 'facility-wall');
    shader.vertexShader = injectAfter(shader.vertexShader, 'project_vertex', `
      vWallClip = gl_Position;
      float wallViewportAspect = projectionMatrix[1][1] / projectionMatrix[0][0];
      vWallCover = vec2( min( 1.0, wallViewportAspect / uWallAspect ), min( 1.0, uWallAspect / wallViewportAspect ) );
    `, 'facility-wall');
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', declarations, 'facility-wall');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 wallUv = ( vWallClip.xy / vWallClip.w ) * 0.5 * vWallCover + 0.5;
      wallUv.y = 1.0 - wallUv.y;
      ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'wallUv')}
    `).replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replaceAll('vEmissiveMapUv', 'wallUv'));
  };
  material.customProgramCacheKey = () => 'facility-wall-projected';
  return material;
}
