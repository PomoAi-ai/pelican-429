/**
 * 近景模糊的 WebGL 实现（WebGPU 同式见 webgpu/webgpu-foreground-filter）：15 抽头可分离高斯（抽头间距 σ/3、权重 exp(−x²/2)），
 * 模糊在预乘透明度上进行；叠加时还原颜色、压暗、色调映射与输出色彩空间，再预乘叠到画布。
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { ForegroundFilter } from './backdrop.ts';

/** 抽头在 [−7, 7]，偏移 i/3 个 σ。 */
export const FOREGROUND_TAPS = 7;

const VERTEX = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tMap;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int i = -${FOREGROUND_TAPS}; i <= ${FOREGROUND_TAPS}; i++) {
      float x = float(i) / 3.0;
      float w = exp(-0.5 * x * x);
      sum += texture2D(tMap, vUv + uStep * x) * w;
      total += w;
    }
    gl_FragColor = sum / total;
  }`;
const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uShade;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tMap, vUv);
    if (c.a < 0.002) discard;
    gl_FragColor = vec4(c.rgb / c.a * uShade, c.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }`;

export function createForegroundFilter(renderer: THREE.WebGLRenderer): ForegroundFilter {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const scratch = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const blur = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector2() } }, vertexShader: VERTEX, fragmentShader: BLUR_FRAGMENT, depthTest: false, depthWrite: false });
  const composite = new THREE.ShaderMaterial({ uniforms: { tMap: { value: target.texture }, uShade: { value: 1 } }, vertexShader: VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
    transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(blur);
  return {
    target,
    setSize(width, height) {
      if (target.width === width && target.height === height) return;
      target.setSize(width, height);
      scratch.setSize(width, height);
    },
    apply(sigma, shade) {
      quad.material = blur;
      blur.uniforms.tMap!.value = target.texture;
      blur.uniforms.uStep!.value.set(sigma / target.width, 0);
      renderer.setRenderTarget(scratch);
      quad.render(renderer);
      blur.uniforms.tMap!.value = scratch.texture;
      blur.uniforms.uStep!.value.set(0, sigma / target.height);
      renderer.setRenderTarget(target);
      quad.render(renderer);
      quad.material = composite;
      composite.uniforms.uShade!.value = shade;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      quad.render(renderer);
      renderer.autoClear = autoClear;
    },
    dispose() {
      target.dispose();
      scratch.dispose();
      blur.dispose();
      composite.dispose();
      quad.dispose();
    },
  };
}
