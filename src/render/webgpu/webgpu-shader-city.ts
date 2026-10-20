/** 城区环境 ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import { Discard, Fn, If, max, min, mix, modelWorldMatrix, positionGeometry, pow, select, sin, smoothstep, uv, varying, vec2, vec3, vec4 } from 'three/tsl';
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

export const CITY_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'residence-geofront-vista': geofront,
  'ai-city-painted': painted,
  'ai-city-painted-water': water,
};
