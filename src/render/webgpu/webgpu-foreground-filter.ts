/**
 * 近景模糊的 WebGPU 实现（TSL，与 backdrop/foreground-filter 的 GLSL 同式）：15 抽头可分离高斯，预乘透明度上模糊；
 * 叠加时还原颜色、压暗、色调映射与输出色彩空间，再预乘叠到画布。直接画到画布时与 three 后期一样临时关掉渲染器的输出变换
 * （否则会改走中间帧缓冲，覆盖掉已输出的画面），变换由节点自己做。
 */
import * as THREE from 'three';
import { NodeMaterial, QuadMesh } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { float, max, renderOutput, texture, uniform, uv, vec4 } from 'three/tsl';
import type { ForegroundFilter } from '../backdrop/backdrop.ts';
import { FOREGROUND_TAPS } from '../backdrop/foreground-filter.ts';

// TSL 节点的静态类型很宽，这里统一按“任意节点”处理（同 webgpu-post-fx）。
type N = ReturnType<typeof float>;

export function createWebGpuForegroundFilter(renderer: WebGPURenderer): ForegroundFilter {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const scratch = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const pass = (source: THREE.Texture, step: N): NodeMaterial => {
    let sum = vec4(0) as unknown as N;
    let total = 0;
    for (let i = -FOREGROUND_TAPS; i <= FOREGROUND_TAPS; i++) {
      const x = i / 3;
      const w = Math.exp(-.5 * x * x);
      total += w;
      sum = sum.add((texture(source, uv().add(step.mul(x))) as unknown as N).mul(w));
    }
    const material = new NodeMaterial();
    material.fragmentNode = sum.div(total);
    material.depthTest = false;
    material.depthWrite = false;
    return material;
  };
  const horizontalStep = uniform(new THREE.Vector2()) as unknown as N;
  const verticalStep = uniform(new THREE.Vector2()) as unknown as N;
  const horizontal = pass(target.texture, horizontalStep);
  const vertical = pass(scratch.texture, verticalStep);
  const shade = uniform(1);
  const c = texture(target.texture, uv()) as unknown as N;
  const color = renderOutput(vec4(c.rgb.div(max(c.a, 1e-4)).mul(shade), 1), renderer.toneMapping, renderer.outputColorSpace) as unknown as N;
  const composite = new NodeMaterial();
  composite.fragmentNode = vec4(color.rgb.mul(c.a), c.a);
  Object.assign(composite, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false });
  const quad = new QuadMesh();
  return {
    target,
    setSize(width, height) {
      if (target.width === width && target.height === height) return;
      target.setSize(width, height);
      scratch.setSize(width, height);
    },
    apply(sigma, value) {
      (horizontalStep as unknown as { value: THREE.Vector2 }).value.set(sigma / target.width, 0);
      (verticalStep as unknown as { value: THREE.Vector2 }).value.set(0, sigma / target.height);
      shade.value = value;
      quad.material = horizontal;
      renderer.setRenderTarget(scratch);
      quad.render(renderer);
      quad.material = vertical;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      const { toneMapping, outputColorSpace, autoClear } = renderer;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      quad.material = composite;
      quad.render(renderer);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = outputColorSpace;
      renderer.autoClear = autoClear;
    },
    dispose() {
      target.dispose();
      scratch.dispose();
      horizontal.dispose();
      vertical.dispose();
      composite.dispose();
    },
  };
}
