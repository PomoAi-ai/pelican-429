import * as THREE from 'three';
import { AI_CITY_LOOK } from '../config/ai-city-look.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

type BackdropLayer = 'city' | 'canyon';

const ART = {
  city: { file: 'skyline.png', width: 84, height: 56, x: 36, bottom: -18, z: -70 },
  canyon: { file: 'canyon.png', width: 144, height: 96, x: 64, bottom: -64, z: -42 },
} as const;

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D uMap;
uniform float uNight;
uniform float uTime;
uniform float uWeatherDim;
uniform float uHaze;
uniform float uBaseHaze;
uniform float uLights;
uniform vec3 uFogColor;
varying vec2 vUv;
void main() {
  vec4 art = texture2D(uMap, vUv);
  if (art.a < 0.01) discard;
  vec3 c = art.rgb;
  float cyan = smoothstep(0.06, 0.22, min(c.g, c.b) - c.r)
    * smoothstep(0.2, 0.55, max(c.g, c.b));
  float warm = smoothstep(0.08, 0.3, c.r - c.g)
    * smoothstep(0.15, 0.4, c.r - c.b) * smoothstep(0.18, 0.5, c.g);
  vec3 color = c * mix(vec3(1.0), vec3(0.105, 0.155, 0.255), uNight) * uWeatherDim;
  float pulse = 0.94 + 0.06 * sin(uTime * 1.15 + vUv.y * 28.0);
  color += c * max(cyan, warm) * uLights * (0.08 + uNight * 1.35) * pulse;
  vec3 fog = uFogColor * mix(vec3(1.0), vec3(0.09, 0.15, 0.25), uNight);
  color = mix(color, fog, uBaseHaze + uHaze * 0.34);
  gl_FragColor = vec4(color, art.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

async function loadTexture(file: string, signal: AbortSignal): Promise<THREE.Texture> {
  const url = `${import.meta.env.BASE_URL}scenes/ai-city-background-v1/${file}`;
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

/** 两张绘制资源在整个环境内共享；区段只拥有平面实例，不各自解码和释放贴图。 */
export async function loadAiCityBackdrop(signal: AbortSignal, onLoaded: () => void) {
  signal.throwIfAborted();
  const names = ['city', 'canyon'] as const;
  const results = await Promise.allSettled(names.map(async name => {
    const texture = await loadTexture(ART[name].file, signal);
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
  const geometry = new THREE.PlaneGeometry(1, 1);
  const common = {
    uNight: { value: 0 }, uTime: { value: 0 }, uWeatherDim: { value: 1 },
    uHaze: { value: 0 }, uFogColor: { value: new THREE.Color(AI_CITY_LOOK.fog) },
  };
  const materials = names.map((name, index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...common, uMap: { value: loaded[index]! },
        uBaseHaze: { value: name === 'city' ? .07 : .025 }, uLights: { value: name === 'city' ? 1 : 0 } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    material.name = `ai-city-painted-${name}`;
    return material;
  });
  return {
    create(layer: BackdropLayer): THREE.Mesh {
      const art = ART[layer];
      const mesh = new THREE.Mesh(geometry, materials[layer === 'city' ? 0 : 1]!);
      mesh.name = `ai-city-painted-${layer}`;
      mesh.position.set(art.x, art.bottom + art.height / 2, art.z);
      mesh.scale.set(art.width, art.height, 1);
      return mesh;
    },
    setNightFactor(night: number): void { common.uNight.value = night; },
    setWeather(weather: PrecipSkyLook): void {
      common.uWeatherDim.value = .58 + weather.hemi * .42;
      common.uHaze.value = weather.fog;
      common.uFogColor.value.copy(weather.fogColor);
    },
    update(time: number): void { common.uTime.value = time; },
    dispose(): void {
      geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of loaded) disposeTexture(texture);
    },
  };
}

export type AiCityBackdrop = Awaited<ReturnType<typeof loadAiCityBackdrop>>;
