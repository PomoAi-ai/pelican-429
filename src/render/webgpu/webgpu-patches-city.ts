/**
 * WebGPU 城市/港口建筑补丁（render 侧 GLSL 同式）：自然建材三向投影、家具布纹、AI 城建材逐块质感、能量门溶解、
 * 港口幕墙玻璃、港口岸景雾、港口原画大气。GLSL 内联字面量在这里照抄同值（注“同 GLSL”），模块私有常量来自登记数据。
 */
import type * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial } from 'three/webgpu';
import {
  abs, cameraViewMatrix, clamp, cos, cross, dFdx, dFdy, diffuseColor, dot, exp2, float, floor, fract, fwidth, length, materialReference, max, min, mix,
  normalGeometry, normalize, positionGeometry, positionView, positionWorld, select, sign, sin, smoothstep, texture, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { nodePatches } from '../stage/node-patches.ts';
import { addDiscard, beforeLighting, deformBeforeInstance, fragmentNormal, isOpaque, materialLabel, normalOf, roughnessOf, shared, toWorld } from './webgpu-node-utils.ts';
import type { N, PatchTable, Translate } from './webgpu-node-utils.ts';

/** GLSL fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 )（能量门的格哈希）。 */
const hash2 = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)) as unknown as N;

/** 在 color_fragment 之后改 diffuseColor.rgb（原 setupDiffuseColor 已乘完顶点色/实例色、做完 alphaTest）。 */
function afterColor(material: NodeMaterial, fn: (rgb: N) => N): void {
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prev.call(this, builder);
    diffuseColor.rgb.assign(fn(diffuseColor.rgb.toVar() as unknown as N));
  };
}

// ---- 自然建材 natural-building（render/building-material：替换 map_fragment）----

const naturalBuilding: Translate<'natural-building'> = (material, { grass, period }, source) => {
  const { map } = source as THREE.MeshStandardMaterial;
  if (map === null) throw new Error(`webgpu-patches-city: 自然建材 '${materialLabel(source)}' 没有 map`);
  // GLSL buildingPoint = modelMatrix * position（不含实例变换）、buildingNormal = 局部法线。
  const point = varying(toWorld(null, positionGeometry as unknown as N));
  const normal = varying(normalGeometry);
  const n = abs(normal);
  const st = select(n.z.greaterThan(0.5), point.xy, select(n.y.greaterThan(n.x), point.xz, point.zy)).div(period);
  const terrain = grass === null ? texture(map, st) : select(normal.y.greaterThan(0.5), texture(grass, st), texture(map, st));
  material.colorNode = vec4(materialReference('color', 'color'), 1).mul(terrain);
};

// ---- 家具布纹 furniture-fabric（render/definition-furniture）----

const furnitureFabric: Translate<'furniture-fabric'> = (material) => {
  const p = varying(positionGeometry);
  // 同 GLSL 常量。
  const weave = sin(p.x.mul(440)).mul(sin(p.y.add(p.z).mul(460)));
  afterColor(material, (rgb) => rgb.mul(weave.mul(0.025).add(1)));
};

// ---- AI 城建材 ai-city-finish（render/ai-city-architecture createAiCityMaterial）----

const finishHash = (q: N): N => {
  const p = fract(q.mul(0.1031));
  const r = p.add(dot(p, p.yzx.add(33.33)));
  return fract(r.x.add(r.y).mul(r.z)) as unknown as N;
};
const finishNoise = (p: N): N => {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const h = (x: number, y: number, z: number): N => finishHash(i.add(vec3(x, y, z)) as unknown as N);
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  ) as unknown as N;
};

const aiCityFinish: Translate<'ai-city-finish'> = (material, { finish, variation: [tone, warmth, roughness] }) => {
  // 同 GLSL 按建材取的常量。
  const cloudTone = finish === 'ashlar' ? 0.14 : finish === 'alloy' ? 0.025 : 0.07;
  const cloudRough = finish === 'alloy' ? 0.05 : 0.13;
  const cloudHeight = finish === 'alloy' ? 0.0004 : 0.0015;
  const wall = finish === 'wall';
  const cell = varying(positionGeometry.xy) as unknown as N;
  const point = positionWorld as unknown as N;
  // 构件原点（含实例矩阵）只能在顶点阶段取得：变形回调里建 varying 与依赖它的片元表达式（纯表达式，片元阶段再展开）。
  let fields: { seed: N; cloud: N; fleck: N; grain: N; grout: N; edgeDistance: N } | null = null;
  const current = () => {
    if (fields === null) throw new Error(`webgpu-patches-city: ai-city-finish 的片元在顶点阶段之前构建（材质 '${materialLabel(material)}'）`);
    return fields;
  };
  deformBeforeInstance(material, (M) => {
    const origin = varying(toWorld(M, vec3(0, 0, 0)).xy);
    const tile = vec3(floor(origin.mul(4).add(0.5)), 0) as unknown as N;
    const seed = vec4(finishHash(tile.add(11)), finishHash(tile.add(37)), finishHash(tile.add(71)), finishHash(tile.add(97))).sub(0.5) as unknown as N;
    const phase = seed.xyz.mul(31);
    const footprint = max(length(dFdx(point)), length(dFdy(point)));
    const grain = sin(point.x.mul(151)).mul(sin(point.y.mul(173).add(point.z.mul(137)))).mul(float(1).sub(smoothstep(0.003, 0.025, footprint))) as unknown as N;
    const cloud = finishNoise(point.mul(2.7).add(phase) as unknown as N).sub(0.5) as unknown as N;
    const fleck = finishNoise(point.mul(17).add(phase) as unknown as N).sub(0.5).mul(float(1).sub(smoothstep(0.02, 0.08, footprint))) as unknown as N;
    // 墙板：局部坐标以格为单位，格边画灰缝（fwidth 保持线宽恒定）。
    const edge = min(fract(cell), float(1).sub(fract(cell)));
    const edgeDistance = min(edge.x, edge.y) as unknown as N;
    const grout = float(1).sub(smoothstep(0.008, fwidth(edgeDistance).mul(1.5).add(0.008), edgeDistance)) as unknown as N;
    fields = { seed, cloud, fleck, grain, grout: wall ? grout : (float(0) as unknown as N), edgeDistance };
    // normal_fragment_maps 之后的高度扰动（NORMAL 子构建里基准即 GLSL normal）。
    const dx = dFdx(positionView);
    const dy = dFdy(positionView);
    const base = normalOf(material);
    const r1 = cross(dy, base);
    const r2 = cross(base, dx);
    const det = dot(dx, r1);
    const height = cloud.mul(cloudHeight).add(fleck.mul(0.0003));
    material.normalNode = normalize(abs(det).mul(base).sub(sign(det).mul(dFdx(height).mul(r1).add(dFdy(height).mul(r2))))) as unknown as Node;
  });
  afterColor(material, (rgb) => {
    const { seed, cloud, fleck, grain, grout, edgeDistance } = current();
    const angle = seed.y.mul(6.2832);
    const shade = clamp(dot(cell.sub(0.5), vec2(cos(angle), sin(angle))), -0.7, 0.7);
    const k = float(1).add(seed.x.mul(tone)).add(shade.mul(0.05)).add(cloud.mul(cloudTone)).add(fleck.mul(0.025)).add(grain.mul(0.012));
    let out = rgb.mul(k).mul(vec3(seed.z.mul(warmth).add(1), 1, float(1).sub(seed.z.mul(warmth))));
    // 墙板灰缝与缝边接触暗角。
    if (wall) out = out.mul(mix(float(1).sub(float(1).sub(smoothstep(0, 0.07, edgeDistance)).mul(0.1)), 0.65, grout));
    return out as unknown as N;
  });
  beforeLighting(material, function () {
    const { seed, cloud, fleck, grain, grout } = current();
    const r = clamp(roughnessOf(this).add(seed.w.mul(roughness)).add(cloud.mul(cloudRough)).add(fleck.mul(0.025)).add(grain.mul(0.015)).add(grout.mul(0.4)), 0, 1);
    // finishTop 取扰动后的法线（片元里的 normalView 即上面的 normalNode）。
    const up = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
    const top = smoothstep(0.7, 0.95, dot(fragmentNormal, up));
    (this as typeof this & { roughnessNode: Node | null }).roughnessNode = r.mul(mix(1, 0.72, top)) as unknown as Node;
  });
};

// ---- 能量门溶解 gate-dissolve（render/ai-city-architecture createDoorEnergy）----

const gateDissolve: Translate<'gate-dissolve'> = (material, { dissolve }, source) => {
  // GLSL vGatePosition = modelMatrix * transformed（门的网格都不实例化，即 positionWorld）。
  const p = positionWorld as unknown as N;
  const gateUv = vec2(p.y, p.x.add(p.z)).mul(10);
  const cell = floor(gateUv) as unknown as N;
  const b0 = fract(gateUv);
  const b = b0.mul(b0).mul(float(3).sub(b0.mul(2)));
  const grain = mix(mix(hash2(cell), hash2(cell.add(vec2(1, 0))), b.x), mix(hash2(cell.add(vec2(0, 1))), hash2(cell.add(vec2(1))), b.x), b.y);
  const remaining = grain.add(0.12).sub(shared(dissolve).mul(1.24));
  addDiscard(material, remaining.lessThan(0) as unknown as N);
  const edge = float(1).sub(smoothstep(0, 0.08, remaining));
  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    const outgoing = vec3(prev.call(this, builder));
    // 同 GLSL #ifdef OPAQUE：不透明时 opaque_fragment 把 alpha 写回 1。
    if (!isOpaque(source)) diffuseColor.a.mulAssign(smoothstep(0, 0.035, remaining));
    return outgoing.add(vec3(0.8, 2.4, 3.0).mul(edge)) as unknown as Node;
  };
};

// ---- 港口岸景雾 harbor-shore-haze（render/harbor-shore：整段替换 fog_fragment）----

const harborShoreHaze: Translate<'harbor-shore-haze'> = (material, { near, color, halfDistance }, source) => {
  // GLSL 里先挂的补丁先替换掉 fog_fragment；depth-haze 的翻译整段改写 setupFog，两者并存时无法按登记顺序还原，直接报错。
  if (nodePatches(source).some((p) => p.kind === 'depth-haze')) throw new Error(`webgpu-patches-city: 材质 '${materialLabel(source)}' 同时登记了 depth-haze 与 harbor-shore-haze`);
  // 同 GLSL：${halfDistance.toFixed(1)} 与 0.65。
  const half = Number(halfDistance.toFixed(1));
  material.setupFog = function (builder: NodeBuilder, outputNode: Node): Node {
    // 同 GLSL #ifdef USE_FOG：场景无雾时不变（材质 fog = false 时 three 不调用 setupFog）。
    if (!builder.fogNode) return outputNode;
    const factor = min(float(1).sub(exp2(max(positionView.z.negate().sub(shared(near)), 0).negate().div(half))), 0.65);
    const out = vec4(outputNode);
    return vec4(mix(out.rgb, shared(color), factor), out.a) as unknown as Node;
  };
};

export const CITY_PATCHES: PatchTable<'natural-building' | 'furniture-fabric' | 'ai-city-finish' | 'gate-dissolve' | 'harbor-shore-haze'> = {
  'natural-building': naturalBuilding,
  'furniture-fabric': furnitureFabric,
  'ai-city-finish': aiCityFinish,
  'gate-dissolve': gateDissolve,
  'harbor-shore-haze': harborShoreHaze,
};
