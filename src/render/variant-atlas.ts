/**
 * 变体图集（一类小植物一个 InstancedMesh = 1 draw call）：把多种形态的几何合并成一个几何，每顶点 aVar = 所属变体序号；
 * 每实例 aVariant（InstancedBufferAttribute）选中一种变体，顶点着色器在 project_vertex 之前把不匹配的顶点塌缩到实例原点
 * （退化三角形不光栅化）。材质挂接为链式 onBeforeCompile（保留原钩子，缓存键追加标签），与光照图/云影挂接互不覆盖。
 * 只用于小几何（每变体几十个三角形），塌缩顶点的顶点着色开销可忽略。
 */
import * as THREE from 'three';
import { concatGeometries } from './tree-builder.ts';

export const VARIANT_PROGRAM_TAG = 'variant-atlas-v1';
/** 合并要求的公共属性（FloraBuilder.build 的输出）。 */
const REQUIRED = ['position', 'normal', 'color', 'aTip', 'aPetal', 'aFly'] as const;

/** 合并变体几何（非索引）；变体 i 的顶点 aVar = i。属性缺失/尺寸不一致即抛。 */
export function mergeVariants(parts: readonly THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  if (parts.length === 0) throw new Error(`${label}: no variant geometries`);
  const arrays: Record<string, number[]> = {};
  const sizes: Record<string, number> = {};
  const aVar: number[] = [];
  parts.forEach((g, vi) => {
    if (g.index) throw new Error(`${label}: variant ${vi} must be non-indexed`);
    const n = g.getAttribute('position')?.count ?? 0;
    if (n === 0) throw new Error(`${label}: variant ${vi} is empty`);
    for (const name of REQUIRED) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a || a.count !== n) throw new Error(`${label}: variant ${vi} lacks attribute '${name}'`);
      if (sizes[name] === undefined) sizes[name] = a.itemSize;
      else if (sizes[name] !== a.itemSize) throw new Error(`${label}: variant ${vi} attribute '${name}' size ${a.itemSize} ≠ ${sizes[name]}`);
      const out = (arrays[name] ??= []);
      for (let i = 0; i < a.array.length; i++) out.push(a.array[i] as number);
    }
    for (let i = 0; i < n; i++) aVar.push(vi);
  });
  const merged = new THREE.BufferGeometry();
  for (const name of REQUIRED) merged.setAttribute(name, new THREE.Float32BufferAttribute(arrays[name] as number[], sizes[name] as number));
  merged.setAttribute('aVar', new THREE.Float32BufferAttribute(aVar, 1));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * 合并带索引的变体几何（树式几何：position/normal/uv/color/aSway，属性集须一致）；变体 i 的顶点 aVar = i。
 * 用于灌木层（与树同材质的叶团/叶卡几何）。空变体、无索引或属性集不一致即抛。
 */
export function mergeIndexedVariants(parts: readonly THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  if (parts.length === 0) throw new Error(`${label}: no variant geometries`);
  const aVar: number[] = [];
  parts.forEach((g, vi) => {
    const n = g.getAttribute('position')?.count ?? 0;
    if (n === 0) throw new Error(`${label}: variant ${vi} is empty`);
    if (!g.index) throw new Error(`${label}: variant ${vi} must be indexed`);
    for (let i = 0; i < n; i++) aVar.push(vi);
  });
  const merged = concatGeometries(parts, label);
  merged.setAttribute('aVar', new THREE.Float32BufferAttribute(aVar, 1));
  merged.computeBoundingSphere();
  return merged;
}

/** 变体 i 的顶点在合并几何里的 y 范围（测试/调参用）。 */
export function variantYRange(geometry: THREE.BufferGeometry, variant: number): readonly [number, number] {
  const pos = geometry.getAttribute('position');
  const v = geometry.getAttribute('aVar');
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (v.getX(i) !== variant) continue;
    lo = Math.min(lo, pos.getY(i));
    hi = Math.max(hi, pos.getY(i));
  }
  if (lo === Infinity) throw new Error(`variant-atlas: variant ${variant} has no vertices`);
  return [lo, hi];
}

const VERTEX_PARS = 'attribute float aVar;\nattribute float aVariant;';
const VERTEX = ['#ifdef USE_INSTANCING', '  if ( abs( aVar - aVariant ) > 0.5 ) transformed = vec3( 0.0 );', '#endif'].join('\n');

/** 给材质挂接变体塌缩（幂等）；返回同一材质。 */
export function addVariantCollapse<M extends THREE.Material>(material: M, label: string): M {
  if (material.userData.variantAtlas === true) return material;
  const prev = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    for (const chunk of ['#include <common>', '#include <project_vertex>']) {
      if (!shader.vertexShader.includes(chunk)) throw new Error(`${label}: vertex shader lacks '${chunk}' (three changed?)`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <project_vertex>', `${VERTEX}\n#include <project_vertex>`);
  };
  material.customProgramCacheKey = () => `${baseKey}|${VARIANT_PROGRAM_TAG}`;
  material.userData.variantAtlas = true;
  return material;
}

/** 图集几何的实例化拷贝（clone，与 tile-view 区块几何同策略：释放拷贝不影响其他区块）+ 私有 aVariant；调用方在网格释放时 dispose 它。 */
export function variantInstanceGeometry(atlas: THREE.BufferGeometry, variants: readonly number[]): THREE.BufferGeometry {
  for (const v of variants) if (!(Number.isInteger(v) && v >= 0)) throw new Error(`variant-atlas: invalid variant index ${v}`);
  const g = atlas.clone();
  g.setAttribute('aVariant', new THREE.InstancedBufferAttribute(Float32Array.from(variants), 1));
  return g;
}
