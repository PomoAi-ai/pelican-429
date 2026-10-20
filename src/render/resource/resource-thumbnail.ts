import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AI_CITY_LOOK, AI_CITY_SUN } from '../../config/ai-city-look.ts';
import { getResidenceResource } from '../../config/residence.ts';
import { TUNING } from '../../config/tuning.ts';
import { createBuildingPreview } from '../building/building-layer-view.ts';
import { createRenderer, WEBGL_STAGE_BACKEND } from '../stage/stage.ts';

/**
 * 用游戏资源生成静态预览；不保留动画循环或另一份模型。次级渲染器不绑定角色贴图；
 * 只画已在主画面编译过的建筑着色器，不开着色器错误检查。
 */
export function createResourceThumbnailRenderer(width = 160) {
  const renderer = createRenderer('thumbnail', TUNING, false);
  renderer.setSize(width, width * 3 / 4);
  renderer.toneMappingExposure = AI_CITY_LOOK.atmosphere.exposure;
  const scene = new THREE.Scene();
  const room = new RoomEnvironment();
  const pmrem = WEBGL_STAGE_BACKEND.pmrem(renderer);
  const environment = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = AI_CITY_LOOK.environmentIntensity;
  scene.add(new THREE.HemisphereLight(AI_CITY_LOOK.hemiSky, AI_CITY_LOOK.hemiGround, AI_CITY_LOOK.hemiIntensity));
  const sun = new THREE.DirectionalLight(AI_CITY_LOOK.keyColor, AI_CITY_LOOK.keyIntensity);
  sun.position.set(AI_CITY_SUN.x, AI_CITY_SUN.y, AI_CITY_SUN.z);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, .01, 100);
  const surfaceCamera = new THREE.OrthographicCamera(-.42, .42, .315, -.315, .01, 100);
  let previousView: ReturnType<typeof createBuildingPreview> | undefined;
  const render = (resourceId: string, surface: boolean): string => {
    const view = createBuildingPreview(resourceId, 'normal');
    scene.add(view.root);
    try {
      view.update(0);
      const box = new THREE.Box3().setFromObject(view.root);
      const resource = getResidenceResource(resourceId);
      if (!surface && resource.kind === 'solid') box.union(new THREE.Box3(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 1, 1)));
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.08;
      camera.position.copy(center).add(new THREE.Vector3(.45, .32, 1).normalize().multiplyScalar(distance));
      camera.lookAt(center);
      if (surface) {
        surfaceCamera.up.set(0, 1, 0);
        surfaceCamera.position.set(.5, .5, box.max.z + 4);
        if (resource.kind === 'solid' && resource.material === 'grass') {
          surfaceCamera.up.set(0, 0, -1);
          surfaceCamera.position.set(.5, box.max.y + 4, 0);
        }
        surfaceCamera.lookAt(.5, .5, 0);
      }
      renderer.render(scene, surface ? surfaceCamera : camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      previousView?.dispose();
      previousView = view;
      // 保留上一张的材质到下一张绘制完成，避免共享着色器反复销毁和编译。
      view.root.removeFromParent();
    }
  };
  return {
    render: (resourceId: string): string => render(resourceId, false),
    renderSurface: (resourceId: string): string => render(resourceId, true),
    dispose(): void { previousView?.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
