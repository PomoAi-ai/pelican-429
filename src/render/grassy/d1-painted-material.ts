import * as THREE from 'three';
import { injectAfter } from '../tile/tile-material.ts';
import { createD1GouacheMaterial } from './d1-gouache-material.ts';
import { studyParameters, type StudySource, type StudySurface } from './d1-study-surface.ts';

export function createD1PaintedMaterial(source: StudySource, geometry: THREE.BufferGeometry, surface: StudySurface): THREE.Material {
  if (surface !== 'hair') return createD1GouacheMaterial(source, geometry, surface);
  const material = new THREE.MeshPhysicalMaterial({
    ...studyParameters(source), name: `${source.name} painted`,
    roughness: 1, metalness: 0, specularIntensity: 0,
  });
  material.onBeforeCompile = shader => {
    // 原画已包含明暗；在线性输出、色调映射前只混入少量现场漫反射。
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'opaque_fragment', `
      gl_FragColor.rgb = 0.75 * diffuseColor.rgb + 0.25 * outgoingLight;
    `, material.name);
  };
  material.customProgramCacheKey = () => 'd1-study-painted';
  return material;
}
