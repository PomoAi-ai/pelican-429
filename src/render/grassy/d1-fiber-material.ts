import * as THREE from 'three';
import { injectAfter } from '../tile-material.ts';
import { FIBER_LOBES, patchStudySurface, studyParameters, type StudySource, type StudySurface } from './d1-study-surface.ts';

export function createD1FiberMaterial(source: StudySource, geometry: THREE.BufferGeometry, surface: StudySurface): THREE.Material {
  const hair = surface === 'hair';
  const skin = surface === 'skin' || surface === 'face';
  const material = new THREE.MeshPhysicalMaterial({
    ...studyParameters(source), name: `${source.name} fiber`,
    roughness: hair ? 0.42 : skin ? 0.68 : 0.82,
    specularIntensity: hair ? 0 : skin ? 0.22 : 0.35,
    sheen: surface === 'cloth' ? 0.38 : 0, sheenColor: new THREE.Color('#b9caff'), sheenRoughness: 0.8,
  });
  material.onBeforeCompile = shader => {
    patchStudySurface(shader, surface, geometry, material.name);
    if (surface === 'cloth') {
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = mix( roughnessFactor, 0.34, gold );', material.name);
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'metalnessmap_fragment', 'metalnessFactor = gold * 0.48;', material.name);
    }
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_physical_pars_fragment', `
      ${hair ? FIBER_LOBES : ''}
      void RE_Direct_Fiber( const in IncidentLight light, const in vec3 position, const in vec3 normal,
        const in vec3 view, const in vec3 clearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
        RE_Direct_Physical( light, position, normal, view, clearcoatNormal, material, reflectedLight );
        float cosine = dot( normal, light.direction );
        ${hair ? `
          vec3 H = normalize( light.direction + view );
          float primary = studyFiberLobe( studyStrand, normal, H, 0.1, 72.0 );
          float secondary = studyFiberLobe( studyStrand, normal, H, -0.22, 14.0 );
          float facing = smoothstep( -0.2, 0.6, cosine );
          reflectedLight.directSpecular += light.color * ( vec3( 1.0, 0.88, 0.66 ) * primary * 0.18 + material.diffuseColor * secondary * 0.22 ) * facing;
          float transmission = pow( max( dot( -light.direction, view ), 0.0 ), 5.0 ) * ( 1.0 - abs( cosine ) );
          reflectedLight.directDiffuse += light.color * material.diffuseColor * transmission * 0.1;
        ` : skin ? `
          float wrap = max( ( cosine + 0.38 ) / 1.38, 0.0 ) - max( cosine, 0.0 );
          reflectedLight.directDiffuse += light.color * BRDF_Lambert( material.diffuseColor ) * vec3( 1.0, 0.5, 0.38 ) * wrap * 0.65;
        ` : ''}
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Fiber
    `, material.name);
    if (hair) shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      // 浅色发束间的暖色多次反射，用低幅间接项近似，保留直接光的方向高光。
      reflectedLight.indirectDiffuse += material.diffuseColor * vec3( 0.14, 0.09, 0.04 );
    `, material.name);
  };
  material.customProgramCacheKey = () => `d1-study-fiber-${surface}-${geometry.hasAttribute('d1HairFlow')}-${geometry.hasAttribute('d1StrandId')}`;
  return material;
}
