import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AI_CITY_LOOK, AI_CITY_SUN } from '../config/ai-city-look.ts';
import { createResidenceView } from './residence-view.ts';

/** 用游戏资源生成静态预览；不保留动画循环或另一份模型。 */
export function createResourceThumbnailRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(160, 120);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = AI_CITY_LOOK.exposure;
  const scene = new THREE.Scene();
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = AI_CITY_LOOK.environmentIntensity;
  scene.add(new THREE.HemisphereLight(AI_CITY_LOOK.hemiSky, AI_CITY_LOOK.hemiGround, AI_CITY_LOOK.hemiIntensity));
  const sun = new THREE.DirectionalLight(AI_CITY_LOOK.keyColor, AI_CITY_LOOK.keyIntensity);
  sun.position.set(AI_CITY_SUN.x, AI_CITY_SUN.y, AI_CITY_SUN.z);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, .01, 100);
  return {
    render(resourceId: string): string {
      const view = createResidenceView({ placements: [{ id: 1, resourceId, x: 0, y: 0, open: false }], nextId: 2, revision: 0 }, { lighting: false });
      scene.add(view.root);
      try {
        view.update(0, null);
        const box = new THREE.Box3().setFromObject(view.root);
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2;
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.08;
        camera.position.copy(center).add(new THREE.Vector3(.45, .32, 1).normalize().multiplyScalar(distance));
        camera.lookAt(center);
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      } finally { view.dispose(); }
    },
    dispose(): void { environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
