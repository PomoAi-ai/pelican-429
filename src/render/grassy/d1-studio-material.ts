import * as THREE from 'three';
import { injectAfter } from '../tile/tile-material.ts';
import { D1_EYELID_MATERIAL, D1_EYE_SOCKET_MATERIAL, isD1SphericalEyeSurface } from './d1-spherical-eyes.ts';

export const D1_STUDIO_VERSIONS = [
  { id: 'v1', label: 'V1 · 柔光原版', description: '暖色皮肤与自然材质，第一版保留。' },
  { id: 'v2', label: 'V2 · 原画初调', description: '当前阶段保留，浅肤色、杏金发与细描边。' },
  { id: 'v3', label: 'V3 · 柔润原画', description: '均匀的浅肤色、清透宝蓝与柔和高光。' },
  { id: 'v4', label: 'V4 · 立体绘本', description: '保留原画配色，加强冷暖层次与发束体积。' },
  { id: 'v5', label: 'V5 · 清晰赛璐璐', description: '清晰分层的明暗与稍强描边，偏动画原画。' },
  { id: 'v6', label: 'V6 · 柔彩哑光', description: '低饱和蓝紫衣料、奶油金发与柔和无描边。' },
] as const;
export type D1StudioVersion = typeof D1_STUDIO_VERSIONS[number]['id'];
const VERSION_CODE = { v1: 0, v2: 1, v3: 2, v4: 3, v5: 4, v6: 5 } as const;

type Surface = 'skin' | 'face' | 'hair' | 'cloth';
const SURFACES: Readonly<Record<string, Surface>> = {
  Body: 'skin', 'Neck source-color transition': 'skin', model: 'face',
  [D1_EYELID_MATERIAL]: 'skin',
  [D1_EYE_SOCKET_MATERIAL]: 'skin',
  'model.001': 'hair', 'Golden hair roots': 'hair', 'D1 V3 dress': 'cloth',
  'D1 refined detail': 'cloth', 'D1 refined skin': 'cloth', 'D1 refined blue': 'cloth',
};

function replaceShader(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`D1 摄影棚着色片段已变化：${from}`);
  return source.replace(from, to);
}

const SOFT_SKIN = `
void RE_Direct_Studio( const in IncidentLight light, const in vec3 position, const in vec3 normal,
  const in vec3 view, const in vec3 clearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( light, position, normal, view, clearcoatNormal, material, reflectedLight );
  float cosine = dot( normal, light.direction );
  float wrap = max( ( cosine + 0.3 ) / 1.3, 0.0 ) - max( cosine, 0.0 );
  reflectedLight.directDiffuse += light.color * BRDF_Lambert( material.diffuseColor ) * vec3( 1.0, 0.65, 0.5 ) * wrap * 0.55;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Studio
`;

function referenceColor(surface: Surface): string {
  if (surface === 'skin' || surface === 'face') return `
    if ( studioReference < 1.5 ) {
      float skinArea = smoothstep( 0.16, 0.36, dot( studioSourceColor, vec3( 0.2126, 0.7152, 0.0722 ) ) );
      skinArea *= 1.0 - 0.9 * smoothstep( 0.28, 0.46, studioSourceColor.r - studioSourceColor.g );
      vec3 porcelain = mix( diffuseColor.rgb, vec3( 1.0, 0.93, 0.92 ), 0.8 );
      diffuseColor.rgb = mix( diffuseColor.rgb, porcelain, skinArea );
    } else {
      float skinArea = smoothstep( 0.035, 0.16, dot( studioSourceColor, vec3( 0.2126, 0.7152, 0.0722 ) ) );
      vec3 porcelain = studioReference > 2.5 ? vec3( 1.0, 0.88, 0.85 ) : vec3( 1.0, 0.93, 0.92 );
      float softness = studioReference > 2.5 ? 0.62 : 0.74;
      if ( studioReference > 3.5 ) { porcelain = vec3( 1.0, 0.93, 0.90 ); softness = 0.76; }
      diffuseColor.rgb = mix( diffuseColor.rgb, porcelain, softness * skinArea );
      diffuseColor.gb -= max( vec2( 0.0 ), vec2( studioSourceColor.r ) - studioSourceColor.gb - vec2( 0.32, 0.37 ) ) * 0.35 * skinArea;
    }
  `;
  if (surface === 'hair') return `
    diffuseColor.rgb *= vec3( 1.06, 1.22, 1.42 );
    if ( studioReference > 2.5 ) diffuseColor.rgb *= vec3( 0.98, 1.05, 1.11 );
    if ( studioReference > 4.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.3, 0.6, 0.1 ) ) ), 0.22 ) * vec3( 1.04, 1.1, 1.2 );
  `;
  return `
    vec3 cloth = diffuseColor.rgb;
    float blue = smoothstep( 0.035, 0.16, cloth.b - cloth.r );
    float gold = smoothstep( 0.18, 0.42, cloth.r - cloth.b ) * smoothstep( 0.12, 0.3, cloth.g );
    float white = smoothstep( 0.23, 0.62, min( cloth.r, min( cloth.g, cloth.b ) ) );
    float blueValue = smoothstep( 0.06, 0.48, max( cloth.b, cloth.g ) );
    vec3 sapphire = mix( vec3( 0.002, 0.05, 0.35 ), vec3( 0.007, 0.18, 0.79 ), blueValue );
    diffuseColor.rgb = mix( cloth, mix( cloth, vec3( 0.96, 0.94, 1.0 ), 0.76 ), white );
    diffuseColor.rgb = mix( diffuseColor.rgb, sapphire, blue );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.9, 0.45, 0.07 ), vec3( 1.0, 0.76, 0.22 ), smoothstep( 0.25, 0.8, cloth.r ) ), gold );
    if ( studioReference > 2.5 ) diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.82, 0.88, 0.95 ), blue );
    if ( studioReference > 4.5 ) {
      diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.08, 0.14, 0.38 ), vec3( 0.25, 0.38, 0.68 ), blueValue ), blue );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.73, 0.38 ), gold * 0.5 );
    }
  `;
}

function studioMaterial(source: THREE.MeshToonMaterial, geometry: THREE.BufferGeometry, surface: Surface, reference: { value: number }): THREE.Material {
  const skin = surface === 'skin' || surface === 'face';
  const hair = surface === 'hair';
  const material = new THREE.MeshPhysicalMaterial({
    name: `${source.name} studio`, color: source.color, map: source.map,
    vertexColors: source.vertexColors, side: source.side, alphaTest: source.alphaTest,
    normalMap: source.normalMap, normalScale: source.normalScale,
    roughness: skin ? 0.72 : hair ? 0.48 : 0.88,
    metalness: 0, specularIntensity: skin ? 0.28 : hair ? 0.5 : 0.32,
    sheen: surface === 'cloth' ? 0.18 : 0,
    sheenColor: new THREE.Color('#b2c2e0'), sheenRoughness: 0.9,
  });
  const center = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
  material.onBeforeCompile = shader => {
    shader.uniforms.studioReference = reference;
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'uniform float studioReference;', material.name);
    if (skin) {
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_physical_pars_fragment', SOFT_SKIN, material.name);
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', `
        float warmSkin = smoothstep( 0.035, 0.16, diffuseColor.r - diffuseColor.b );
        diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, vec3( 1.0, 0.88, 0.84 ), 0.2 ) * vec3( 1.0, 1.08, 1.15 ), warmSkin );
      `, material.name);
    }
    if (surface === 'face') {
      shader.uniforms.studioHeadCenter = { value: center };
      shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'uniform vec3 studioHeadCenter;', material.name);
      shader.vertexShader = injectAfter(shader.vertexShader, 'beginnormal_vertex', `
        vec3 faceSphere = normalize( position - studioHeadCenter );
        objectNormal = normalize( mix( objectNormal, faceSphere, 0.65 * smoothstep( -0.1, 0.5, faceSphere.z ) ) );
      `, material.name);
    }
    if (hair && !geometry.hasAttribute('d1StrandId')) shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= vec3( 1.45, 1.8, 2.25 );', material.name);
    if (surface === 'cloth') {
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', `
        float studioGold = smoothstep( 0.18, 0.42, diffuseColor.r - diffuseColor.b ) * smoothstep( 0.12, 0.3, diffuseColor.g );
      `, material.name);
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor = mix( roughnessFactor, 0.42, studioGold );', material.name);
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'metalnessmap_fragment', 'metalnessFactor = studioGold * 0.32;', material.name);
    }
    // 校色在贴图与顶点色之后执行；原版分支的着色保持原样。
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', 'vec3 studioSourceColor = diffuseColor.rgb;', material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'metalnessmap_fragment', `
      if ( studioReference > 0.5 ) { ${referenceColor(surface)} }
    `, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'roughnessmap_fragment', `
      if ( studioReference > 1.5 ) roughnessFactor = max( roughnessFactor, ${hair ? '0.6' : skin ? '0.82' : '0.7'} );
    `, material.name);
    if (!hair) shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      if ( studioReference > 0.5 ) {
        float albedoValue = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
        float lightValue = dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / albedoValue;
        float shade = mix( ${skin ? '0.84, 1.16' : '0.48, 1.15'}, smoothstep( 0.05, 1.55, lightValue ) );
        vec3 shadowTint = ${skin ? 'vec3( 1.0, 0.96, 0.96 )' : 'vec3( 0.88, 0.87, 1.0 )'};
        if ( studioReference > 1.5 ) {
          shade = mix( ${skin ? '0.84, 1.08' : '0.52, 1.1'}, smoothstep( 0.05, 1.55, lightValue ) );
          reflectedLight.directSpecular *= ${skin ? '0.35' : '0.65'};
        }
        if ( studioReference > 2.5 ) {
          shade = mix( ${skin ? '0.72, 1.1' : '0.32, 1.18'}, smoothstep( 0.05, 1.75, lightValue ) );
          shadowTint = ${skin ? 'vec3( 0.98, 0.93, 1.0 )' : 'vec3( 0.8, 0.84, 1.0 )'};
        }
        if ( studioReference > 3.5 ) {
          float band = smoothstep( 0.48, 0.54, lightValue ) * 0.55 + smoothstep( 1.03, 1.09, lightValue ) * 0.45;
          shade = mix( ${skin ? '0.78, 1.09' : '0.36, 1.16'}, band );
          reflectedLight.directSpecular *= 0.3;
        }
        if ( studioReference > 4.5 ) {
          shade = mix( ${skin ? '0.86, 1.07' : '0.72, 1.1'}, smoothstep( 0.05, 1.8, lightValue ) );
          shadowTint = vec3( 0.96, 0.96, 1.0 );
        }
        reflectedLight.directDiffuse = material.diffuseColor * shade * mix( shadowTint, vec3( 1.0 ), smoothstep( 0.3, 1.2, lightValue ) );
        reflectedLight.indirectDiffuse = vec3( 0.0 );
      }
    `, material.name);
    if (hair) shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      if ( studioReference > 2.5 ) reflectedLight.indirectDiffuse += material.diffuseColor * vec3( 0.12, 0.105, 0.078 );
      if ( studioReference > 3.5 && studioReference < 4.5 ) {
        float albedoValue = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
        float lightValue = dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / albedoValue;
        float band = floor( lightValue * 2.0 + 0.5 ) * 0.5;
        reflectedLight.directDiffuse *= mix( 1.0, band / max( lightValue, 0.001 ), 0.7 );
      }
      if ( studioReference > 4.5 ) reflectedLight.directSpecular *= 0.2;
    `, material.name);
    // 原画色板已按显示亮度定义，避免电影色调映射再次压灰白肤色和杏色高光。
    if (!hair) shader.fragmentShader = replaceShader(shader.fragmentShader, '#include <tonemapping_fragment>', `
      vec3 studioDisplayColor = gl_FragColor.rgb;
      #include <tonemapping_fragment>
      if ( studioReference > 0.5 ) gl_FragColor.rgb = studioDisplayColor;
    `);
  };
  material.customProgramCacheKey = () => `d1-studio-${surface}-${geometry.hasAttribute('d1StrandId')}`;
  return material;
}

/** 从同一眼图集读取每列的轮廓，移动眼睑时保持睫毛厚度，虹膜位置保持不动。 */
function lidProfile(map: THREE.Texture): THREE.DataTexture {
  const canvas = document.createElement('canvas');
  canvas.width = map.image.width;
  canvas.height = map.image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('D1 眨眼需要 Canvas 2D 读取眼图集');
  context.drawImage(map.image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width / 2;
  const height = canvas.height / 2;
  const profile = new Float32Array(width * 8);
  for (let x = 0; x < width; x++) {
    let top = height, bottom = 0, inkTop = height, inkBottom = 0, closedTop = height, closedBottom = 0;
    for (let y = 0; y < height; y++) {
      const open = (y * canvas.width + x) * 4;
      if (data[open + 3]! > 127) { inkTop = Math.min(inkTop, y); inkBottom = y; }
      if (data[open + 3]! > 127 && data[open + 1]! > 130) {
        top = Math.min(top, y); bottom = y;
      }
      const closed = ((y + height) * canvas.width + x + width) * 4;
      if (data[closed + 3]! > 127) { closedTop = Math.min(closedTop, y); closedBottom = y; }
    }
    const kind = closedTop <= closedBottom && inkTop < inkBottom ? (top < bottom ? 1 : 2) : 0;
    profile.set([top / height, bottom / height, closedBottom / height, kind], x * 4);
    profile.set([inkTop / height, inkBottom / height, closedTop / height, closedBottom / height], (width + x) * 4);
  }
  const texture = new THREE.DataTexture(profile, width, 2, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const CONTINUOUS_LID = `
vec2 studioUv = vMapUv * 2.0;
vec4 studioProfile = texture2D( studioLidProfile, vec2( studioUv.x, 0.25 ) );
float studioClose = studioClosure;
float studioTop = mix( studioProfile.x, studioProfile.z, studioClose );
float studioBottom = mix( studioProfile.y, studioProfile.z, studioClose );
float studioY = studioUv.y;
if ( studioProfile.w > 1.5 ) {
  vec4 lash = texture2D( studioLidProfile, vec2( studioUv.x, 0.75 ) );
  float lashTop = mix( lash.x, lash.z, studioClose );
  float lashBottom = mix( lash.y, lash.w, studioClose );
  studioY = lash.x + ( studioY - lashTop ) * ( lash.y - lash.x ) / max( lashBottom - lashTop, 0.0001 );
} else if ( studioProfile.w > 0.5 ) {
  if ( studioY < studioTop ) studioY += studioProfile.x - studioTop;
  else if ( studioY <= studioBottom ) studioY = mix( studioProfile.x, studioProfile.y, ( studioY - studioTop ) / max( studioBottom - studioTop, 0.0001 ) );
  else studioY += studioProfile.y - studioBottom;
}
vec4 d1Lid = texture2D( map, clamp( vec2( studioUv.x, studioY ), vec2( 0.002 ), vec2( 0.998 ) ) * 0.5 );
if ( studioProfile.w < 0.5 ) d1Lid.a *= 1.0 - studioClose;
// 全闭合直接使用已绘制的闭眼线，避免压缩后的眼白残留亮点。
if ( studioClose > 0.985 ) d1Lid = texture2D( map, vMapUv + vec2( 0.5 ) );
`;

/** 只装饰这个 rig 的材质，不触碰缓存贴图、几何、原始模型或其他页面。 */
export function applyD1StudioLook(root: THREE.Object3D) {
  const materials = new Map<THREE.Material, THREE.Material>();
  const profiles: THREE.Texture[] = [];
  const closure = { value: 0 };
  const reference = { value: 0 };
  const outlines: THREE.Mesh[] = [];
  const outlineMaterials = new Set<THREE.Material>();
  const restore: Array<() => void> = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.parent instanceof THREE.SkinnedMesh && node.geometry === node.parent.geometry) {
      node.visible = false;
      outlines.push(node);
      const hullMaterials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of hullMaterials) {
        if (!material.visible || outlineMaterials.has(material)) continue;
        outlineMaterials.add(material);
        const compile = material.onBeforeCompile;
        const cacheKey = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          shader.uniforms.studioReference = reference;
          shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'uniform float studioReference;', material.name);
          shader.vertexShader = replaceShader(shader.vertexShader, '* d1OutlineWidth;', '* ( studioReference > 3.5 && studioReference < 4.5 ? 0.007 : 0.0045 );');
        };
        material.customProgramCacheKey = () => `${cacheKey.call(material)}-reference-thin`;
        material.needsUpdate = true;
        restore.push(() => { material.onBeforeCompile = compile; material.customProgramCacheKey = cacheKey; material.needsUpdate = true; });
      }
      restore.push(() => { node.visible = true; });
      return;
    }
    const original = node.material;
    const convert = (source: THREE.Material) => {
      if (isD1SphericalEyeSurface(source)) return source;
      if (source.name.startsWith('D1.Covered.') || source.name.startsWith('Flight / ')) return source;
      if (source.name === 'D1 eye') {
        const eye = source as THREE.MeshToonMaterial;
        const compile = eye.onBeforeCompile;
        const cacheKey = eye.customProgramCacheKey;
        const profile = lidProfile(eye.map!);
        profiles.push(profile);
        const oldDepthWrite = eye.depthWrite;
        const oldCastShadow = node.castShadow;
        eye.depthWrite = false;
        node.castShadow = false;
        eye.onBeforeCompile = (shader, renderer) => {
          compile.call(eye, shader, renderer);
          shader.uniforms.studioClosure = closure;
          shader.uniforms.studioLidProfile = { value: profile };
          shader.uniforms.d1Lift = { value: 0 };
          shader.uniforms.d1Grade = { value: new THREE.Vector3(1, 1, 1) };
          shader.uniforms.d1Rim = { value: 0 };
          shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'uniform float studioClosure;\nuniform sampler2D studioLidProfile;', eye.name);
          shader.fragmentShader = replaceShader(shader.fragmentShader,
            'vec4 d1Lid = mix( texture2D( map, vMapUv + d1EyeCell.xy ), texture2D( map, vMapUv + d1EyeCell.zw ), d1EyeMix );', CONTINUOUS_LID);
          shader.fragmentShader = replaceShader(shader.fragmentShader,
            'float d1Iris = ( 1.0 - smoothstep', 'float d1Iris = ( 1.0 - step( 0.985, studioClosure ) ) * ( 1.0 - smoothstep');
        };
        eye.customProgramCacheKey = () => 'd1-studio-continuous-eye';
        eye.needsUpdate = true;
        restore.push(() => {
          eye.onBeforeCompile = compile; eye.customProgramCacheKey = cacheKey;
          eye.depthWrite = oldDepthWrite; node.castShadow = oldCastShadow; eye.needsUpdate = true;
        });
        return eye;
      }
      let material = materials.get(source);
      if (!material) {
        const surface = SURFACES[source.name];
        if (!surface) throw new Error(`D1 摄影棚未登记材质：${source.name}`);
        material = studioMaterial(source as THREE.MeshToonMaterial, node.geometry, surface, reference);
        materials.set(source, material);
      }
      return material;
    };
    node.material = Array.isArray(original) ? original.map(convert) : convert(original);
    restore.push(() => { node.material = original; });
  });
  let manual: number | null = null;
  let age = -2.4;
  const smooth = (value: number) => THREE.MathUtils.smoothstep(value, 0, 1);
  return {
    get closure() { return closure.value; },
    setVersion(version: D1StudioVersion) {
      reference.value = VERSION_CODE[version];
      for (const outline of outlines) outline.visible = version !== 'v1' && version !== 'v6';
    },
    setClosure(value: number | null) { manual = value; closure.value = value ?? 0; },
    update(dt: number) {
      if (manual !== null) return;
      age += dt;
      if (age > 0.29) age = -(2.8 + Math.random() * 2);
      closure.value = age < 0 ? 0 : age < 0.085 ? smooth(age / 0.085)
        : age < 0.125 ? 1 : 1 - smooth((age - 0.125) / 0.165);
    },
    dispose() {
      for (const undo of restore) undo();
      for (const material of materials.values()) material.dispose();
      for (const profile of profiles) profile.dispose();
    },
  };
}
