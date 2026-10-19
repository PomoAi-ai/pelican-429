import * as THREE from 'three';
import { createPaintedBackdrop } from './painted-backdrop.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

/** 云层处在城市之后，日月和夜间星空继续由共享天空系统绘制。 */
export async function createResidenceThreeSky(signal: AbortSignal) {
  signal.throwIfAborted();
  const url = `${import.meta.env.BASE_URL}scenes/residence-2-lake-v1/sky.webp`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`住宅三维天空加载失败：${url} (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  if (signal.aborted) {
    bitmap.close();
    signal.throwIfAborted();
  }
  const texture = new THREE.Texture(bitmap);
  texture.name = 'residence-three-day-clouds';
  texture.flipY = false;
  texture.needsUpdate = true;
  const sky = createPaintedBackdrop([
    { name: 'sky', texture, z: -1400, parallax: 0, lift: 0 },
  ], { centerX: 0, halfWidth: 1, centerY: 0, halfHeight: 1,
    horizon: .45, cover: 1.15, cameraFacing: true });
  sky.root.name = 'residence-three-sky';
  const { mesh, material } = sky.layers[0]!;
  material.transparent = true;
  material.toneMapped = false;
  mesh.renderOrder = -5;
  let night = 0, cloud = 0, gray = 0;
  const daylight = new THREE.Color('#fff9ef');
  const dusk = new THREE.Color('#eab48d');
  const overcast = new THREE.Color('#83919b');
  function atmosphere() {
    const warm = THREE.MathUtils.smoothstep(night, 0, .15)
      * (1 - THREE.MathUtils.smoothstep(night, .3, .7));
    material.color.copy(daylight).lerp(dusk, warm * .65).lerp(overcast, gray * .65);
    // 白昼云图在入夜前退出，避免夜间仍保留蓝天与白色云团。
    material.opacity = (1 - THREE.MathUtils.smoothstep(night, .15, .82)) * (1 - cloud * .8);
    mesh.visible = material.opacity > .001;
  }
  atmosphere();
  return {
    root: sky.root,
    setCamera(camera: THREE.PerspectiveCamera) { sky.update(camera); },
    setWeather(look: PrecipSkyLook) {
      cloud = look.cloudAmount;
      gray = look.cloudGray;
      atmosphere();
    },
    setNightFactor(value: number, _moon?: number) { night = value; atmosphere(); },
    dispose() { sky.dispose(); bitmap.close(); },
  };
}
