import * as THREE from 'three';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import type { AiCityLayerId } from '../../config/ai-city-look.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { createHarborLakeBackdrop } from './harbor-lake-backdrop.ts';
import { createAiCityEnvironment, type AiCityClearing } from './ai-city-environment.ts';

// 地下长廊窗外的地下城远景：夹在长廊背墙（Z −1.2～−1）与地层背板（Z −1.7）之间，只从窗洞露出；
// 未挖空处被深3地层格挡住。贴图按世界坐标铺开并随镜头平移，模拟约 60 格外的深处。
const GEOFRONT = { minX: 29, maxX: 94, minY: -14, maxY: 1, z: -1.6, height: 26, follow: .67 };

function createGeofrontVista(map: THREE.Texture) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
  const image = map.image as HTMLImageElement;
  const size = new THREE.Vector2(GEOFRONT.height * image.width / image.height, GEOFRONT.height);
  const center = new THREE.Vector2((GEOFRONT.minX + GEOFRONT.maxX) / 2, (GEOFRONT.minY + GEOFRONT.maxY) / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uSize: { value: size }, uCenter: { value: center }, uCamera: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec2 uSize, uCenter, uCamera; varying vec2 vWorld;
      void main() {
        vec2 uv = (vWorld - uCenter - (uCamera - uCenter) * ${GEOFRONT.follow.toFixed(2)}) / uSize + 0.5;
        gl_FragColor = vec4(texture2D(uMap, uv).rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GEOFRONT.maxX - GEOFRONT.minX, GEOFRONT.maxY - GEOFRONT.minY), material);
  mesh.name = 'residence-geofront-vista';
  mesh.position.set(center.x, center.y, GEOFRONT.z);
  return { mesh,
    setCamera(camera: THREE.Camera): void { material.uniforms.uCamera!.value.set(camera.position.x, camera.position.y); },
    dispose(): void { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); map.dispose(); },
  };
}

/**
 * 只替换背景，前景住宅、碰撞、天气和世界时间由原住宅应用管理。
 * 前景格子（水带、花坛、格子台）与背景格子二（实体近轨和列车）复用 AI 住宅，湖景与远城用住宅2自己的原画。
 */
export function createHarborResidenceEnvironment(homeCenter: number, clearing: AiCityClearing | null = null) {
  const root = new THREE.Group(); root.name = 'harbor-residence-environment';
  const foreground = createAiCityEnvironment({ homeCenter, scenery: 'foreground', clearing });
  root.add(foreground.root);
  let scenery: Awaited<ReturnType<typeof createHarborLakeBackdrop>> | undefined;
  let geofront: ReturnType<typeof createGeofrontVista> | undefined;
  let camera: THREE.PerspectiveCamera;
  let disposed = false;
  let weather: PrecipSkyLook | undefined;
  let night = 0, moonLight = 0;
  return { root,
    async prepare(signal: AbortSignal, progress: (value: { completed: number; total: number }) => void): Promise<void> {
      signal.throwIfAborted(); progress({ completed: 0, total: 1 });
      const [backdrop, vista] = await Promise.allSettled([
        createHarborLakeBackdrop({ minX: RESIDENCE_WORLD.minX, maxX: RESIDENCE_WORLD.maxX, homeCenter }),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/residence-2-lake-v1/geofront.webp`),
      ]);
      if (backdrop.status === 'rejected' || vista.status === 'rejected' || disposed || signal.aborted) {
        if (backdrop.status === 'fulfilled') backdrop.value.dispose();
        if (vista.status === 'fulfilled') vista.value.dispose();
        if (backdrop.status === 'rejected') throw backdrop.reason;
        if (vista.status === 'rejected') throw new Error('住宅地下远景加载失败', { cause: vista.reason });
        signal.throwIfAborted();
        throw new DOMException('住宅背景已释放', 'AbortError');
      }
      const loaded = backdrop.value;
      geofront = createGeofrontVista(vista.value); geofront.setCamera(camera); root.add(geofront.mesh);
      scenery = loaded; loaded.root.position.y = RESIDENCE_WORLD.groundTop;
      loaded.setCamera(camera); loaded.setNightFactor(night, moonLight);
      if (weather) loaded.setWeather(weather);
      root.add(loaded.root);
      await foreground.prepare(signal, step => progress({ completed: 1 + step.completed, total: 1 + step.total }));
    },
    setCamera(value: THREE.PerspectiveCamera): void {
      camera = value; scenery?.setCamera(value); geofront?.setCamera(value); foreground.setCamera(value);
    },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void { scenery!.setLayerVisible(id, visible); foreground.setLayerVisible(id, visible); },
    setWeather(value: PrecipSkyLook): void { weather = value; scenery?.setWeather(value); foreground.setWeather(value); },
    // 月光只影响湖景原画分层调色；前景实体由场景灯光照亮。
    setNightFactor(value: number, moon: number): void {
      night = value; moonLight = moon; scenery?.setNightFactor(value, moon); foreground.setNightFactor(value);
    },
    update(time: number): void { scenery!.update(time); foreground.update(time); },
    dispose(): void { disposed = true; scenery?.dispose(); geofront?.dispose(); foreground.dispose(); root.removeFromParent(); root.clear(); },
  };
}
