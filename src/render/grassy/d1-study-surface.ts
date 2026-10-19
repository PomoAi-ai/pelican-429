import * as THREE from 'three';
import { injectAfter } from '../tile/tile-material.ts';
import { D1_EYE_SOCKET_MATERIAL } from './d1-spherical-eyes.ts';

export type StudySurface = 'skin' | 'face' | 'hair' | 'cloth';
export type StudySource = THREE.MeshToonMaterial;
export type StudyShader = Parameters<THREE.Material['onBeforeCompile']>[0];

const SURFACES: Readonly<Record<string, StudySurface>> = {
  Body: 'skin', 'Neck source-color transition': 'skin', model: 'face',
  [D1_EYE_SOCKET_MATERIAL]: 'skin',
  'model.001': 'hair', 'Golden hair roots': 'hair', 'D1 V3 dress': 'cloth',
  'D1 refined detail': 'cloth', 'D1 refined skin': 'cloth', 'D1 refined blue': 'cloth',
};

export function studySurface(source: THREE.Material): StudySurface {
  const surface = SURFACES[source.name];
  if (!surface) throw new Error(`D1 着色研究未登记材质：${source.name}`);
  return surface;
}

export function studyParameters(source: StudySource) {
  return {
    color: source.color, map: source.map, vertexColors: source.vertexColors,
    side: source.side, alphaTest: source.alphaTest,
    normalMap: source.normalMap, normalScale: source.normalScale.clone(),
  };
}

const SKIN_COLOR = `
  vec3 original = diffuseColor.rgb;
  float skin = smoothstep( 0.06, 0.28, dot( original, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  diffuseColor.rgb = mix( original, vec3( 0.98, 0.86, 0.82 ), skin * 0.6 );
  diffuseColor.gb -= max( vec2( 0.0 ), vec2( original.r ) - original.gb - vec2( 0.3, 0.35 ) ) * skin * 0.24;
`;
const HAIR_COLOR = `
  // 保留原图的发束色差，并用低幅暖色补偿避免烘焙 AO 与自阴影重复压黑。
  diffuseColor.rgb = diffuseColor.rgb * vec3( 1.55, 2.3, 3.4 ) + vec3( 0.018, 0.01, 0.004 );
`;
const CLOTH_COLOR = `
  vec3 original = diffuseColor.rgb;
  float blue = smoothstep( 0.04, 0.18, original.b - original.r );
  float white = smoothstep( 0.3, 0.65, min( original.r, min( original.g, original.b ) ) );
  float gold = smoothstep( 0.18, 0.42, original.r - original.b ) * smoothstep( 0.12, 0.3, original.g );
  diffuseColor.rgb = mix( original, original * vec3( 0.65, 1.45, 1.5 ), blue );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( original, vec3( 0.96, 0.96, 1.0 ), 0.6 ), white );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.75, 0.36, 0.04 ), vec3( 1.0, 0.76, 0.19 ), original.r ), gold );
`;

/** 只共用资源采样和颜色标定；三个家族分别定义实际光照方程。 */
export function patchStudySurface(shader: StudyShader, surface: StudySurface, geometry: THREE.BufferGeometry, name: string): void {
  const geometricFlow = geometry.hasAttribute('d1HairFlow');
  shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'varying vec3 vStudyPosition;', name);
  shader.vertexShader = injectAfter(shader.vertexShader, 'begin_vertex', 'vStudyPosition = position;', name);
  shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'varying vec3 vStudyPosition;', name);
  const hairColor = geometry.hasAttribute('d1StrandId') ? '' : geometricFlow ? 'diffuseColor.rgb *= vec3( 1.08, 1.12, 1.16 );' : HAIR_COLOR;
  shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', surface === 'hair' ? hairColor : surface === 'cloth' ? CLOTH_COLOR : SKIN_COLOR, name);
  if (surface === 'face') {
    const bounds = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
    shader.uniforms.studyHeadCenter = { value: bounds.getCenter(new THREE.Vector3()) };
    shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'uniform vec3 studyHeadCenter;', name);
    shader.vertexShader = injectAfter(shader.vertexShader, 'beginnormal_vertex', `
      vec3 sphere = normalize( position - studyHeadCenter );
      objectNormal = normalize( mix( objectNormal, sphere, 0.7 * smoothstep( -0.05, 0.5, sphere.z ) ) );
    `, name);
  }
  if (surface === 'hair') {
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'vec3 studyStrand;', name);
    if (geometricFlow) {
      shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'attribute vec3 d1HairFlow; varying vec3 vStudyFlow;', name);
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'varying vec3 vStudyFlow;', name);
      shader.vertexShader = injectAfter(shader.vertexShader, 'skinnormal_vertex', `
        vec3 objectFlow = d1HairFlow;
        #ifdef USE_SKINNING
          objectFlow = ( skinMatrix * vec4( objectFlow, 0.0 ) ).xyz;
        #endif
        vStudyFlow = mat3( modelViewMatrix ) * objectFlow;
      `, name);
    }
    // Rodin 是任意 UV 岛，使用显式发流；旧图集则沿已蒙皮的根梢方向采样。
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'normal_fragment_maps', `
      vec3 flow = ${geometricFlow ? 'vStudyFlow' : 'dFdx( -vViewPosition ) * dFdy( vMapUv.x ) - dFdy( -vViewPosition ) * dFdx( vMapUv.x )'};
      flow -= normal * dot( normal, flow );
      studyStrand = flow * inversesqrt( max( dot( flow, flow ), 1e-12 ) );
    `, name);
  }
}

export const FIBER_LOBES = `
float studyFiberLobe( vec3 T, vec3 N, vec3 H, float shift, float exponent ) {
  float tangentHalf = dot( normalize( T + N * shift ), H );
  return pow( max( 0.0, 1.0 - tangentHalf * tangentHalf ), exponent ) * smoothstep( -1.0, 0.0, tangentHalf );
}
`;
