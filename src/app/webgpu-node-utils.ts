/**
 * WebGPU 节点补丁的共用工具（只在 webgpu-stage 分块）：共享 uniform / 纹理节点、实例与批次变换前后的顶点变形、
 * discard 叠加、光照前的表面修改，以及翻译函数的类型。各翻译文件（webgpu-materials、webgpu-patches-*）共用。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial } from 'three/webgpu';
import {
  Fn, batch, cos, cross, dot, drawIndex, float, instanceIndex, instancedMesh, int, ivec2, mat4, materialNormal, materialRoughness, max, modelWorldMatrix,
  normalView, positionLocal, pow, sin, texture, textureLoad, textureSize, uniform, uniformArray, vec3, vec4,
} from 'three/tsl';
import type { NodePatch } from '../render/node-patches.ts';
import type { WindUniformName, WindUniforms } from '../render/wind.ts';
import { GUST_VARY, TAU } from '../world/wind.ts';

export type Patch<K extends NodePatch['kind']> = Extract<NodePatch, { kind: K }>;
export type Translate<K extends NodePatch['kind']> = (material: NodeMaterial, patch: Patch<K>, source: THREE.Material) => void;
/** 登记在 customDepthMaterial 上的补丁在 WebGPU 阴影通道里的等效部分：位置变形（实例/蒙皮之后）与 discard 条件。 */
export interface ShadowParts {
  readonly deform?: (p: N, builder: NodeBuilder) => N;
  readonly discard?: () => N;
}
export type ShadowTranslate<K extends NodePatch['kind']> = (patch: Patch<K>) => ShadowParts;
/** 各翻译文件导出的分表（webgpu-materials 汇总，类型保证覆盖所有 kind）。 */
export type PatchTable<K extends NodePatch['kind']> = { readonly [P in K]: Translate<P> };
export type ShadowTable<K extends NodePatch['kind']> = { readonly [P in K]: ShadowTranslate<P> };
/**
 * 渲染前给几何补属性（如把多个标量打包成一个顶点属性），webgpu-materials 的 renderObject 包装在每次绘制前按材质的补丁调用。
 * 补丁节点不能直接引用某个几何的缓冲：three 让同材质、同属性布局的不同网格共用一份节点构建，必须经几何属性按网格绑定；
 * 属性要在构建（及其缓存键）之前挂上，各网格的属性布局才一致。
 */
export type GeometryPreparers<K extends NodePatch['kind']> = { readonly [P in K]: (geometry: THREE.BufferGeometry) => void };
// TSL 节点的静态类型很宽（ShaderNodeObject），这里统一按“任意节点”处理。
export type N = ReturnType<typeof float>;

export const materialLabel = (m: THREE.Material): string => m.name || m.type;

const uniformNodes = new WeakMap<THREE.IUniform, N>();
/** 共享 IUniform → uniform 节点（每次渲染读取 IUniform.value）。 */
export function shared(u: THREE.IUniform, type?: string): N {
  let node = uniformNodes.get(u);
  if (node === undefined) {
    node = uniform(u.value, type).onRenderUpdate(() => u.value) as unknown as N;
    uniformNodes.set(u, node);
  }
  return node;
}

// uniformArray 引用同一个 Vector4 数组，每次渲染按元素上传。
const arrayNodes = new WeakMap<THREE.IUniform, ReturnType<typeof uniformArray>>();
export function sharedVec4Array(u: THREE.IUniform<THREE.Vector4[]>): ReturnType<typeof uniformArray> {
  let node = arrayNodes.get(u);
  if (node === undefined) arrayNodes.set(u, (node = uniformArray(u.value, 'vec4')));
  return node;
}

const textureUniforms = new WeakMap<THREE.IUniform, ReturnType<typeof texture>>();
/**
 * 共享纹理 uniform → 纹理节点：取值始终跟随 IUniform.value（sample() 的复制件经 referenceNode 读这里），
 * 运行时换纹理（如降水列数据）由 three 按绑定值变化重新绑定，WebGL 侧写 uniform 的代码不用改。
 */
export function sharedTexture(u: THREE.IUniform<THREE.Texture>): ReturnType<typeof texture> {
  let node = textureUniforms.get(u);
  if (node === undefined) {
    node = texture(u.value);
    Object.defineProperty(node, 'value', {
      get: () => u.value,
      set: (value: THREE.Texture) => {
        u.value = value;
      },
    });
    textureUniforms.set(u, node);
  }
  return node;
}

// ---- 实例/批次变换之前的顶点变形 ----

/** 同 three BatchNode：批次的间接下标（gl_DrawID → getIndirectIndex），取批次矩阵、批次色等逐实例数据用。 */
export function batchIndirectId(builder: NodeBuilder, mesh: THREE.BatchedMesh): N {
  const { _indirectTexture: indirect } = mesh as unknown as { _indirectTexture: THREE.DataTexture };
  const id = int((builder as unknown as { getDrawIndex(): string | null }).getDrawIndex() === null ? instanceIndex : drawIndex);
  const isize = int(textureSize(textureLoad(indirect), int(0)).x);
  return textureLoad(indirect, ivec2(id.mod(isize), id.div(isize))).x as unknown as N;
}

/** 同 three BatchNode.setup 的批次矩阵（BatchNode 不对外暴露它）。 */
function batchingMatrix(builder: NodeBuilder, mesh: THREE.BatchedMesh): N {
  const { _matricesTexture: matrices } = mesh as unknown as { _matricesTexture: THREE.DataTexture };
  const size = int(textureSize(textureLoad(matrices), int(0)).x);
  const j = float(batchIndirectId(builder, mesh)).mul(4).toInt().toVar();
  const x = j.mod(size);
  const y = j.div(size);
  const col = (k: number) => textureLoad(matrices, ivec2(x.add(k), y));
  // @types/three 只声明了 mat4 的 1 / 16 参数重载，四列构造同 BatchNode。
  return (mat4 as unknown as (...columns: unknown[]) => N)(col(0), col(1), col(2), col(3));
}

/**
 * 取得实例/批次矩阵 M（普通网格为 null）；apply() 把实例/批次变换正式入栈。
 * 实例矩阵节点在 InstanceNode.setup 里才创建：先在丢弃的栈里跑一次拿到它（第二次 setup 复用已建节点，只做一次实例变换，并保留矩阵版本同步）。
 */
export function preInstance(builder: NodeBuilder): { readonly M: N | null; apply(): void } {
  const object = builder.object as THREE.InstancedMesh | THREE.BatchedMesh;
  if ((object as THREE.InstancedMesh).isInstancedMesh) {
    const inst = instancedMesh(object as THREE.InstancedMesh);
    const stacks = builder as unknown as { addStack(): void; removeStack(): void };
    stacks.addStack();
    inst.setup(builder);
    stacks.removeStack();
    return { M: inst.instanceMatrixNode as N, apply: () => inst.toStack() };
  }
  if ((object as THREE.BatchedMesh).isBatchedMesh) return { M: batchingMatrix(builder, object as THREE.BatchedMesh), apply: () => batch(object as THREE.BatchedMesh).toStack() };
  return { M: null, apply() {} };
}

export type Deform = (M: N | null, builder: NodeBuilder) => void;
/**
 * 在实例/批次变换之前改写 positionLocal（同 GLSL begin_vertex 后改 transformed）；同一材质的多个变形按登记顺序执行。
 * 只用于不蒙皮、无变形目标的网格（这里替换了整个 setupPosition），蒙皮/变形目标网格直接抛错。
 */
const deformLists = new WeakMap<NodeMaterial, Deform[]>();
export function deformBeforeInstance(material: NodeMaterial, deform: Deform): void {
  const existing = deformLists.get(material);
  if (existing) {
    existing.push(deform);
    return;
  }
  const list = [deform];
  deformLists.set(material, list);
  material.setupPosition = function (builder: NodeBuilder): Node {
    const object = builder.object as THREE.Mesh;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh || Object.keys(builder.geometry.morphAttributes).length > 0) {
      throw new Error(`webgpu-node-utils: 实例前变形不支持蒙皮/变形目标网格 '${object.name}'（材质 '${materialLabel(this)}'）`);
    }
    const { M, apply } = preInstance(builder);
    for (const d of list) d(M, builder);
    apply();
    return positionLocal;
  };
}

/**
 * 蒙皮、变形目标与实例变换之后改写局部位置（positionNode；同 GLSL skinning_vertex 之后改 transformed），多个变形按登记顺序串联。
 * 普通网格（无蒙皮/实例）也用于 begin_vertex 处的变形：此时两者等价。
 */
export function deformAfterSkinning(material: NodeMaterial, deform: (p: N, builder: NodeBuilder) => N): void {
  const prev = material.positionNode as N | null;
  material.positionNode = Fn((builder: NodeBuilder) => deform(prev ?? (positionLocal as unknown as N), builder))();
}

/** GLSL ( modelMatrix * IM * vec4( p, 1.0 ) ).xyz（IM = instanceMatrix / batchingMatrix，普通网格省略）。 */
export const toWorld = (M: N | null, p: N): N => (M === null ? modelWorldMatrix : modelWorldMatrix.mul(M)).mul(vec4(p, 1)).xyz as unknown as N;

/** GLSL inverse( mat3( M ) ) * v（WGSL 没有 inverse：逆矩阵的行 = 列向量两两叉积 / 行列式）。 */
export function inverseLinear(M: N, v: N): N {
  const a = M.element(int(0)).xyz;
  const b = M.element(int(1)).xyz;
  const c = M.element(int(2)).xyz;
  const r0 = cross(b, c);
  return vec3(dot(r0, v), dot(cross(c, a), v), dot(cross(a, b), v)).div(dot(a, r0)) as unknown as N;
}

// ---- 片元 ----

/** 叠加一个 discard 条件（maskNode 为 false 即 discard；同 GLSL 在片元开头的 if ( … ) discard）。 */
export function addDiscard(material: NodeMaterial, discard: N): void {
  const keep = discard.not();
  material.maskNode = material.maskNode ? (material.maskNode as N).and(keep) : keep;
}

/** 同 GLSL #ifdef OPAQUE（opaque_fragment 把 alpha 写成 1）：不透明材质上改 diffuseColor.a 无效。 */
export const isOpaque = (m: THREE.Material): boolean => m.transparent === false && m.blending === THREE.NormalBlending && m.alphaToCoverage === false;

/**
 * 在受光计算之前改表面（diffuseColor、粗糙度）：包裹 setupVariants——此时 setupDiffuseColor（含颜色/透明度/alphaTest）已完成，
 * 标准材质随后才按金属度折算漫反射、读取 roughnessNode（同 GLSL color_fragment … emissivemap_fragment 处的修改）。
 */
export function beforeLighting(material: NodeMaterial, fn: (this: NodeMaterial, builder: NodeBuilder) => void): void {
  const prev = material.setupVariants;
  material.setupVariants = function (builder: NodeBuilder): void {
    fn.call(this, builder);
    prev.call(this, builder);
  };
}

/** GLSL roughnessFactor（roughness × roughnessMap，或前一补丁改写后的值）。 */
export function roughnessOf(m: NodeMaterial): N {
  const node = (m as NodeMaterial & { roughnessNode: Node | null }).roughnessNode;
  return (node ? float(node) : materialRoughness) as unknown as N;
}
/** 片元法线扰动的基准：前一补丁的 normalNode，或材质自带法线（含法线/凹凸贴图）；在 NORMAL 子构建里即 GLSL normal。 */
export const normalOf = (m: NodeMaterial): N => (m.normalNode ? vec3(m.normalNode) : materialNormal) as unknown as N;
/** 片元里的最终视空间法线（GLSL normal_fragment_maps 之后的 normal）。 */
export const fragmentNormal = normalView as unknown as N;

// ---- 共享风场（render/wind WIND_GLSL 同式）----

/** windSway( x, y, t )（worldY 未使用，同 GLSL）。 */
export function windSway(u: WindUniforms): (x: N, t: N) => N {
  const s = (name: WindUniformName): N => shared(u[name]);
  return (x, t) => {
    const ph = float(TAU).mul(t.sub(s('uWindSign').mul(x).div(s('uWindGustSpeed')))).div(s('uWindGustInterval'));
    const pulse = pow(max(float(0.5).add(cos(ph.add(s('uWindGustPhase'))).mul(0.5)), 0), s('uWindGustSharp'));
    const gust = pulse.mul(float(GUST_VARY.base).add(sin(ph.mul(GUST_VARY.freq).add(s('uWindGustPhase').mul(GUST_VARY.phaseMul))).mul(GUST_VARY.amp)));
    return s('uWindDir').mul(s('uWindBase').add(s('uWindGustAmp').mul(gust))).toVar();
  };
}
