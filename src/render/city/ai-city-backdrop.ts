import * as THREE from 'three';
import { AI_CITY_LOOK } from '../../config/ai-city-look.ts';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH as SEGMENT_WIDTH } from '../../config/residence.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';

/**
 * 黄昏滨水天际线按参考原画拆成四张绘制层：近城楼群、主城（光环尖塔只在主院区对面出现一次）、远城楼带和晚霞天空，
 * 外加一张水面。楼群底边都落在水面 y=0，各自在水下有一份淡出的倒影；坐标为分段内的原始层距，宿主统一推到配置层距。
 */
type Plate = 'main-a' | 'main-b' | 'main-c' | 'far';
type Layer = 'canyon' | 'city' | 'distance';
const PLATE_FILES = ['main-a', 'main-b', 'main-c', 'far'] as const satisfies readonly Plate[];
// height 为整张贴图（即最高楼）的世界高度；haze 混入黄昏空气色的比例；sequence 由主院区向两侧轮换，第二轮起镜像。
// homeShift 把主城尖塔推到住宅右侧的视野里，否则正好被住宅挡住。
const LAYERS: Record<Layer, { z: number; height: Partial<Record<Plate, number>>; haze: number; reflect: number; home?: Plate; homeShift?: number; sequence: readonly Plate[] }> = {
  canyon: { z: -35, height: { 'main-c': 14, 'main-b': 12 }, haze: .04, reflect: .5, sequence: ['main-c', 'main-b'] },
  city: { z: -70, height: { 'main-a': 29, 'main-b': 19 }, haze: .16, reflect: .42, home: 'main-a', homeShift: 40, sequence: ['main-b'] },
  distance: { z: -140, height: { far: 20 }, haze: .32, reflect: .26, sequence: ['far'] },
};
/** 贴图加天空与水面，供宿主统计加载进度。 */
export const AI_CITY_BACKDROP_FILES = PLATE_FILES.length + 2;
const OVERLAP = .03;
const SKY = { z: -170, bottom: -14, height: 150 };
const WATER = { y: 0, near: -9, far: -235 };
const HAZE = '#c4a3c9';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 夜晚整体压暗，暖色与青色灯带保留并增亮；倒影沿水面向下淡出，带轻微水波错位。
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uNight, uTime, uWeatherDim, uHaze, uBaseHaze, uLights, uReflect;
uniform vec3 uFogColor, uTint;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uReflect > 0.0) uv.x += sin(uv.y * 80.0 + uTime * 1.4) * 0.0035 * (0.3 + uv.y);
  vec4 art = texture2D(uMap, uv);
  if (art.a < 0.02) discard;
  vec3 c = mix(art.rgb, uTint, uBaseHaze);
  float cyan = smoothstep(0.06, 0.22, min(art.g, art.b) - art.r) * smoothstep(0.2, 0.55, max(art.g, art.b));
  float warm = smoothstep(0.06, 0.3, art.r - art.b) * smoothstep(0.35, 0.7, art.r);
  vec3 color = c * mix(vec3(1.0), vec3(0.16, 0.19, 0.34), uNight) * uWeatherDim;
  color += art.rgb * max(cyan, warm) * uLights * uNight * 1.2;
  vec3 fog = uFogColor * mix(vec3(1.0), vec3(0.09, 0.15, 0.25), uNight);
  color = mix(color, fog, uHaze * 0.34);
  float alpha = art.a;
  if (uReflect > 0.0) { color = mix(color, uTint * vec3(0.5, 0.56, 0.95), 0.18); alpha *= uReflect * pow(1.0 - vUv.y, 1.3); }
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

async function loadTexture(file: string, signal: AbortSignal): Promise<THREE.Texture> {
  const url = `${import.meta.env.BASE_URL}scenes/ai-city-skyline-v3/${file}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`城市背景资源加载失败：${url} (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  if (signal.aborted) {
    bitmap.close();
    signal.throwIfAborted();
  }
  const texture = new THREE.Texture(bitmap);
  texture.name = `ai-city-painted-${file}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function disposeTexture(texture: THREE.Texture): void {
  texture.dispose();
  (texture.image as ImageBitmap).close();
}

/** 绘制资源在整个环境内共享；区段只拥有平面实例，不各自解码和释放贴图。 */
export async function loadAiCityBackdrop(signal: AbortSignal, onLoaded: () => void, homeCenter: number) {
  signal.throwIfAborted();
  const files = [...PLATE_FILES.map(name => `${name}.png`), 'sky.jpg', 'water.jpg'];
  const results = await Promise.allSettled(files.map(async file => {
    const texture = await loadTexture(file, signal);
    onLoaded();
    return texture;
  }));
  const loaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find(result => result.status === 'rejected');
  if (failure || signal.aborted) {
    for (const texture of loaded) disposeTexture(texture);
    if (failure) throw failure.reason;
    signal.throwIfAborted();
  }
  const byFile = new Map(files.map((file, index) => [file, loaded[index]!]));
  const aspect = (texture: THREE.Texture): number => (texture.image as ImageBitmap).width / (texture.image as ImageBitmap).height;
  const water = byFile.get('water.jpg')!;
  water.wrapS = THREE.MirroredRepeatWrapping; water.needsUpdate = true;

  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const common = {
    uNight: { value: 0 }, uTime: { value: 0 }, uWeatherDim: { value: 1 },
    uHaze: { value: 0 }, uFogColor: { value: new THREE.Color(AI_CITY_LOOK.fog) }, uTint: { value: new THREE.Color(HAZE) },
  };
  const materials: THREE.Material[] = [];
  const shader = (map: THREE.Texture, haze: number, lights: number, reflect: number, name: string): THREE.ShaderMaterial => {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...common, uMap: { value: map }, uBaseHaze: { value: haze }, uLights: { value: lights }, uReflect: { value: reflect } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    material.name = `ai-city-painted-${name}`; materials.push(material);
    return material;
  };
  const looks = new Map<string, readonly [THREE.ShaderMaterial, THREE.ShaderMaterial]>();
  const look = (layer: Layer, plate: Plate) => {
    const key = `${layer}:${plate}`;
    let pair = looks.get(key);
    if (!pair) {
      const { haze, reflect } = LAYERS[layer], map = byFile.get(`${plate}.png`)!;
      pair = [shader(map, haze, 1, 0, key), shader(map, haze, 1, reflect, `${key}-reflection`)];
      looks.set(key, pair);
    }
    return pair;
  };
  // 每层从主院区对面起向左右连续排布，整条世界只排一次；区段按贴图左缘认领自己的那几张。
  const tiles = Object.fromEntries((Object.keys(LAYERS) as Layer[]).map(layer => {
    const plan = LAYERS[layer];
    const size = (plate: Plate): [number, number] => {
      const height = plan.height[plate]!;
      return [height * aspect(byFile.get(`${plate}.png`)!), height];
    };
    const list: Array<{ plate: Plate; x: number; width: number; height: number; flip: boolean }> = [];
    const first = plan.home ?? plan.sequence[0]!;
    const [homeWidth, homeHeight] = size(first);
    list.push({ plate: first, x: homeCenter + (plan.homeShift ?? 0) - homeWidth / 2, width: homeWidth, height: homeHeight, flip: false });
    const minX = RESIDENCE_WORLD.minX - SEGMENT_WIDTH * 2, maxX = RESIDENCE_WORLD.maxX + SEGMENT_WIDTH * 2;
    for (const direction of [1, -1]) {
      let edge = direction > 0 ? list[0]!.x + homeWidth * (1 - OVERLAP) : list[0]!.x + homeWidth * OVERLAP;
      for (let step = plan.home ? 0 : 1; direction > 0 ? edge < maxX : edge > minX; step++) {
        const plate = plan.sequence[step % plan.sequence.length]!;
        const [width, height] = size(plate);
        const flip = Math.floor(step / plan.sequence.length) % 2 === (plan.home ? 0 : 1);
        const x = direction > 0 ? edge : edge - width;
        list.push({ plate, x, width, height, flip });
        edge = direction > 0 ? x + width * (1 - OVERLAP) : x + width * OVERLAP;
      }
    }
    return [layer, list];
  })) as Record<Layer, Array<{ plate: Plate; x: number; width: number; height: number; flip: boolean }>>;

  const sky = shader(byFile.get('sky.jpg')!, 0, 0, 0, 'sky');
  sky.transparent = false;
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { ...common, uMap: { value: water } }, depthWrite: false,
    // 按世界坐标取样，相邻区段的水面无缝衔接，各段共用同一份几何。
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vUv = vec2(world.x / 96.0, (${WATER.near.toFixed(1)} - position.z) / ${(WATER.near - WATER.far).toFixed(1)});
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uNight, uWeatherDim; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(uMap, vUv).rgb * mix(vec3(1.0), vec3(0.14, 0.17, 0.3), uNight) * uWeatherDim;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  waterMaterial.name = 'ai-city-painted-water'; materials.push(waterMaterial);
  // 水面横向按 96 格镜像重复，纵向从近岸铺到天际线之后，远端是贴图上缘的晚霞色。
  const waterGeometry = new THREE.PlaneGeometry(SEGMENT_WIDTH + 2, WATER.near - WATER.far).rotateX(-Math.PI / 2)
    .translate(SEGMENT_WIDTH / 2, WATER.y, (WATER.near + WATER.far) / 2);
  const skyGeometry = new THREE.PlaneGeometry(1, 1).translate(.5, .5, 0);

  return {
    /** 某一层在第 index 段的绘制内容；水面属于近水层，天空随远城层。 */
    create(layer: Layer | 'water', index: number): THREE.Group {
      const group = new THREE.Group(); group.name = `ai-city-painted-${layer}-${index}`;
      const left = index * SEGMENT_WIDTH;
      if (layer === 'water') {
        const mesh = new THREE.Mesh(waterGeometry, waterMaterial);
        mesh.name = 'ai-city-painted-water'; mesh.renderOrder = -2; group.add(mesh);
        return group;
      }
      const plan = LAYERS[layer];
      for (const tile of tiles[layer]) {
        if (tile.x < left || tile.x >= left + SEGMENT_WIDTH) continue;
        const [art, reflection] = look(layer, tile.plate);
        for (const [material, scaleY] of [[art, 1], [reflection, -.75]] as const) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `ai-city-painted-${tile.plate}`;
          mesh.position.set(tile.x - left + tile.width / 2, WATER.y, plan.z - group.children.length * .01);
          mesh.scale.set(tile.flip ? -tile.width : tile.width, tile.height * scaleY, 1);
          group.add(mesh);
        }
      }
      if (layer === 'distance') {
        const mesh = new THREE.Mesh(skyGeometry, sky);
        mesh.name = 'ai-city-painted-sky'; mesh.renderOrder = -3;
        const flip = THREE.MathUtils.euclideanModulo(index, 2) === 1;
        mesh.position.set(flip ? SEGMENT_WIDTH + .5 : -.5, SKY.bottom, SKY.z);
        mesh.scale.set(flip ? -(SEGMENT_WIDTH + 1) : SEGMENT_WIDTH + 1, SKY.height, 1);
        group.add(mesh);
      }
      return group;
    },
    setNightFactor(night: number): void { common.uNight.value = night; },
    setWeather(weather: PrecipSkyLook): void {
      common.uWeatherDim.value = .58 + weather.hemi * .42;
      common.uHaze.value = weather.fog;
      common.uFogColor.value.copy(weather.fogColor);
    },
    update(time: number): void { common.uTime.value = time; },
    dispose(): void {
      geometry.dispose(); waterGeometry.dispose(); skyGeometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of loaded) disposeTexture(texture);
    },
  };
}

export type AiCityBackdrop = Awaited<ReturnType<typeof loadAiCityBackdrop>>;
