import * as THREE from 'three';
import { addNodePatch } from '../stage/node-patches.ts';
import type { ReflectionStage } from './residence-three-water.ts';

const CITY_SHADOW_LAYER = 28;

/**
 * 主舞台阴影只覆盖横版可玩层；河城使用同一太阳方向、按街区缓存自己的深度图。
 * 环境 update 里离屏渲染深度（WebGL 与 WebGPU 同一份 CPU 代码），frame 是河城所在的环境根。
 */
export function createResidenceFourShadows(roots: readonly THREE.Object3D[], frame: THREE.Object3D) {
  const size = 2048;
  const target = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: true, depthTexture: new THREE.DepthTexture(size, size),
  });
  target.depthTexture!.name = 'river-city-sun-depth';
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false });
  const camera = new THREE.OrthographicCamera(-730, 730, 730, -730, 300, 2700);
  camera.layers.set(CITY_SHADOW_LAYER);
  const matrix = { value: new THREE.Matrix4() }, texture = { value: target.depthTexture };
  const direction = new THREE.Vector3(), previousDirection = new THREE.Vector3();
  const focus = new THREE.Vector3(), origin = new THREE.Vector3();
  const meshes: THREE.Mesh[] = [], materials = new Set<THREE.MeshStandardMaterial>();
  let lastX = Infinity;
  for (const root of roots) root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    const roles = (Array.isArray(object.material) ? object.material : [object.material])
      .map(material => material.userData.riverSurface);
    if (!roles.every(role => role === 'light' || role === 'window')) object.layers.enable(CITY_SHADOW_LAYER);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  });
  for (const material of materials) {
    const before = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      shader.uniforms.riverSunMatrix = matrix;
      shader.uniforms.riverSunDepth = texture;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 riverSunMatrix;\nvarying vec4 riverSunCoord;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 riverSunPoint = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            riverSunPoint = instanceMatrix * riverSunPoint;
          #endif
          riverSunCoord = riverSunMatrix * modelMatrix * riverSunPoint;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D riverSunDepth;
          varying vec4 riverSunCoord;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          vec3 riverSunUV = riverSunCoord.xyz / riverSunCoord.w;
          vec3 riverDx = dFdx(riverSunUV), riverDy = dFdy(riverSunUV);
          float riverArea = abs(riverDx.x * riverDy.y - riverDx.y * riverDy.x);
          float riverSlope = (abs(riverDy.y * riverDx.z - riverDx.y * riverDy.z)
            + abs(riverDx.x * riverDy.z - riverDy.x * riverDx.z)) / max(riverArea, 1e-9);
          // PCF 的邻近采样必须容纳同一斜面的深度差，避免草地出现条纹自阴影。
          float riverBias = .00008 + min(.003, riverSlope * 1.5 / ${size.toFixed(1)});
          if (riverSunUV.x > .002 && riverSunUV.x < .998 && riverSunUV.y > .002
            && riverSunUV.y < .998 && riverSunUV.z > 0.0 && riverSunUV.z < 1.0) {
            float riverVisibility = 0.0;
            for (int sx = -1; sx <= 1; sx++) for (int sy = -1; sy <= 1; sy++) {
              float riverDepth = texture2D(riverSunDepth,
                riverSunUV.xy + vec2(float(sx), float(sy)) / ${size.toFixed(1)}).x;
              riverVisibility += step(riverSunUV.z - riverBias, riverDepth) / 9.0;
            }
            reflectedLight.directDiffuse *= mix(.18, 1.0, riverVisibility);
            reflectedLight.directSpecular *= mix(.18, 1.0, riverVisibility);
          }`);
    };
    material.customProgramCacheKey = () => key + '-river-sun-shadow';
    addNodePatch(material, { kind: 'river-sun-shadow', matrix, depth: target.depthTexture!, size });
    material.needsUpdate = true;
  }
  return {
    /** viewX 是相机在 frame 里的横坐标；太阳方向不变且相机未跨过 24 格时沿用上次的深度图。 */
    update({ renderer, scene, keyLight }: ReflectionStage, viewX: number) {
      direction.copy(keyLight.position).sub(keyLight.target.position).normalize();
      const centerX = Math.round(viewX / 24) * 24;
      if (lastX === centerX && direction.distanceToSquared(previousDirection) < .000016) return;
      frame.updateWorldMatrix(true, false);
      frame.localToWorld(focus.set(centerX, 35, -560));
      camera.position.copy(focus).addScaledVector(direction, 1500);
      camera.lookAt(focus);
      // 渲染器发现相机坐标系不符会重算投影，冲掉下面的纹素对齐。
      camera.coordinateSystem = renderer.coordinateSystem;
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      origin.set(0, 0, 0).project(camera).multiplyScalar(size / 2);
      camera.projectionMatrix.elements[12]! += (Math.round(origin.x) - origin.x) * 2 / size;
      camera.projectionMatrix.elements[13]! += (Math.round(origin.y) - origin.y) * 2 / size;
      // 裁剪空间 z：WebGL 为 [-1, 1]，需映射到深度图的 [0, 1]；WebGPU 本身就是 [0, 1]。
      const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
      matrix.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, webgpu ? 1 : .5, webgpu ? 0 : .5, 0, 0, 0, 1)
        .multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      const background = scene.background, shadowUpdate = keyLight.shadow.autoUpdate;
      const previous = renderer.getRenderTarget();
      keyLight.shadow.autoUpdate = false;
      scene.background = null; scene.overrideMaterial = depth;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null; scene.background = background;
      // 联合类型的方法参数取两者交集；previous 取自同一渲染器，类型必然匹配。
      renderer.setRenderTarget(previous as THREE.WebGLRenderTarget | null);
      keyLight.shadow.autoUpdate = shadowUpdate;
      lastX = centerX; previousDirection.copy(direction);
    },
    dispose() {
      for (const mesh of meshes) mesh.layers.disable(CITY_SHADOW_LAYER);
      target.depthTexture!.dispose(); target.dispose(); depth.dispose();
    },
  };
}
