import * as THREE from 'three';
import { injectAfter } from '../tile-material.ts';
import { patchStudySurface, studyParameters, type StudySource, type StudySurface } from './d1-study-surface.ts';

/** 笔触固定在模型表面，镜头运动时不会像屏幕噪点一样滑动。 */
export function createD1GouacheMaterial(source: StudySource, geometry: THREE.BufferGeometry, surface: StudySurface): THREE.Material {
  const material = new THREE.MeshToonMaterial({ ...studyParameters(source), name: `${source.name} gouache` });
  material.normalScale.multiplyScalar(0.45);
  const skin = surface === 'skin' || surface === 'face';
  material.onBeforeCompile = shader => {
    patchStudySurface(shader, surface, geometry, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', `
      float studyBrush( vec3 p ) {
        float broad = sin( p.x * 31.0 + sin( p.y * 17.0 ) * 2.0 ) * sin( p.z * 29.0 + p.y * 12.0 );
        float fiber = sin( p.y * 185.0 + p.x * 23.0 + sin( p.z * 13.0 ) * 3.0 );
        return broad * 0.7 + fiber * 0.3;
      }
    `, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_toon_pars_fragment', `
      void RE_Direct_Gouache( const in IncidentLight light, const in vec3 position, const in vec3 normal,
        const in vec3 view, const in vec3 clearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
        float brush = studyBrush( vStudyPosition );
        float blend = smoothstep( -0.5, 0.8, dot( normal, light.direction ) + brush * 0.1 );
        vec3 cool = ${skin ? 'vec3( 0.78, 0.68, 0.82 )' : surface === 'hair' ? 'vec3( 0.8, 0.43, 0.29 )' : 'vec3( 0.54, 0.62, 0.86 )'};
        vec3 warm = vec3( 1.05, 0.96, 0.83 );
        reflectedLight.directDiffuse += light.color * BRDF_Lambert( material.diffuseColor ) * mix( cool * 0.52, warm, blend );
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Gouache
    `, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      reflectedLight.indirectDiffuse *= 0.65;
      reflectedLight.indirectDiffuse += material.diffuseColor * 0.16;
      reflectedLight.directDiffuse *= 1.0 + studyBrush( vStudyPosition ) * ${skin ? '0.012' : '0.055'};
    `, material.name);
  };
  material.customProgramCacheKey = () => `d1-study-gouache-${surface}-${geometry.hasAttribute('d1HairFlow')}-${geometry.hasAttribute('d1StrandId')}`;
  return material;
}
