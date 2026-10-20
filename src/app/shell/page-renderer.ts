import type * as THREE from 'three';
import type { Tuning } from '../../config/tuning.ts';
import { bindCharacterTextures } from '../../render/character/character-model.ts';
import { createRenderer, type RendererPreset } from '../../render/stage/stage.ts';
import { readPageParams, type PageContext } from './page-context.ts';

const mains = new WeakMap<AbortSignal, { readonly renderer: THREE.WebGLRenderer; readonly preset: RendererPreset; readonly tuning: Tuning }>();

/**
 * 页主渲染器：同一页面（按 signal 识别）首次调用时按预设与调参创建并绑定角色贴图，页面释放时解绑、销毁。
 * 一页只有一份配置，再次取用时预设或调参不同就报错，避免某个模块悄悄改掉主画面的设置。
 * 不放进 page-context：那里随首页主包加载，不能带上 three。
 */
export function pageRenderer(page: Pick<PageContext, 'signal' | 'onDispose'>, preset: RendererPreset, tuning: Tuning): THREE.WebGLRenderer {
  const main = mains.get(page.signal);
  if (main) {
    if (main.preset !== preset || main.tuning !== tuning) throw new Error(`本页主渲染器已按预设 ${main.preset} 创建，不能再按 ${preset} 或另一份调参取用`);
    return main.renderer;
  }
  const renderer = createRenderer(preset, tuning, readPageParams().debug);
  const unbind = bindCharacterTextures(renderer);
  page.onDispose(() => { unbind(); renderer.dispose(); });
  mains.set(page.signal, { renderer, preset, tuning });
  return renderer;
}
