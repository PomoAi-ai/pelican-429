import * as THREE from 'three';

const LID_START = 'vec2 studioUv = vMapUv * 2.0;';
const LID_END = 'vec3 d1Ray = normalize( vD1EyePos );';
const IRIS_GATE = '( 1.0 - step( 0.985, studioClosure ) )';

const REFINED_LID = `
vec2 labUv = vMapUv * 2.0;
vec4 labOpening = texture2D( studioLidProfile, vec2( labUv.x, 0.25 ) );
vec4 labInk = texture2D( studioLidProfile, vec2( labUv.x, 0.75 ) );
float labClose = studioClosure;
float labY = labUv.y;
float labSourceY = labY;
float labInkY = ( labInk.x + labInk.y ) * 0.5;
if ( labOpening.w > 1.5 ) {
  float top = mix( labInk.x, labInk.z, labClose );
  float bottom = mix( labInk.y, labInk.w, labClose );
  labSourceY = mix( labInk.x, labInk.y, ( labY - top ) / max( bottom - top, 0.0001 ) );
  labEyeOpening = 0.0;
} else if ( labOpening.w > 0.5 ) {
  float top = mix( labInk.x, labInk.z, labClose );
  float upper = mix( labOpening.x, labInk.w, labClose );
  float lower = mix( labOpening.y, labInk.w, labClose );
  labInkY = ( labInk.x + labOpening.x ) * 0.5;
  float edge = max( fwidth( labY ), 0.0001 );
  labEyeOpening = smoothstep( upper - edge, upper + edge, labY )
    * ( 1.0 - smoothstep( lower - edge, lower + edge, labY ) )
    * smoothstep( 0.0, edge * 2.0, lower - upper );
  if ( labY < upper ) {
    labSourceY = mix( labInk.x, labOpening.x, ( labY - top ) / max( upper - top, 0.0001 ) );
  } else if ( labY <= lower ) {
    // 眼白阴影随上睑移动，虹膜继续沿原眼平面计算，不挤压、不跟着眼睑滑动。
    labSourceY = labOpening.x + labY - upper;
  } else {
    labSourceY = labOpening.y + ( labY - lower ) / max( 1.0 - labClose, 0.0001 );
  }
} else {
  labEyeOpening = 0.0;
}
d1Lid = texture2D( map, clamp( vec2( labUv.x, labSourceY ), vec2( 0.002 ), vec2( 0.998 ) ) * 0.5 );
vec3 labLashColor = texture2D( map, clamp( vec2( labUv.x, labInkY ), vec2( 0.002 ), vec2( 0.998 ) ) * 0.5 ).rgb;
d1Lid.rgb = mix( labLashColor, d1Lid.rgb, labEyeOpening );
if ( labOpening.w < 0.5 ) d1Lid.a *= 1.0 - labClose;
float labEdge = max( fwidth( labY ), 0.0001 );
if ( labOpening.w > 0.5 ) {
  vec2 labBounds = mix( labInk.xy, labInk.zw, labClose );
  // 只向轮廓外渐隐，裁掉串入的透明边而不削薄睫毛。
  d1Lid.a *= smoothstep( labBounds.x - labEdge, labBounds.x, labY )
    * ( 1.0 - smoothstep( labBounds.y, labBounds.y + labEdge, labY ) );
}
// 末段收敛到闭眼原图，消除眼角轮廓插值留下的睁眼透明边。
float labClosedBlend = smoothstep( 0.97, 1.0, labClose );
d1Lid = mix( d1Lid, texture2D( map, vMapUv + vec2( 0.5 ) ), labClosedBlend );
labEyeOpening *= 1.0 - labClosedBlend;
`;

/** 连续眼睑候选与原版共用同一闭合度，仅装饰当前实验实例的眼部着色。 */
export function applyD1LabEyes(root: THREE.Object3D) {
  const enabled = { value: 1 };
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material.name === 'D1 eye') materials.add(material);
    }
  });
  if (materials.size === 0) throw new Error('D1 连续眼睑需要当前实例的 D1 eye 材质');
  const restore = [...materials].map(material => {
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      const start = shader.fragmentShader.indexOf(LID_START);
      const end = shader.fragmentShader.indexOf(LID_END, start);
      if (start < 0 || end < start || !shader.fragmentShader.includes(IRIS_GATE)) {
        throw new Error('D1 连续眼睑需要先应用摄影棚材质，或摄影棚眼部着色片段已变化');
      }
      const original = shader.fragmentShader.slice(start, end).replace('vec4 d1Lid =', 'd1Lid =');
      const lid = `float labEyeOpening = 1.0;\nvec4 d1Lid;\nif ( labRefinedEyes < 0.5 ) {\n${original}\n} else {\n${REFINED_LID}\n}\n`;
      shader.uniforms.labRefinedEyes = enabled;
      shader.fragmentShader = 'uniform float labRefinedEyes;\n' + shader.fragmentShader.slice(0, start) + lid + shader.fragmentShader.slice(end);
      shader.fragmentShader = shader.fragmentShader.replace(IRIS_GATE, `( labRefinedEyes < 0.5 ? ${IRIS_GATE} : labEyeOpening )`);
    };
    material.customProgramCacheKey = () => `${cacheKey.call(material)}-refined-lid`;
    material.needsUpdate = true;
    return () => {
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = cacheKey;
      material.needsUpdate = true;
    };
  });
  return {
    setEnabled(value: boolean) { enabled.value = value ? 1 : 0; },
    dispose() { for (const undo of restore) undo(); },
  };
}
