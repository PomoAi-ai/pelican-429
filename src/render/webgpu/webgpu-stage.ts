/**
 * WebGPU 舞台（?renderer=webgpu，游戏页按需动态加载，不进 WebGL 首包）：WebGPURenderer + 与 WebGL 相同的场景、灯光、阴影拟合与远景。
 * 后期由 webgpu-post-fx（TSL）实现，抗锯齿在后期链里（SMAA 或场景 pass 多重采样），画布本身不多重采样；
 * 开启时间戳查询（trackTimestamp），GPU 计时与动态分辨率见 render/stage/gpu-timer。登记了节点补丁的 onBeforeCompile 补丁由 webgpu-materials 翻译成节点，
 * 未登记的补丁、没有节点版本的 ShaderMaterial 在 WebGPU 下不生效，由 reportMaterialInventory 列出剩余项。
 */
import * as THREE from 'three';
import { PMREMGenerator, WebGPURenderer } from 'three/webgpu';
import type { Tuning } from '../../config/tuning.ts';
import { bindCharacterTextures } from '../character/character-model.ts';
import { attachStage, createRenderer } from '../stage/stage.ts';
import type { EnvironmentGenerator, Stage, StageBackend, StageOptions, StageRenderer } from '../stage/stage.ts';
import { nodePatches } from '../stage/node-patches.ts';
import { installNodePatches } from './webgpu-materials.ts';
import { hasShaderNodes, installShaderMaterials } from './webgpu-shader-materials.ts';
import { createWebGpuPostFx } from './webgpu-post-fx.ts';
import { createWebGpuForegroundFilter } from './webgpu-foreground-filter.ts';

const BACKEND: StageBackend<WebGPURenderer> = {
  // three 的 WebGPU PMREMGenerator 实现了 fromEquirectangular，类型声明缺这一项。
  pmrem: (renderer) => new PMREMGenerator(renderer) as PMREMGenerator & Pick<EnvironmentGenerator, 'fromEquirectangular'>,
  postFx: createWebGpuPostFx,
  foregroundFilter: createWebGpuForegroundFilter,
};

/** WebGPU 舞台就是游戏页的主渲染器，由它绑定角色贴图，释放时解绑。 */
export async function createWebGpuStage(container: HTMLElement, tuning: Tuning, options: StageOptions, debug: boolean): Promise<Stage<WebGPURenderer>> {
  if (!('gpu' in navigator)) throw new Error('当前浏览器不支持 WebGPU（renderer=webgpu）；去掉该参数使用 WebGL');
  // 适配器不支持 timestamp-query 时 three 在 init 里自动关闭 trackTimestamp，gpu-timer 据此报告不支持。
  // 画布不透明（同 WebGL 舞台）：调色输出的 alpha 带着场景通道的值，透明画布会把 alpha < 1 的像素透出页面底色。
  const renderer = createRenderer('game', tuning, debug, parameters => new WebGPURenderer({ ...parameters, trackTimestamp: true }));
  await renderer.init();
  // 拿不到适配器时 WebGPURenderer 会静默改用 WebGL2 后端，对比就失去意义。
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
    renderer.dispose();
    throw new Error('WebGPU 适配器不可用（渲染器退回了 WebGL2 后端）；去掉 renderer=webgpu 使用 WebGL');
  }
  installNodePatches(renderer);
  installShaderMaterials(renderer);
  const unbind = bindCharacterTextures(renderer);
  const stage = attachStage(container, renderer, tuning, options, BACKEND);
  const detach = stage.dispose;
  stage.dispose = () => {
    detach();
    unbind();
    renderer.dispose();
  };
  return stage;
}

interface MaterialInventoryRow {
  readonly type: string;
  readonly name: string;
  /**
   * 剩余项：INCOMPATIBLE = 没有对应的节点材质（未登记节点版本的 ShaderMaterial 等）；
   * UNREGISTERED = 带 onBeforeCompile 却没有登记任何节点补丁。
   */
  readonly patch: string;
  readonly meshes: number;
}

const INCOMPATIBLE = '不兼容材质';
const UNREGISTERED = '未登记补丁';

/**
 * 列出场景里 WebGPU 渲染不正确的“材质 × 剩余项”（按类型 + 名称 + 剩余项合并），并按剩余项汇总，输出到控制台并挂到 window.__pelicanWebGpuInventory。
 * 网格的 customDepthMaterial / customDistanceMaterial 一并检查：其补丁由 webgpu-materials 在阴影通道执行（只有平行光投影，distance 材质不参与）。
 */
export function reportMaterialInventory({ renderer, scene }: Stage<StageRenderer>): readonly MaterialInventoryRow[] {
  if (!('isWebGPURenderer' in renderer)) throw new Error('webgpu-stage: 材质清单只针对 WebGPU 舞台');
  const rows = new Map<string, { type: string; name: string; patch: string; meshes: number }>();
  const add = (m: THREE.Material, patch: string): void => {
    const key = `${m.type}|${m.name}|${patch}`;
    const row = rows.get(key) ?? { type: m.type, name: m.name, patch, meshes: 0 };
    row.meshes++;
    rows.set(key, row);
  };
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.material === undefined) return;
    const patches = (m: THREE.Material): void => {
      if (nodePatches(m).length === 0 && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) add(m, UNREGISTERED);
    };
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(m as { isNodeMaterial?: boolean }).isNodeMaterial && renderer.library.getMaterialNodeClass(m.type) === null && !hasShaderNodes(m)) add(m, INCOMPATIBLE);
      patches(m);
    }
    // 阴影材质本身不参与 WebGPU 渲染（不算不兼容），只列它们的补丁。
    if (mesh.customDepthMaterial) patches(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) patches(mesh.customDistanceMaterial);
  });
  const list = [...rows.values()].sort((a, b) => a.patch.localeCompare(b.patch) || b.meshes - a.meshes);
  const byPatch = new Map<string, { patch: string; materials: number; meshes: number }>();
  for (const r of list) {
    const sum = byPatch.get(r.patch) ?? { patch: r.patch, materials: 0, meshes: 0 };
    sum.materials++;
    sum.meshes += r.meshes;
    byPatch.set(r.patch, sum);
  }
  console.info(`[webgpu] 剩余 ${byPatch.size} 项、${list.length} 组材质`);
  console.table([...byPatch.values()].sort((a, b) => b.meshes - a.meshes));
  console.table(list);
  Object.assign(window, { __pelicanWebGpuInventory: list });
  return list;
}
