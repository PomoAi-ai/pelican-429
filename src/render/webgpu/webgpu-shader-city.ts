/** 城区环境 ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import {
  Discard, Fn, If, cameraPosition, clamp, distance, dot, floor, fract, max, min, mix, modelWorldMatrix, normalize, positionGeometry, pow, select, sin,
  smoothstep, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { WATER } from '../city/ai-city-backdrop.ts';
import { GEOFRONT } from '../city/harbor-residence-environment.ts';
import type { N, ShaderConversion } from './webgpu-shader-nodes.ts';

const n = (node: unknown): N => node as N;

/** 住宅地下长廊窗外的地下城远景（harbor-residence-environment createGeofrontVista）。 */
const geofront: ShaderConversion = ({ uniform, texture }) => {
  const uSize = uniform('uSize'), uCenter = uniform('uCenter'), uCamera = uniform('uCamera');
  const world = n(varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xy));
  const at = world.sub(uCenter).sub(uCamera.sub(uCenter).mul(GEOFRONT.follow)).div(uSize).add(0.5);
  return { color: n(vec4(texture('uMap', at).rgb, 1)) };
};

/** 原版住宅黄昏天际线绘制层与倒影（ai-city-backdrop FRAGMENT）：夜里压暗、灯带增亮，倒影带水波错位并向下淡出。 */
const painted: ShaderConversion = ({ uniform, texture }) => {
  const uNight = uniform('uNight'), uTime = uniform('uTime'), uWeatherDim = uniform('uWeatherDim'), uHaze = uniform('uHaze');
  const uBaseHaze = uniform('uBaseHaze'), uLights = uniform('uLights'), uReflect = uniform('uReflect');
  const uFogColor = uniform('uFogColor'), uTint = uniform('uTint');
  const vUv = n(uv());
  const color = Fn(() => {
    const reflected = uReflect.greaterThan(0);
    const wave = sin(vUv.y.mul(80).add(uTime.mul(1.4))).mul(0.0035).mul(vUv.y.add(0.3));
    const art = texture('uMap', n(vec2(vUv.x.add(select(reflected, wave, 0)), vUv.y))).toVar();
    If(art.a.lessThan(0.02), () => {
      Discard();
    });
    const c = mix(art.rgb, uTint, uBaseHaze);
    const cyan = smoothstep(0.06, 0.22, min(art.g, art.b).sub(art.r)).mul(smoothstep(0.2, 0.55, max(art.g, art.b)));
    const warm = smoothstep(0.06, 0.3, art.r.sub(art.b)).mul(smoothstep(0.35, 0.7, art.r));
    const lit = c.mul(mix(vec3(1), vec3(0.16, 0.19, 0.34), uNight)).mul(uWeatherDim)
      .add(art.rgb.mul(max(cyan, warm)).mul(uLights).mul(uNight).mul(1.2));
    const fog = uFogColor.mul(mix(vec3(1), vec3(0.09, 0.15, 0.25), uNight));
    const hazed = mix(lit, fog, uHaze.mul(0.34));
    const rgb = select(reflected, mix(hazed, uTint.mul(vec3(0.5, 0.56, 0.95)), 0.18), hazed);
    const alpha = select(reflected, art.a.mul(uReflect).mul(pow(vUv.y.oneMinus(), 1.3)), art.a);
    return vec4(rgb, alpha);
  })();
  return { color: n(color) };
};

/** 原版住宅画面水面（ai-city-backdrop waterMaterial）：按世界 x 每 96 格镜像重复。 */
const water: ShaderConversion = ({ uniform, texture }) => {
  const uNight = uniform('uNight'), uWeatherDim = uniform('uWeatherDim');
  const worldX = modelWorldMatrix.mul(vec4(positionGeometry, 1)).x;
  const at = n(varying(vec2(worldX.div(96), positionGeometry.z.negate().add(WATER.near).div(WATER.near - WATER.far))));
  return { color: n(vec4(texture('uMap', at).rgb.mul(mix(vec3(1), vec3(0.14, 0.17, 0.3), uNight)).mul(uWeatherDim), 1)) };
};

/** 住宅 3、4 平面反射水面（residence-three-water）：反射图由环境 update 离屏渲染。 */
const lakeReflection: ShaderConversion = ({ uniform, texture }) => {
  const textureMatrix = uniform('textureMatrix'), color = uniform('color'), time = uniform('time');
  const lightLevel = uniform('lightLevel'), canal = uniform('canal');
  const reflectionUv = n(varying(textureMatrix.mul(vec4(positionGeometry, 1))));
  const world = n(varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz));
  const hash = (cell: N): N => n(fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453)));
  const noise = (q: N): N => {
    const cell = n(floor(q)), f0 = fract(q);
    const f = f0.mul(f0).mul(f0.mul(-2).add(3));
    return n(mix(mix(hash(cell), hash(n(cell.add(vec2(1, 0)))), f.x), mix(hash(n(cell.add(vec2(0, 1)))), hash(n(cell.add(vec2(1, 1)))), f.x), f.y));
  };
  // 同 GLSL 常量。
  const p = n(world.xz);
  const broken = noise(n(p.mul(vec2(0.6, 2.7)).add(vec2(time.mul(0.15), time.mul(-0.3))))).sub(0.5);
  const swell = sin(p.y.mul(0.72).add(p.x.mul(0.13)).sub(time.mul(0.7)));
  const ripple = sin(p.y.mul(3.7).add(sin(p.x.mul(0.61).add(time.mul(0.4)))).sub(time.mul(1.3)).add(broken.mul(3)));
  const fine = sin(p.y.mul(11.3).sub(p.x.mul(1.1)).add(time.mul(1.8)));
  const waterDistance = distance(cameraPosition, world);
  const rippleScale = mix(1, mix(0.65, 0.12, smoothstep(70, 1150, waterDistance)), canal);
  const reflectionRipple = mix(rippleScale, max(0.35, rippleScale), canal);
  // WebGPU 下镜像离屏图实测上下颠倒（同 free-world-background）：先按 GLSL 加涟漪偏移，再把 v 翻一次。
  const projected = reflectionUv.xy.div(reflectionUv.w);
  const rippled = projected.add(vec2(swell.mul(0.0006).add(broken.mul(0.002)), ripple.mul(0.7).add(fine.mul(0.3)).add(broken).mul(0.0036)).mul(reflectionRipple));
  const at = n(vec2(rippled.x, rippled.y.oneMinus()));
  const blur = n(vec2(0.0008, 0.0012).mul(canal.mul(3).mul(smoothstep(200, 1200, waterDistance)).add(1)));
  const sampled = texture('tDiffuse', at).rgb.mul(0.5)
    .add(texture('tDiffuse', n(at.add(blur))).rgb.mul(0.25))
    .add(texture('tDiffuse', n(at.sub(blur))).rgb.mul(0.25));
  const reflected = mix(vec3(dot(sampled, vec3(0.2126, 0.7152, 0.0722))), sampled, 0.48).mul(vec3(0.9, 0.97, 0.96));
  const view = normalize(cameraPosition.sub(world));
  const fresnel = mix(0.24, 0.17, canal).add(pow(clamp(view.y, 0, 1).oneMinus(), 3).mul(0.68));
  const crest = pow(max(0, ripple.mul(0.65).add(fine.mul(0.35))), 10);
  const lake = mix(color.mul(lightLevel), reflected, fresnel)
    .add(vec3(0.035, 0.043, 0.04).mul(crest).mul(lightLevel).mul(noise(n(p.mul(0.8))).add(0.4)).mul(rippleScale));
  return { color: n(vec4(lake, 1)) };
};

export const CITY_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'residence-geofront-vista': geofront,
  'ai-city-painted': painted,
  'ai-city-painted-water': water,
  'residence-lake-reflection': lakeReflection,
};
