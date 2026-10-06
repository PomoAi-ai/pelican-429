import * as THREE from 'three';
import type { Stage } from './stage.ts';

/**
 * 加载阶段预热：首次上屏时的着色器编译与贴图上传是游玩中长任务的主因，挪到加载层显示期间完成。
 * compile 会遍历全部对象（含隐藏的）编译材质，但只统计可见的灯光；点光源数量一变，场景内所有受光材质都要换程序。
 * 因此 lightGroups（隐藏、上屏时会带来灯光的分组）逐个临时显示再编一次，覆盖它们登场时的灯光组合。
 * compile 不覆盖阴影深度与后期通道的程序，且程序首次使用时同步取链接结果仍会卡住主线程；
 * 所以每次编译后再关掉视锥剔除真实渲染一帧，把这些都在加载层显示期间做完。
 * 须在世界光照补丁（worldLight.update）之后调用，否则补丁会改掉程序键，预热白做。
 */
export async function warmUpStage(stage: Stage, lightGroups: readonly THREE.Object3D[]): Promise<void> {
  const { renderer, scene } = stage;
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line || node instanceof THREE.Sprite)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) renderer.initTexture(value);
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) renderer.initTexture(uniform.value);
      }
    }
  });
  const culled: THREE.Object3D[] = [];
  scene.traverse((node) => { if (node.frustumCulled) { node.frustumCulled = false; culled.push(node); } });
  await compile(stage);
  stage.render();
  for (const group of lightGroups) {
    group.visible = true;
    await compile(stage);
    stage.render();
    group.visible = false;
  }
  for (const node of culled) node.frustumCulled = true;
}

/** 场景实际画进后期的 HDR 目标（线性输出、不做色调映射）；编译时绑定同一目标，程序键才与真实渲染一致。 */
function compile({ renderer, scene, camera, postFx }: Stage): Promise<unknown> {
  const target = renderer.getRenderTarget();
  renderer.setRenderTarget(postFx.sceneTarget);
  const ready = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(target);
  return ready;
}
