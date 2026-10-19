/**
 * WebGPU 角色类补丁翻译：变身羽毛、鹈鹕羽毛遮蔽标记、围巾飘动、NPC 变身渐隐、传送溶解、水弹果冻、鱼尾摆动（各 render 模块 GLSL 同式）。
 * 围巾、NPC、传送的补丁同时登记在 customDepthMaterial 上，阴影通道部分见 CHARACTER_SHADOW_PATCHES。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial } from 'three/webgpu';
import {
  Fn, abs, attribute, clamp, cos, diffuseColor, dot, float, floor, fract, max, mix, normalGeometry, normalLocal, output, positionGeometry,
  positionLocal, positionViewDirection, pow, screenCoordinate, select, sin, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { addDiscard, beforeLighting, deformAfterSkinning, deformBeforeInstance, fragmentNormal, materialLabel, shared, toWorld } from './webgpu-node-utils.ts';
import type { GeometryPreparers, N, Patch, PatchTable, ShadowTable, Translate } from './webgpu-node-utils.ts';

/** positionNode / 蒙皮后改写都在实例变换之后：只有普通网格与 GLSL（实例变换前）一致。 */
function requireUninstanced(builder: NodeBuilder, kind: string): void {
  const object = builder.object as THREE.InstancedMesh & { isBatchedMesh?: boolean };
  if (object.isInstancedMesh || object.isBatchedMesh) throw new Error(`webgpu-patches-characters: ${kind} 不支持实例/批次网格 '${object.name}'`);
}

// ---- 变身羽毛 feather-surface-growth（render/player-transform 同式）----

const featherPacks = new WeakMap<THREE.BufferAttribute, THREE.BufferAttribute>();
/**
 * aFeatherStage / aFeatherBill 拷贝打包成一个 vec2 几何属性 aFeatherPack：蒙皮角色本身已占 5～7 个顶点缓冲，两个标量各占一个会超出适配器 8 个上限。
 * shortcut: 按 aFeatherStage 属性对象缓存（每次变身重新建属性），建好后不再改写；若改为原地更新，需要按 version 重新打包。
 */
function packFeather(geometry: THREE.BufferGeometry): void {
  const stage = geometry.getAttribute('aFeatherStage') as THREE.BufferAttribute | undefined;
  const bill = geometry.getAttribute('aFeatherBill') as THREE.BufferAttribute | undefined;
  if (stage === undefined || bill === undefined) throw new Error(`webgpu-patches-characters: 几何 '${geometry.name}' 缺少 aFeatherStage / aFeatherBill`);
  let pack = featherPacks.get(stage);
  if (pack === undefined) {
    const array = new Float32Array(stage.count * 2);
    for (let i = 0; i < stage.count; i++) {
      array[i * 2] = stage.getX(i);
      array[i * 2 + 1] = bill.getX(i);
    }
    featherPacks.set(stage, (pack = new THREE.BufferAttribute(array, 2)));
  }
  if (geometry.getAttribute('aFeatherPack') !== pack) geometry.setAttribute('aFeatherPack', pack);
}
const featherScalars = attribute('aFeatherPack', 'vec2') as unknown as N;

const featherSurfaceGrowth: Translate<'feather-surface-growth'> = (material, { phase, active, bird }) => {
  const p = shared(phase);
  const on = shared(active).greaterThan(0.5);
  // 片元：鸟一侧保留 phase ≥ stage，人一侧保留 phase < stage（同 GLSL clipping_planes_fragment 之后的 discard）。
  const stage = featherScalars.x;
  addDiscard(material, on.and(bird ? p.lessThan(stage) : p.greaterThanEqual(stage)) as unknown as N);
  // 蒙皮之后：喙部顶点 x 向嘴根 0.3 收拢（同式常量同 GLSL）。
  deformAfterSkinning(material, (q, builder) => {
    requireUninstanced(builder, 'feather-surface-growth');
    const bill = featherScalars.y;
    return select(on.and(bill.greaterThan(0.5)), vec3(mix(float(0.3), q.x, smoothstep(0.47, 0.8, p)), q.y, q.z), q) as unknown as N;
  });
};

// ---- 鹈鹕羽毛遮蔽 pelican-plumage-occlusion（render/pelican/pelican-rig：opaque_fragment 后 gl_FragColor.a = -0.8）----

const plumageOcclusion: Translate<'pelican-plumage-occlusion'> = (material) => {
  const prev = material.outputNode as N | null;
  // 负 alpha 只对场景 HDR 目标有意义（后期据此减弱 AO 并输出 alpha 1）；直接画到画布时会被夹成 0 变透明，保持原输出。
  material.outputNode = Fn((builder: NodeBuilder) => {
    const out = prev ?? (output as unknown as N);
    return builder.renderer.getRenderTarget() === null ? out : vec4(out.rgb, -0.8);
  })();
};

// ---- 围巾 pelican-scarf（render/pelican/pelican-scarf CLOTH_SHADER 同式）----

function scarfOffset({ uniforms: u }: Patch<'pelican-scarf'>, x: N): N {
  const phase = shared(u.phase);
  const amplitude = shared(u.amplitude);
  // 颈侧接缝固定：只有 x < -0.28 的飘带段位移（常量同 GLSL）。
  const along = max(x.negate().sub(0.28), 0);
  const weight = along.mul(along).div(along.add(0.35));
  const wave = along.mul(5.2).sub(phase).add(shared(u.ribbon));
  const ripple = sin(wave).add(sin(wave.mul(1.73).add(phase.mul(0.31))).mul(0.28));
  return vec3(shared(u.flow).mul(0.055), shared(u.lift).add(amplitude.mul(ripple)), amplitude.mul(0.35).mul(sin(wave.add(1.1)))).mul(weight) as unknown as N;
}

/** GLSL 在 morphtarget 之后、skinning 之前位移：只有不蒙皮、不实例化的网格与 positionNode / 变形后改写等价。 */
function requireRigidScarf(builder: NodeBuilder): void {
  requireUninstanced(builder, 'pelican-scarf');
  if ((builder.object as THREE.SkinnedMesh).isSkinnedMesh) throw new Error(`webgpu-patches-characters: pelican-scarf 不支持蒙皮网格 '${builder.object.name}'`);
}

const pelicanScarf: Translate<'pelican-scarf'> = (material, patch) => {
  const prev = material.setupPosition;
  // 直接在顶点栈里改 positionLocal / normalLocal（positionNode 的 POSITION 子构建里给 normalLocal 赋值会落到另一个子构建变量上）。
  material.setupPosition = function (this: NodeMaterial, builder: NodeBuilder): Node {
    requireRigidScarf(builder);
    prev.call(this, builder);
    const x = positionGeometry.x;
    const slope = scarfOffset(patch, x.add(0.001)).sub(scarfOffset(patch, x.sub(0.001))).div(0.002).toVar();
    const n = normalLocal;
    normalLocal.assign(vec3(n.x.sub(dot(slope.yz, n.yz)).div(slope.x.add(1)), n.y, n.z));
    positionLocal.assign(positionLocal.add(scarfOffset(patch, positionLocal.x as unknown as N)));
    return positionLocal;
  };
};

// ---- NPC 变身渐隐 npc-form-fade（render/npc/npc-transformation：alphatest 之后按屏幕像素噪声 discard）----

/**
 * 同 GLSL fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), …)))。WebGPU 的 screenCoordinate y 向下，抖动图样上下翻转（统计上相同）。
 */
function formDiscard({ humanMix, human }: Patch<'npc-form-fade'>): N {
  const noise = fract(fract(dot(floor(screenCoordinate.xy), vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const mixNode = shared(humanMix);
  return (human ? noise.greaterThanEqual(mixNode) : noise.lessThan(mixNode)) as unknown as N;
}

const npcFormFade: Translate<'npc-form-fade'> = (material, patch) => addDiscard(material, formDiscard(patch));

// ---- 传送溶解 teleport-dissolve（render/teleport-effect）----

/** 同 GLSL：4 像素一格的随机阈值（screenCoordinate y 向下，格子图样上下翻转）。 */
function teleportDiscard({ amount }: Patch<'teleport-dissolve'>): N {
  const cell = fract(sin(dot(floor(screenCoordinate.xy.div(4)), vec2(12.9898, 78.233))).mul(43758.5453));
  return shared(amount).greaterThan(cell) as unknown as N;
}

const teleportDissolve: Translate<'teleport-dissolve'> = (material, patch) => {
  addDiscard(material, teleportDiscard(patch));
  // GLSL 在 colorspace_fragment 前（雾之前）混入青色；场景通道写 HDR 目标时色调映射为空操作，与这里在 setupOutput 入口（雾之前、映射之前）混合一致。
  const prev = material.setupOutput;
  const amount = shared(patch.amount);
  material.setupOutput = function (this: NodeMaterial, builder: NodeBuilder, outputNode: Node): Node {
    const out = vec4(outputNode) as unknown as N;
    return prev.call(this, builder, vec4(mix(out.rgb, vec3(0.25, 1.25, 1.65), amount.mul(0.45)), out.a));
  };
};

// ---- 水弹果冻 water-jelly（render/projectile-views JELLY_VERTEX / JELLY_FRAGMENT 同式）----

const waterJelly: Translate<'water-jelly'> = (material, { uniforms: u }, source) => {
  if (!source.transparent) throw new Error(`webgpu-patches-characters: water-jelly 改写 alpha，材质 '${materialLabel(source)}' 必须透明`);
  const amp = shared(u.uJellyAmp);
  const freq = shared(u.uJellyFreq);
  const jt = shared(u.uJellyTime).mul(shared(u.uJellySpeed));
  // begin_vertex：沿几何法线的时间噪声抖动；相位取模型原点世界坐标（GLSL 不含实例矩阵）。
  deformBeforeInstance(material, () => {
    const jw = toWorld(null, vec3(0));
    const jp = positionGeometry.mul(freq);
    const jn = sin(jp.x.add(jt).add(jw.x.mul(1.7)))
      .mul(sin(jp.y.mul(1.13).sub(jt.mul(1.21)).add(jw.y.mul(1.3))))
      .add(sin(jp.z.mul(0.87).add(jp.x.mul(0.5)).add(jt.mul(0.77))).mul(0.5));
    positionLocal.addAssign(normalGeometry.mul(jn.mul(amp)));
  });
  // emissivemap_fragment 之后、受光之前：菲涅尔边缘更实更亮。
  beforeLighting(material, () => {
    const fresnel = pow(float(1).sub(clamp(abs(dot(fragmentNormal.normalize(), positionViewDirection)), 0, 1)), 2.2).toVar();
    diffuseColor.a.assign(mix(diffuseColor.a, 0.96, fresnel));
    diffuseColor.rgb.assign(mix(diffuseColor.rgb, vec3(0.86, 0.96, 1.0), fresnel.mul(0.55)));
  });
};

// ---- 鱼尾 fish-tail（render/fish-view：begin_vertex 行波摆尾，实例变换之前）----

const fishTail: Translate<'fish-tail'> = (material, { wagY, wagZ }) => {
  deformBeforeInstance(material, () => {
    const body = attribute('aBody', 'float');
    const swim = attribute('aSwim', 'vec2');
    const k = body.mul(body).mul(swim.y);
    const a = swim.x.sub(body.mul(4));
    positionLocal.assign(positionLocal.add(vec3(0, k.mul(wagY).mul(cos(a)), k.mul(wagZ).mul(sin(a)))));
  });
};

export const CHARACTER_PATCHES: PatchTable<'feather-surface-growth' | 'pelican-plumage-occlusion' | 'pelican-scarf' | 'npc-form-fade' | 'teleport-dissolve' | 'water-jelly' | 'fish-tail'> = {
  'feather-surface-growth': featherSurfaceGrowth,
  'pelican-plumage-occlusion': plumageOcclusion,
  'pelican-scarf': pelicanScarf,
  'npc-form-fade': npcFormFade,
  'teleport-dissolve': teleportDissolve,
  'water-jelly': waterJelly,
  'fish-tail': fishTail,
};

/** 阴影通道：围巾只做位置（与深度材质同式），NPC 与传送按同一噪声 discard。 */
export const CHARACTER_SHADOW_PATCHES: ShadowTable<'pelican-scarf' | 'npc-form-fade' | 'teleport-dissolve'> = {
  'pelican-scarf': (patch) => ({
    deform(p, builder) {
      requireRigidScarf(builder);
      return p.add(scarfOffset(patch, p.x)) as unknown as N;
    },
  }),
  'npc-form-fade': (patch) => ({ discard: () => formDiscard(patch) }),
  'teleport-dissolve': (patch) => ({ discard: () => teleportDiscard(patch) }),
};

/** 变身羽毛的打包属性在构建前挂到每个网格的几何上。 */
export const CHARACTER_GEOMETRY_PREPARERS: GeometryPreparers<'feather-surface-growth'> = { 'feather-surface-growth': packFeather };
