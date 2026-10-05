import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TUNING } from '../config/tuning.ts';
import { createStageRenderer } from './stage.ts';

export interface ShowcaseRenderer {
  readonly renderer: THREE.WebGLRenderer;
  begin(): void;
  draw(texture: THREE.Texture, rect: DOMRect, clip: DOMRect): void;
  dispose(): void;
}

/** 各卡片先离屏渲染，最终统一复制到同一张页面画布。 */
export function createShowcaseRenderer(parent: HTMLElement): ShowcaseRenderer {
  const renderer = createStageRenderer(TUNING);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const canvas = renderer.domElement;
  canvas.className = 'showcase-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  parent.append(canvas);
  const material = new THREE.RawShaderMaterial({
    uniforms: { tImage: { value: null as THREE.Texture | null } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D tImage; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tImage,vUv); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  let width = 0;
  let height = 0;
  return {
    renderer,
    begin() {
      if (width !== window.innerWidth || height !== window.innerHeight) {
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setSize(width, height);
      }
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setClearColor('#10191e', 1);
      renderer.clear();
    },
    draw(texture, rect, clip) {
      const left = Math.max(rect.left, clip.left, 0);
      const right = Math.min(rect.right, clip.right, width);
      const top = Math.max(rect.top, clip.top, 0);
      const bottom = Math.min(rect.bottom, clip.bottom, height);
      if (right <= left || bottom <= top) return;
      renderer.setRenderTarget(null);
      renderer.setViewport(rect.left, height - rect.bottom, rect.width, rect.height);
      renderer.setScissor(left, height - bottom, right - left, bottom - top);
      renderer.setScissorTest(true);
      material.uniforms.tImage!.value = texture;
      quad.render(renderer);
      renderer.setScissorTest(false);
    },
    dispose() {
      quad.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
