import * as THREE from 'three';
import { createPaintedBackdrop } from '../sky/painted-backdrop.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';

/** 透明薄云叠在世界昼夜天空上，塔尖周围保留空隙，水面也能反射同一片天空。 */
export async function createResidenceFourSky(signal: AbortSignal) {
  const url = `${import.meta.env.BASE_URL}scenes/residence-four-river-v2/clouds.png`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`住宅水城云层加载失败：${url} (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
  const texture = new THREE.Texture(bitmap);
  texture.name = 'residence-four-thin-clouds'; texture.flipY = false; texture.needsUpdate = true;
  const sky = createPaintedBackdrop([{ name: 'clouds', texture, z: -2400, parallax: 0, lift: .12 }],
    { centerX: 0, halfWidth: 1, centerY: 0, halfHeight: 1,
      horizon: .45, cover: 1.1, aspect: 16 / 9, cameraFacing: true });
  sky.root.name = 'residence-four-clouds';
  const { mesh, material } = sky.layers[0]!;
  mesh.renderOrder = -5;
  const daylight = new THREE.Color('#f5f3ea'), evening = new THREE.Color('#d9c3b2');
  const nightColor = new THREE.Color('#293649'), overcast = new THREE.Color('#9faab2');
  let night = 0, cloud = 0;
  const update = () => {
    const twilight = Math.sin(night * Math.PI);
    material.color.copy(daylight).lerp(evening, twilight * .35).lerp(nightColor, night).lerp(overcast, cloud * .4);
    material.opacity = (.76 - night * .25) * (1 - cloud * .68);
  };
  update();
  return { root: sky.root,
    setCamera(camera: THREE.PerspectiveCamera, cameraFrame: THREE.Object3D) { sky.update(camera, cameraFrame); },
    setWeather(look: PrecipSkyLook) { cloud = look.cloudAmount; update(); },
    setNightFactor(value: number, _moon?: number) { night = value; update(); },
    dispose() { sky.dispose(); bitmap.close(); },
  };
}
