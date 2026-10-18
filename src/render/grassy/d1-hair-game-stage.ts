import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TUNING } from '../../config/tuning.ts';
import { CHARACTER_STAGE_LOOK, characterStageSunDirection, characterStageFraming } from '../../config/character-stage-look.ts';
import { createStageView } from '../stage.ts';
import { compileForStage } from '../warm-up.ts';

/** 各发型顺序共用正式游戏灯光与后期，避免每张卡片占一套渲染目标。 */
export function createD1HairGameStage(renderer: THREE.WebGLRenderer) {
  const stage = createStageView(renderer, TUNING, CHARACTER_STAGE_LOOK.stage);
  stage.camera.near = .05;
  stage.camera.far = 1000;
  stage.scene.background = new THREE.Color(CHARACTER_STAGE_LOOK.surfaceBackground);
  const material = new THREE.RawShaderMaterial({
    uniforms: { tImage: { value: null as THREE.Texture | null } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D tImage; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tImage,vUv); }',
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const size = new THREE.Vector2();
  const rotation = new THREE.Quaternion();
  const originalPosition = new THREE.Vector3();
  const originalRotation = new THREE.Quaternion();
  let width = 0;
  let height = 0;
  let pixelRatio = 0;

  return {
    compile(root: THREE.Object3D): Promise<unknown> { return compileForStage(stage, root); },
    render(root: THREE.Object3D, reference: THREE.OrthographicCamera, target: THREE.Vector3, rect: DOMRect, clip: DOMRect): void {
      renderer.getSize(size);
      const left = Math.max(rect.left, clip.left, 0);
      const right = Math.min(rect.right, clip.right, size.x);
      const top = Math.max(rect.top, clip.top, 0);
      const bottom = Math.min(rect.bottom, clip.bottom, size.y);
      if (right <= left || bottom <= top) return;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const ratio = renderer.getPixelRatio();
      if (w !== width || h !== height || ratio !== pixelRatio) {
        width = w;
        height = h;
        pixelRatio = ratio;
        stage.setSize(w, h);
      }
      const viewHeight = (reference.top - reference.bottom) / reference.zoom;
      // 保留展示场的全身视距，只裁出头部；推近镜头会改变动漫着色器的视线高光。
      const nativeAspect = size.x / size.y;
      // 单个 D1 的正式展示场布局最小宽高均为 5，与原页面保持相同视距。
      const { centerY, viewHeight: nativeHeight } = characterStageFraming(5, 5, nativeAspect);
      const distance = nativeHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
      const fullHeight = h * nativeHeight / viewHeight;
      const fullWidth = fullHeight * nativeAspect;
      stage.camera.position.set(0, centerY, distance);
      stage.camera.quaternion.identity();
      stage.camera.setViewOffset(fullWidth, fullHeight,
        (fullWidth - w) / 2, (fullHeight - h) / 2 - (target.y - centerY) * fullHeight / nativeHeight, w, h);
      stage.camera.updateMatrixWorld();
      stage.setSunDirection(characterStageSunDirection(stage.camera.fov, size.x / size.y, CHARACTER_STAGE_LOOK.sunPosition));

      const parent = root.parent;
      const exposure = renderer.toneMappingExposure;
      originalPosition.copy(root.position);
      originalRotation.copy(root.quaternion);
      // 游戏中相机固定、人物转动，保证同一侧面相对太阳和轮廓光的方向一致。
      rotation.copy(reference.quaternion).invert();
      root.position.sub(target).applyQuaternion(rotation).add(target);
      root.quaternion.premultiply(rotation);
      stage.scene.add(root);
      try {
        renderer.toneMappingExposure = TUNING.render.exposure;
        renderer.setScissorTest(false);
        // 一张阴影贴图在卡片间重用，每换角色都必须重新绘制。
        stage.keyLight.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        material.uniforms.tImage!.value = stage.renderTexture();
        renderer.setRenderTarget(null);
        renderer.setViewport(rect.left, size.y - rect.bottom, rect.width, rect.height);
        renderer.setScissor(left, size.y - bottom, right - left, bottom - top);
        renderer.setScissorTest(true);
        // renderTexture 已完成色调映射与 sRGB 编码，只复制最终像素。
        quad.render(renderer);
      } finally {
        root.position.copy(originalPosition);
        root.quaternion.copy(originalRotation);
        if (parent) parent.add(root);
        else root.removeFromParent();
        renderer.toneMappingExposure = exposure;
        renderer.setRenderTarget(null);
        renderer.setScissorTest(false);
      }
    },
    dispose(): void {
      quad.dispose();
      material.dispose();
      stage.dispose();
    },
  };
}
