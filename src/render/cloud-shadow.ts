/**
 * 云影：给地表/植被/树/渔屋/水面等光照类网格材质链式注入 cloudShade(世界 x)（render/wind 的 CLOUD_GLSL，共享 uniform），
 * 在 opaque_fragment 之前把 outgoingLight 乘以 [1 − strength, 1] 的暗斑系数 —— 云影随云层漂移量 uCloudDrift 缓慢移动。
 * 与 light-texture 的光照图挂接方式相同（保存原 onBeforeCompile 先调用、缓存键追加标签），两者互不覆盖、顺序无关。
 * 不挂接：userData.noCloudShadow 为真的材质、ShaderMaterial 等非网格光照材质。
 */
import type * as THREE from 'three';
import { CLOUD_GLSL, sharedWindUniforms } from './wind.ts';

export const CLOUD_SHADOW_PROGRAM_TAG = 'cloudshadow-v1';

const VERTEX_PARS = 'varying vec3 vCsWorld;';
const VERTEX = [
  '{',
  '  vec4 csWorld = vec4( transformed, 1.0 );',
  '  #ifdef USE_BATCHING',
  '    csWorld = batchingMatrix * csWorld;',
  '  #endif',
  '  #ifdef USE_INSTANCING',
  '    csWorld = instanceMatrix * csWorld;',
  '  #endif',
  '  vCsWorld = ( modelMatrix * csWorld ).xyz;',
  '}',
].join('\n');
const FRAGMENT_APPLY = 'outgoingLight *= cloudShade( vCsWorld.x );';

type LitMaterial = THREE.Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean };

/** 是否挂接云影：受光网格材质（标准/Lambert/Phong/Toon），且未标记 userData.noCloudShadow。 */
export function isCloudShadowable(material: THREE.Material): boolean {
  if (material.userData?.noCloudShadow === true) return false;
  const m = material as LitMaterial;
  return Boolean(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
}

function requireChunk(src: string, chunk: string, stage: string, name: string): void {
  if (!src.includes(chunk)) throw new Error(`cloud-shadow: ${stage} shader of material '${name}' lacks '${chunk}' (three changed or another injection removed it)`);
}

export interface CloudShadowPatcher {
  /** 已挂接的材质数。 */
  readonly patched: number;
  /** 挂接单个材质（幂等）；不可挂接返回 false。 */
  patch(material: THREE.Material): boolean;
  /** 遍历子树挂接全部网格材质。 */
  patchTree(root: THREE.Object3D): void;
}

export function createCloudShadowPatcher(): CloudShadowPatcher {
  const uniforms = sharedWindUniforms();
  const done = new WeakSet<THREE.Material>();
  let patched = 0;
  const patch = (material: THREE.Material): boolean => {
    if (done.has(material)) return true;
    if (!isCloudShadowable(material)) return false;
    const prev = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey();
    const name = material.name || material.type;
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      requireChunk(shader.vertexShader, '#include <common>', 'vertex', name);
      requireChunk(shader.vertexShader, '#include <project_vertex>', 'vertex', name);
      requireChunk(shader.fragmentShader, '#include <common>', 'fragment', name);
      requireChunk(shader.fragmentShader, '#include <opaque_fragment>', 'fragment', name);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}\n${CLOUD_GLSL}`)
        .replace('#include <opaque_fragment>', `${FRAGMENT_APPLY}\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => `${baseKey}|${CLOUD_SHADOW_PROGRAM_TAG}`;
    material.needsUpdate = true;
    done.add(material);
    patched++;
    return true;
  };
  return {
    get patched() {
      return patched;
    },
    patch,
    patchTree(root) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = mesh.material;
        if (Array.isArray(mats)) for (const m of mats) patch(m);
        else if (mats) patch(mats);
      });
    },
  };
}
