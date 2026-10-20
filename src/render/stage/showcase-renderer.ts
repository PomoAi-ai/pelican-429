import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** 把离屏渲染好的画面（已色调映射与 sRGB 编码）原样复制到画布的一块区域。 */
interface ShowcaseCompositor {
  /** rect 与 clip 是画布内的 CSS 像素坐标（左上为原点）；clip 外的部分不画。 */
  draw(texture: THREE.Texture, rect: DOMRectReadOnly, clip: DOMRectReadOnly): void;
  dispose(): void;
}

/** 多卡片页面共用的唯一合成器：各卡片先离屏渲染，再逐块复制到同一张画布。 */
export function createShowcaseCompositor(renderer: THREE.WebGLRenderer): ShowcaseCompositor {
  const material = new THREE.RawShaderMaterial({
    uniforms: { tImage: { value: null as THREE.Texture | null } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D tImage; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tImage,vUv); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const size = new THREE.Vector2();
  return {
    draw(texture, rect, clip) {
      renderer.getSize(size);
      const left = Math.max(rect.left, clip.left, 0);
      const right = Math.min(rect.right, clip.right, size.x);
      const top = Math.max(rect.top, clip.top, 0);
      const bottom = Math.min(rect.bottom, clip.bottom, size.y);
      if (right <= left || bottom <= top) return;
      renderer.setRenderTarget(null);
      renderer.setViewport(rect.left, size.y - rect.bottom, rect.width, rect.height);
      renderer.setScissor(left, size.y - bottom, right - left, bottom - top);
      renderer.setScissorTest(true);
      material.uniforms.tImage!.value = texture;
      quad.render(renderer);
      renderer.setScissorTest(false);
    },
    dispose() {
      quad.dispose();
      material.dispose();
    },
  };
}

interface ShowcaseRenderer extends ShowcaseCompositor {
  readonly renderer: THREE.WebGLRenderer;
  begin(): void;
}

/** 展示场画布铺满窗口；渲染器是页主渲染器，由页面释放，这里只摘下画布。 */
export function createShowcaseRenderer(parent: HTMLElement, renderer: THREE.WebGLRenderer): ShowcaseRenderer {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const canvas = renderer.domElement;
  canvas.className = 'showcase-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  parent.append(canvas);
  const compositor = createShowcaseCompositor(renderer);
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
    draw: compositor.draw,
    dispose() {
      compositor.dispose();
      canvas.remove();
    },
  };
}
