import * as THREE from 'three';
import { injectAfter } from '../tile-material.ts';
import { FIBER_LOBES, patchStudySurface, studyParameters, type StudySource, type StudySurface } from './d1-study-surface.ts';

export function createD1InkMaterial(source: StudySource, geometry: THREE.BufferGeometry, surface: StudySurface): THREE.Material {
  const material = new THREE.MeshToonMaterial({ ...studyParameters(source), name: `${source.name} ink` });
  const hair = surface === 'hair';
  const skin = surface === 'skin' || surface === 'face';
  material.normalScale.multiplyScalar(hair ? 0.32 : 0.65);
  material.onBeforeCompile = shader => {
    patchStudySurface(shader, surface, geometry, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_toon_pars_fragment', `
      ${hair ? FIBER_LOBES : ''}
      void RE_Direct_Ink( const in IncidentLight light, const in vec3 position, const in vec3 normal,
        const in vec3 view, const in vec3 clearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
        float cosine = dot( normal, light.direction );
        float band = smoothstep( -0.14, 0.16, cosine ) * 0.7 + smoothstep( 0.46, 0.66, cosine ) * 0.3;
        vec3 shadow = ${skin ? 'vec3( 0.92, 0.73, 0.73 )' : hair ? 'vec3( 0.78, 0.48, 0.28 )' : 'vec3( 0.58, 0.64, 0.86 )'};
        reflectedLight.directDiffuse += light.color * BRDF_Lambert( material.diffuseColor ) * mix( shadow * 0.38, vec3( 1.0 ), band );
        ${hair ? `
          vec3 H = normalize( light.direction + view );
          float lobe = studyFiberLobe( studyStrand, normal, H, 0.12, 48.0 );
          float glint = smoothstep( 0.3, 0.62, lobe );
          reflectedLight.directDiffuse += light.color * vec3( 1.0, 0.8, 0.43 ) * glint * 0.12 * smoothstep( -0.15, 0.4, cosine );
        ` : ''}
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Ink
    `, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      reflectedLight.indirectDiffuse *= 0.55;
      reflectedLight.indirectDiffuse += material.diffuseColor * ${skin ? '0.22' : '0.12'};
    `, material.name);
  };
  material.customProgramCacheKey = () => `d1-study-ink-${surface}-${geometry.hasAttribute('d1HairFlow')}-${geometry.hasAttribute('d1StrandId')}`;
  return material;
}
