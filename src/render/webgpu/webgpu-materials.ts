/**
 * WebGPU 节点材质接入：包装 renderer.library.fromMaterial —— three 把普通材质复制成节点材质后，按 render/node-patches 登记的顺序
 * 把 onBeforeCompile 补丁翻译成节点（WebGPURenderer 忽略 onBeforeCompile）。翻译函数按主题分在 webgpu-light-map、webgpu-patches-*，这里汇总成表。
 * - 不缓存节点材质：three 每次构建渲染对象（新物体、材质 version 变化）都重新复制原材质，复制件的属性因此与原材质同步；
 *   翻译只在构建时运行，开销与 three 自身的复制相同。
 * - 共享 uniform：每个 WebGL IUniform 对象对应一个 uniform 节点（WeakMap 缓存，所有材质共用），每次渲染从 IUniform.value 读取，
 *   现有每帧写 WebGL uniform 的代码在 WebGPU 下同样生效。
 * - 节点构建缓存：three 按材质缓存键共享节点构建结果，而节点属性只按“有/无”计入键；补丁节点直接绑定各自的 uniform / 几何，
 *   所以登记了补丁的材质在键后追加材质 id，不同材质（如两条围巾的 ribbon uniform）不会共用另一份的节点。
 * - 顶点补丁在实例/批次变换之前变形（GLSL begin_vertex 后改 transformed），而 NodeMaterial.positionNode 在实例变换之后，因此改写 setupPosition
 *   （地形 tile-layers；植被的风摆、变体塌缩按登记顺序串在 deformBeforeInstance 里）；蒙皮之后的变形用 positionNode（deformAfterSkinning）。
 * - 阴影：WebGPU 阴影通道用共享的 ShadowMaterial 覆盖网格材质，不读 customDepthMaterial。renderObject 包装在阴影通道里按网格
 *   customDepthMaterial 登记的补丁临时设置覆盖材质的 positionNode / colorNode（位置变形、discard），对应 WebGL 的自定义深度材质。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial, WebGPURenderer } from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, attribute, bufferAttribute, clamp, code, cos, cross, dFdx, dFdy, diffuseColor, dot, float, floor, fract,
  instancedBufferAttribute, int, length, materialColor, materialOpacity, materialReference, min, mix, modelWorldMatrix,
  normalGeometry, normalLocal, normalView, normalViewGeometry, normalize, positionGeometry, positionLocal, positionView, positionViewDirection, positionWorld,
  select, sign, sin, smoothstep, sqrt, texture, uv, varying, varyingProperty, vec2, vec3, vec4, vertexColor,
  wgslFn,
} from 'three/tsl';
import { FLORA_WIND_SHADER } from '../flora/flora.ts';
import { DISTURB_MAX_SOURCES, DISTURB_SINK, DISTURB_Y_STRETCH } from '../flora/grass-disturb.ts';
import type { DisturbUniforms } from '../flora/grass-disturb.ts';
import { nodePatches } from '../stage/node-patches.ts';
import { TILE_INSTANCE_ATTRIBUTES } from '../tile/tile-material.ts';
import { BARK_EDGE_SHADE, LEAF_WIND } from '../tree/tree-material.ts';
import { TREE_BEND } from '../tree/tree-wind.ts';
import type { NodePatch } from '../stage/node-patches.ts';
import type { WindUniforms } from '../sky/wind.ts';
import { TAU } from '../../world/wind.ts';
import { cloudShadow, depthHaze, lightMap } from './webgpu-light-map.ts';
import { deformBeforeInstance, inverseLinear, materialLabel, preInstance, shared, sharedVec4Array, toWorld, windSway } from './webgpu-node-utils.ts';
import type { N, ShadowParts, ShadowTable, ShadowTranslate, Translate } from './webgpu-node-utils.ts';
import { CHARACTER_GEOMETRY_PREPARERS, CHARACTER_PATCHES, CHARACTER_SHADOW_PATCHES } from './webgpu-patches-characters.ts';
import { CITY_PATCHES } from './webgpu-patches-city.ts';
import { GROUND_PATCHES } from './webgpu-patches-ground.ts';
import { WATER_PATCHES } from './webgpu-patches-water.ts';
import { TILE_COMMON_WGSL, TILE_FRAGMENT_WGSL, TILE_SHADE_FN, TILE_VERTEX_NORMAL_FN, TILE_VERTEX_POSITION_FN, TILE_VERTEX_WGSL } from './webgpu-tile-wgsl.ts';

// ShaderMaterial 转换（webgpu-shader-nodes）沿用这里的共享 uniform。
export { shared } from './webgpu-node-utils.ts';

/** 把 onBeforeCompile 补丁装到 three 复制出的节点材质上，并让阴影通道执行网格自定义深度材质的补丁。 */
export function installNodePatches(renderer: WebGPURenderer): void {
  const { library } = renderer;
  const copy = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    const patches = nodePatches(material);
    const node = copy(material);
    if (patches.length === 0) return node;
    if (node === null || node === material) throw new Error(`webgpu-materials: 材质 '${materialLabel(material)}' 登记了节点补丁，但没有可修改的节点材质副本`);
    const nodeMaterial = node as NodeMaterial;
    for (const patch of patches) (NODE_PATCH_TRANSLATIONS[patch.kind] as Translate<NodePatch['kind']>)(nodeMaterial, patch, material);
    const key = nodeMaterial.customProgramCacheKey;
    nodeMaterial.customProgramCacheKey = () => `${key.call(nodeMaterial)}|np${material.uuid}`;
    return node;
  };
  const renderObject = renderer.renderObject.bind(renderer);
  renderer.renderObject = (object, scene, camera, geometry, material, ...rest) => {
    for (const patch of nodePatches(material)) (GEOMETRY_PREPARERS as Partial<Record<NodePatch['kind'], (g: THREE.BufferGeometry) => void>>)[patch.kind]?.(geometry);
    const override = scene.overrideMaterial as (NodeMaterial & { isShadowPassMaterial?: boolean }) | null;
    if (override?.isShadowPassMaterial === true && !quietShadowMaterials.has(override)) quietAlphaTest(override);
    const depth = (object as THREE.Mesh).customDepthMaterial;
    // 场景只有平行光投影（stage 主光），点光源的 customDistanceMaterial 不参与。
    if (override?.isShadowPassMaterial !== true || depth === undefined || nodePatches(depth).length === 0) {
      renderObject(object, scene, camera, geometry, material, ...rest);
      return;
    }
    const { position, color } = shadowNodes(depth);
    const { positionNode, colorNode } = override;
    if (position !== null) override.positionNode = position;
    if (color !== null) override.colorNode = color;
    renderObject(object, scene, camera, geometry, material, ...rest);
    override.positionNode = positionNode;
    override.colorNode = colorNode;
  };
}

const quietShadowMaterials = new WeakSet<THREE.Material>();
/**
 * three 画每个投影物体前把它的 alphaTest 写到共享阴影材质上，跨过 0 时 version++，下一个物体的渲染对象就要重算缓存键
 * （原野森林约 130 次/帧、约 1.6 ms）。各物体自己的 alphaTest 不变，渲染对象的缓存键也不会变，且阈值按引用每次绘制读取，
 * 所以只存值、不加 version。
 */
function quietAlphaTest(material: THREE.Material): void {
  let value = material.alphaTest;
  Object.defineProperty(material, 'alphaTest', { get: () => value, set: (v: number) => { value = v; }, configurable: true });
  quietShadowMaterials.add(material);
}

const shadowCache = new WeakMap<THREE.Material, { readonly position: Node | null; readonly color: Node | null }>();
let shadowIds = 0;
/** 深度材质补丁 → 阴影覆盖材质的 positionNode（实例/蒙皮之后依次变形）与 colorNode（discard 后输出阴影色）；按深度材质缓存，customCacheKey 区分不同材质的 uniform。 */
function shadowNodes(depth: THREE.Material) {
  const cached = shadowCache.get(depth);
  if (cached) return cached;
  const parts: ShadowParts[] = nodePatches(depth).map((patch) => {
    const translate = (SHADOW_PATCH_TRANSLATIONS as Partial<Record<NodePatch['kind'], ShadowTranslate<NodePatch['kind']>>>)[patch.kind];
    if (translate === undefined) throw new Error(`webgpu-materials: 深度材质 '${materialLabel(depth)}' 的补丁 '${patch.kind}' 没有阴影通道翻译`);
    return translate(patch);
  });
  const deforms = parts.flatMap((p) => (p.deform ? [p.deform] : []));
  const discards = parts.flatMap((p) => (p.discard ? [p.discard] : []));
  const position = deforms.length === 0 ? null : Fn((builder: NodeBuilder) => deforms.reduce<N>((p, d) => d(p, builder), positionLocal as unknown as N))();
  const color =
    discards.length === 0
      ? null
      : Fn(() => {
          for (const d of discards) d().discard();
          return vec4(0, 0, 0, 1);
        })();
  const id = ++shadowIds;
  for (const node of [position, color]) if (node !== null) (node as unknown as { customCacheKey(): number }).customCacheKey = () => id;
  const nodes = { position: position as Node | null, color: color as Node | null };
  shadowCache.set(depth, nodes);
  return nodes;
}

// ---- 地形 tile-layers（WGSL 见 webgpu-tile-wgsl）----

const tileCommon = code(TILE_COMMON_WGSL);
const tileVertexCode = code(TILE_VERTEX_WGSL, [tileCommon]);
const tileVertexNormal = wgslFn(TILE_VERTEX_NORMAL_FN, [tileVertexCode]);
const tileVertexPosition = wgslFn(TILE_VERTEX_POSITION_FN, [tileVertexCode]);
const tileShade = wgslFn(TILE_SHADE_FN, [code(TILE_FRAGMENT_WGSL, [tileCommon])]);
type WgslCall = (args: Record<string, unknown>) => N;
type InstanceAttr = keyof typeof TILE_INSTANCE_ATTRIBUTES;
const ATTR_SIZE = { float: 1, vec3: 3, vec4: 4 } as const;
const packedInstances = new WeakMap<THREE.BufferGeometry, { buffer: THREE.InstancedInterleavedBuffer; offsets: Record<InstanceAttr, number> }>();

/**
 * WebGPU 每个 BufferAttribute 占一个顶点缓冲（适配器上限常为 8），方块的 8 个实例属性在 WebGPU 侧拷贝打包成一个交错缓冲。
 * shortcut: tile-view 只在建块时写一次实例数据（改动即重建几何），这里不再同步；若改为原地更新实例属性，需要按 version 重新打包。
 */
function packInstances(geometry: THREE.BufferGeometry) {
  const cached = packedInstances.get(geometry);
  if (cached) return cached;
  const names = Object.keys(TILE_INSTANCE_ATTRIBUTES) as InstanceAttr[];
  const offsets = {} as Record<InstanceAttr, number>;
  let stride = 0;
  for (const name of names) {
    offsets[name] = stride;
    stride += ATTR_SIZE[TILE_INSTANCE_ATTRIBUTES[name]];
  }
  const count = geometry.getAttribute('aShape').count;
  const array = new Float32Array(count * stride);
  for (const name of names) {
    const attr = geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
    const size = ATTR_SIZE[TILE_INSTANCE_ATTRIBUTES[name]];
    if (attr.count !== count || attr.itemSize !== size) throw new Error(`webgpu-materials: tile attribute ${name} has ${attr.count}×${attr.itemSize}, expected ${count}×${size}`);
    const src = attr.array as Float32Array;
    for (let i = 0; i < count; i++) array.set(src.subarray(i * size, (i + 1) * size), i * stride + offsets[name]);
  }
  const packed = { buffer: new THREE.InstancedInterleavedBuffer(array, stride, 1), offsets };
  packedInstances.set(geometry, packed);
  return packed;
}

const tileLayers: Translate<'tile-layers'> = (material, { texture: tiles }) => {
  material.setupPosition = function (builder: NodeBuilder): Node {
    const mesh = builder.object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) throw new Error(`webgpu-materials: tile-layers 只用于 InstancedMesh（'${mesh.name}'）`);
    const { M: instanceMatrix, apply } = preInstance(builder);
    const M = instanceMatrix as N;
    const { buffer, offsets } = packInstances(mesh.geometry);
    // 每个属性只建一个节点：重复的节点各占一个顶点输入槽（上限 16）。
    const attrs = new Map<InstanceAttr, N>();
    const at = (name: InstanceAttr): N => {
      let node = attrs.get(name);
      if (node === undefined) attrs.set(name, (node = instancedBufferAttribute(buffer, TILE_INSTANCE_ATTRIBUTES[name], buffer.stride, offsets[name]) as unknown as N));
      return node;
    };
    const aVert = attribute('aVert', 'vec4');
    const args = {
      p: positionGeometry, n: normalGeometry, vert: aVert, shape: at('aShape'), rounds: at('aRound'), code: at('aCode'), top: at('aTop'), scale: at('aScale'),
      inst: M, model: modelWorldMatrix,
    };
    const objectNormal = (tileVertexNormal as unknown as WgslCall)(args).toVar();
    const transformed = (tileVertexPosition as unknown as WgslCall)(args).toVar();
    positionLocal.assign(transformed);
    normalLocal.assign(objectNormal);
    apply();

    // VERTEX_MAIN 的输出（世界坐标即 positionWorld：变形 + 实例 + 模型）；实例数据用 flat varying，按 vec4 打包省槽位。
    const flat = (node: Node): N => varying(node).setInterpolation('flat') as unknown as N;
    const world4 = modelWorldMatrix.mul(M);
    const normal = varying(normalize(world4.mul(vec4(objectNormal, 0)).xyz));
    const kind = aVert.w;
    const local = varying(select(kind.greaterThan(3.5).and(kind.lessThan(4.5)), transformed.xy, positionGeometry.xy));
    const cell = floor(world4.mul(vec4(0, 0, 0, 1)).xy.add(1e-3));
    const tex = texture(tiles);
    const shade = (tileShade as unknown as WgslCall)({
      world: positionWorld, normal, local,
      layersKind: flat(vec4(at('aLayers'), kind)), cellShape: flat(vec4(cell, at('aShape'), 0)),
      nbr: flat(at('aNbr')), code: flat(at('aCode')), param: flat(at('aParam')), scale: flat(at('aScale')), rounds: flat(at('aRound')), top: flat(at('aTop')),
      tiles: tex, tilesSampler: tex,
    });
    // FRAGMENT_MAIN：diffuseColor.rgb *= tileShade()。
    this.colorNode = materialColor.mul(vec4(shade, 1));
    return positionLocal;
  };
};

// ---- 植被：共享风场与草地扰动（render/wind WIND_GLSL、render/grass-disturb DISTURB_GLSL 同式）----

/** grassDisturb( w ) → 世界空间叶尖位移。 */
function grassDisturb(u: DisturbUniforms, w: N): N {
  const A = sharedVec4Array(u.uDisturbA);
  const B = sharedVec4Array(u.uDisturbB);
  const count = shared(u.uDisturbCount, 'int');
  const ox = float(0).toVar();
  Loop(DISTURB_MAX_SOURCES, ({ i: index }) => {
    // @types/three 把循环变量标成 number，实际是 int 节点。
    const i = index as unknown as N;
    If(i.greaterThanEqual(count), () => {
      Break();
    });
    const a = A.element(i) as unknown as N;
    const b = B.element(i) as unknown as N;
    const fall = float(1).sub(smoothstep(0, a.z, length(w.xy.sub(a.xy).mul(vec2(1, DISTURB_Y_STRETCH)))));
    const dir = select(b.y.greaterThan(0.5), select(w.x.greaterThanEqual(a.x), float(1), float(-1)), b.x);
    ox.addAssign(a.w.mul(dir).mul(fall));
  });
  return vec3(ox, abs(ox).mul(-DISTURB_SINK), 0) as unknown as N;
}

const FLORA_SCALARS = ['aTip', 'aPetal', 'aFly', 'aVar'] as const;
const floraScalarNodes = new WeakMap<THREE.BufferGeometry, N>();

/**
 * 花草的逐顶点标量 (aTip, aPetal, aFly, aVar) 在 WebGPU 侧拷贝打包成一个 vec4 顶点缓冲（无 aVar 的几何填 0）：
 * 水中悬浮物（InstancedMesh + 变体塌缩 + 透明度）单独绑定会超出适配器 8 个顶点缓冲的上限。
 * shortcut: 花草几何建好后不再改写这些属性，这里不同步 version；若改为原地更新，需要按 version 重新打包。
 */
function floraScalars(geometry: THREE.BufferGeometry): N {
  const cached = floraScalarNodes.get(geometry);
  if (cached) return cached;
  const n = geometry.getAttribute('position').count;
  const array = new Float32Array(n * 4);
  FLORA_SCALARS.forEach((name, k) => {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (attr === undefined && name === 'aVar') return;
    if (attr === undefined || attr.itemSize !== 1 || attr.count !== n) throw new Error(`webgpu-materials: flora geometry '${geometry.name}' needs ${name} (1 × ${n})`);
    for (let i = 0; i < n; i++) array[i * 4 + k] = attr.getX(i);
  });
  const node = bufferAttribute(new THREE.InterleavedBuffer(array, 4), 'vec4', 4, 0) as unknown as N;
  floraScalarNodes.set(geometry, node);
  return node;
}

// ---- 花草风摆 flora-wind（render/flora createWindMaterial 同式）----

const FW = FLORA_WIND_SHADER;
const FB = FW.butterfly;

const floraWind: Translate<'flora-wind'> = (material, { wind, disturb, uniforms: u }) => {
  const sway = windSway(wind);
  deformBeforeInstance(material, (M, builder) => {
    // GLSL 只在 USE_INSTANCING / USE_BATCHING 下摆动。
    if (M === null) return;
    const scalars = floraScalars(builder.geometry);
    const tip = scalars.x;
    const fly = scalars.z;
    const time = shared(u.time);
    const fw = toWorld(M, positionLocal).toVar();
    const ft = time.mul(shared(u.speed));
    const ph = fw.x.mul(FW.phaseX).add(fw.z.mul(FW.phaseZ)).toVar();
    const w = shared(u.windScale).mul(sway(fw.x, shared(wind.uWeatherTime))).toVar();
    const gust = float(FW.gustBase).add(min(abs(w), FW.gustCap).mul(FW.gustGain));
    const tip2 = float(1).sub(fly).mul(tip).mul(tip).toVar();
    const jitter = sin(ph.add(ft.mul(FW.flutter1.t))).mul(FW.flutter1.a).add(sin(fw.x.mul(FW.flutter2.x).add(fw.z.mul(FW.flutter2.z)).sub(ft.mul(FW.flutter2.t))).mul(FW.flutter2.a));
    const s = tip2.mul(shared(u.amplitude)).mul(w.mul(FW.lean).add(gust.mul(jitter))).toVar();
    const woff = vec3(s, abs(s).mul(-FW.sink), s.mul(FW.zAmp).mul(sin(ph.mul(FW.zPhase).add(ft))));
    const p = positionLocal.add(inverseLinear(M, woff)).toVar();
    p.addAssign(inverseLinear(M, grassDisturb(disturb, fw).mul(tip2.mul(shared(u.disturbScale)))));
    // 蝴蝶：按实例位置取相位，扑翼 + 绕悬停点的正弦飞行（世界空间，经逆变换回局部）。
    If(fly.greaterThan(0.5), () => {
      const ip = M.element(int(3)).xyz;
      const bp = fract(sin(dot(ip.xz, vec2(FB.hash[0], FB.hash[1]))).mul(FB.hash[2])).mul(FB.hash[3]).toVar();
      const flap = sin(time.mul(FB.flapRate).add(bp.mul(FB.flapPhase))).toVar();
      p.x.mulAssign(float(1).sub(tip.mul(FB.fold).mul(flap.mul(0.5).add(0.5))));
      p.y.addAssign(tip.mul(FB.lift).mul(flap));
      const axis = (terms: readonly { readonly a: number; readonly f: number; readonly p: number }[]): N =>
        terms.reduce<N>((sum, o) => sum.add(sin(time.mul(o.f).add(bp.mul(o.p))).mul(o.a)), float(0));
      p.addAssign(inverseLinear(M, vec3(axis(FB.fly.x).add(w.mul(FB.drift)), axis(FB.fly.y), axis(FB.fly.z))));
    });
    positionLocal.assign(p);
  });
  // color_vertex：实例色只乘 aPetal 部分（vColor = color · mix(1, 实例色, aPetal)）。
  const prevColor = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prevColor.call(this, builder);
    const object = builder.object as THREE.InstancedMesh & { isBatchedMesh?: boolean; _colorsTexture?: THREE.DataTexture | null };
    const name = object.isInstancedMesh && object.instanceColor ? 'vInstanceColor' : object.isBatchedMesh && object._colorsTexture ? 'vBatchColor' : null;
    // 同 GLSL #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR / USE_BATCHING_COLOR )。
    if (name === null || !this.vertexColors || !builder.geometry.hasAttribute('color')) return;
    const base = (this.colorNode ? vec4(this.colorNode) : materialColor) as unknown as N;
    const petal = varying(floraScalars(builder.geometry).y);
    diffuseColor.rgb.assign(base.rgb.mul(vertexColor().rgb).mul(mix(vec3(1), varyingProperty('vec3', name), petal)));
  };
  // 薄片双面受光一致：片元法线不随背面翻转（GLSL normal = normalize( vNormal )）。
  material.normalNode = normalViewGeometry;
};

// ---- 变体塌缩 variant-collapse（render/variant-atlas 同式）----

const variantCollapse: Translate<'variant-collapse'> = (material) => {
  deformBeforeInstance(material, (_M, builder) => {
    // GLSL 只在 USE_INSTANCING 下塌缩；BatchedMesh 每个实例只画自己变体的子几何（three 原生多绘制），不需要塌缩。
    if (!(builder.object as THREE.InstancedMesh).isInstancedMesh) return;
    const aVar = floraScalars(builder.geometry).w;
    positionLocal.assign(select(abs(aVar.sub(attribute('aVariant', 'float'))).greaterThan(0.5), vec3(0), positionLocal));
  });
};

// ---- 每实例透明度 instance-fade（render/water-flora-view addInstanceFade：diffuseColor.a *= aFade）----

const instanceFade: Translate<'instance-fade'> = (material) => {
  material.opacityNode = materialOpacity.mul(attribute('aFade', 'float'));
};

// ---- 树风 tree-wind（render/tree-material 叶层颤动 + render/tree-wind 枝弯曲、主弯曲同式）----

const LW = LEAF_WIND;
const K = TREE_BEND;

/** 叶层颤动 → 枝弯曲 → 主弯曲后的局部位置（p0 = 变形前的 transformed）。 */
function treeWindPosition(wind: WindUniforms, time: THREE.IUniform<number>, M: N | null, p0: N): N {
  const sway = windSway(wind);
  const t = shared(wind.uWeatherTime);
  const T = shared(time);
  const P = positionGeometry;
  const tw = toWorld(M, P);
  const w = sway(tw.x, t);
  const flutter = float(LW.flutterBase).add(min(abs(w), LW.flutterCap).mul(LW.flutterGain)).toVar();
  const aSway = attribute('aSway', 'float');
  const dx = aSway.mul(w.mul(LW.lean).add(flutter.mul(sin(T.mul(LW.x1.t).add(P.x.mul(LW.x1.x)).add(P.y.mul(LW.x1.y))).mul(LW.x1.a).add(sin(T.mul(LW.x2.t).add(P.x.mul(LW.x2.x))).mul(LW.x2.a)))));
  const dy = aSway.mul(abs(w).mul(-LW.drop).add(flutter.mul(LW.bob.a).mul(sin(T.mul(LW.bob.t).add(P.x.mul(LW.bob.x))))));
  const p = p0.add(vec3(dx, dy, 0)).toVar();
  const bend = attribute('aBend', 'vec4');
  const branch = attribute('aBranch', 'vec4');
  const freq = branch.w;
  // treeBranchRotate：绕枝基点刚体转动（风取基点世界 x）。
  const s = sway(toWorld(M, vec3(branch.xy, 0)).x, t);
  const ph = float(TAU).mul(freq).mul(K.branchRatio).mul(t).add(branch.x.mul(K.branchPhaseX)).add(branch.y.mul(K.branchPhaseY));
  const th = clamp(branch.z.negate().mul(s.mul(K.branchLean).add(abs(s).mul(K.branchSwing).mul(sin(ph)))), -K.branchMax, K.branchMax).toVar();
  const r = p.xy.sub(branch.xy);
  const rotated = branch.xy.add(vec2(cos(th).mul(r.x).sub(sin(th).mul(r.y)), sin(th).mul(r.x).add(cos(th).mul(r.y))));
  const tp = select(branch.z.equal(0), p.xy, rotated).toVar();
  // treeBendAmount：惯性滞后 + 回弹 + 低频摇摆（风取树根世界 x）。
  const rootX = toWorld(M, vec3(bend.xy, 0)).x;
  const t0 = t.sub(float(K.lag).div(freq));
  const s0 = sway(rootX, t0);
  const s1 = sway(rootX, t0.sub(float(K.reboundWindow).div(freq)));
  const osc = sin(float(TAU).mul(freq).mul(t).add(rootX.mul(K.phaseX)));
  const amount = clamp(bend.w.mul(s0.mul(K.lean).add(s0.sub(s1).mul(K.rebound)).add(abs(s0).mul(K.swing).mul(osc))), -K.maxBend, K.maxBend);
  // treeMainBend：以树根为支点、h²、沿弧线保持长度；根以下与 H ≤ 0 不动。
  const H = bend.z;
  const rel = tp.sub(bend.xy).toVar();
  const h = min(rel.y.div(H), K.hMax);
  const moved = vec2(rel.x.add(amount.mul(H).mul(h).mul(h)), rel.y);
  const bent = select(H.lessThanEqual(0).or(rel.y.lessThanEqual(0)), tp, bend.xy.add(normalize(moved).mul(length(rel))));
  return vec3(bent, p.z) as unknown as N;
}

const treeWind: Translate<'tree-wind'> = (material, { wind, time }) => {
  deformBeforeInstance(material, (M) => {
    positionLocal.assign(treeWindPosition(wind, time, M, positionLocal as unknown as N));
  });
};

/** 树影随风（customDepthMaterial 的同一套风摆）：阴影通道的位置变形在实例变换之后，树网格不实例化，两者一致。 */
const treeShadowWind: ShadowTranslate<'tree-shadow-wind'> = ({ wind, time }) => ({
  deform(p, builder) {
    const object = builder.object as THREE.InstancedMesh & { isBatchedMesh?: boolean };
    if (object.isInstancedMesh || object.isBatchedMesh) throw new Error(`webgpu-materials: 树影风摆只支持普通网格（'${object.name}'）`);
    return treeWindPosition(wind, time, null, p);
  },
});

/** 灌木草地扰动 shrub-disturb（render/flora-shrubs SHRUB_DISTURB_BODY：aSway × 扰动，世界空间 → 局部）。 */
const shrubDisturb: Translate<'shrub-disturb'> = (material, { disturb, scale }) => {
  deformBeforeInstance(material, (M) => {
    if (M === null) return;
    const offset = grassDisturb(disturb, toWorld(M, positionGeometry)).mul(attribute('aSway', 'float').mul(shared(scale)));
    positionLocal.addAssign(inverseLinear(M, offset));
  });
};

// ---- 树皮 tree-bark（render/tree-material BARK_MAP / BARK_NORMAL 同式）----

const treeBark: Translate<'tree-bark'> = (material, { bump }, source) => {
  const { map } = source as THREE.MeshStandardMaterial;
  if (map === null) throw new Error(`webgpu-materials: 树皮材质 '${source.name}' 没有 map`);
  const tex = texture(map);
  const channel = attribute('aBark', 'float');
  // 通道选择：aBark 0/1/2 = 普通/白桦/椰子树皮，选中通道同时作亮度与高度。
  const barkH = (st: N): N => {
    const t = tex.sample(st) as unknown as N;
    return select(channel.lessThan(0.5), t.r, select(channel.lessThan(1.5), t.g, t.b));
  };
  const st = uv() as unknown as N;
  const lum = barkH(st);
  const dH = vec2(barkH(st.add(dFdx(st))).sub(lum), barkH(st.add(dFdy(st))).sub(lum)).mul(shared(bump));
  const sx = normalize(dFdx(positionView));
  const sy = normalize(dFdy(positionView));
  // normal_fragment_maps 之后的凹凸扰动：在 NORMAL 子构建里 normalView 是几何法线（含面朝向）。
  const r1 = cross(sy, normalView);
  const r2 = cross(normalView, sx);
  const det = dot(sx, r1);
  material.normalNode = normalize(abs(det).mul(normalView).sub(sign(det).mul(dH.x.mul(r1).add(dH.y.mul(r2)))));
  // map_fragment 换成亮度相乘，再按扰动后法线与视线的夹角压暗边缘（片元里的 normalView 即上面的 normalNode）。
  const facing = clamp(dot(normalView, positionViewDirection), 0, 1);
  material.colorNode = vec4(materialReference('color', 'color').mul(lum).mul(mix(BARK_EDGE_SHADE, 1, sqrt(facing))), 1);
};

/** 翻译表：每种登记的补丁一个翻译函数（类型保证覆盖所有 kind）。 */
const NODE_PATCH_TRANSLATIONS: { readonly [K in NodePatch['kind']]: Translate<K> } = {
  'tile-layers': tileLayers,
  'light-map': lightMap,
  'cloud-shadow': cloudShadow,
  'depth-haze': depthHaze,
  'flora-wind': floraWind,
  'variant-collapse': variantCollapse,
  'instance-fade': instanceFade,
  'tree-wind': treeWind,
  'shrub-disturb': shrubDisturb,
  'tree-bark': treeBark,
  'tree-shadow-wind': (_material, _patch, source) => {
    throw new Error(`webgpu-materials: tree-shadow-wind 只登记在 customDepthMaterial 上（材质 '${materialLabel(source)}'）`);
  },
  ...CHARACTER_PATCHES,
  ...WATER_PATCHES,
  ...GROUND_PATCHES,
  ...CITY_PATCHES,
};

/** 渲染前按补丁给几何补属性（见 GeometryPreparers）。 */
const GEOMETRY_PREPARERS = CHARACTER_GEOMETRY_PREPARERS;

/** 阴影通道翻译表：可登记在 customDepthMaterial 上的补丁。 */
const SHADOW_PATCH_TRANSLATIONS: ShadowTable<'tree-shadow-wind' | keyof typeof CHARACTER_SHADOW_PATCHES> = {
  'tree-shadow-wind': treeShadowWind,
  ...CHARACTER_SHADOW_PATCHES,
};
