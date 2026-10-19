import * as THREE from 'three';
import { injectAfter } from '../tile/tile-material.ts';

let texture: THREE.Texture | null = null;
let loading: Promise<void> | null = null;

function sharedTexture(): THREE.Texture {
  if (!texture) {
    texture = new THREE.Texture();
    texture.name = 'white-concrete-basecolor';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
  }
  return texture;
}

/** 浏览器在首帧前加载，构件同步创建不依赖 DOM。 */
export function loadWhiteConcreteTexture(): Promise<void> {
  if (!loading) {
    const map = sharedTexture();
    const url = new URL('../../assets/concepts/white-concrete-v1/white-concrete-basecolor-v1.png', import.meta.url);
    loading = new THREE.ImageLoader().loadAsync(url.href).then(image => {
      map.image = image;
      map.needsUpdate = true;
    });
  }
  return loading;
}

/** 所有构件共享贴图，由页面退出统一释放，切换场景时保留。 */
export function disposeWhiteConcreteTexture(): void {
  texture?.dispose();
  texture = null;
  loading = null;
}

const WORLD_POSITION = `
#ifdef USE_MAP
  varying vec3 vConcreteWorldPosition;
#endif
`;
const MAP_FRAGMENT = `
#ifdef USE_MAP
  vec3 concreteWeights = abs(normalize(cross(dFdx(vConcreteWorldPosition), dFdy(vConcreteWorldPosition))));
  concreteWeights *= concreteWeights;
  concreteWeights *= concreteWeights;
  concreteWeights /= dot(concreteWeights, vec3(1.0));
  vec4 concreteColor = texture2D(map, vConcreteWorldPosition.zy) * concreteWeights.x
    + texture2D(map, vConcreteWorldPosition.xz) * concreteWeights.y
    + texture2D(map, vConcreteWorldPosition.xy) * concreteWeights.z;
  diffuseColor *= concreteColor;
#endif
`;

/** 一格覆盖一幅纹理，半砖、斜坡与连窗按世界坐标连续采样。 */
export function createWhiteConcreteMaterial(name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: sharedTexture(), roughness: .9, metalness: 0 });
  material.name = name;
  material.onBeforeCompile = shader => {
    shader.vertexShader = injectAfter(shader.vertexShader, 'common', WORLD_POSITION, name);
    shader.vertexShader = injectAfter(shader.vertexShader, 'project_vertex', `
#ifdef USE_MAP
  vConcreteWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`, name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', WORLD_POSITION, name);
    if (!shader.fragmentShader.includes('#include <map_fragment>')) throw new Error(`${name}: 缺少 map_fragment 着色器片段`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'white-concrete-world-v1';
  return material;
}
