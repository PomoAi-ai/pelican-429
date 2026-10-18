import * as THREE from 'three';
import { RESIDENCE_WORLD } from '../config/residence.ts';
import type { AiCityLayerId } from '../config/ai-city-look.ts';
import type { PrecipSkyLook } from './precip-sky.ts';
import { createHarborLakeBackdrop } from './harbor-lake-backdrop.ts';

/** 只替换背景，前景住宅、碰撞、天气和世界时间由原住宅应用管理。 */
export function createHarborResidenceEnvironment(homeCenter: number) {
  const root = new THREE.Group(); root.name = 'harbor-residence-environment';
  let scenery: Awaited<ReturnType<typeof createHarborLakeBackdrop>> | undefined;
  let camera: THREE.PerspectiveCamera;
  let disposed = false;
  let weather: PrecipSkyLook | undefined;
  let night = 0;
  return { root,
    async prepare(signal: AbortSignal, progress: (value: { completed: number; total: number }) => void): Promise<void> {
      signal.throwIfAborted(); progress({ completed: 0, total: 1 });
      const loaded = await createHarborLakeBackdrop({ minX: RESIDENCE_WORLD.minX, maxX: RESIDENCE_WORLD.maxX, homeCenter });
      if (disposed || signal.aborted) {
        loaded.dispose(); signal.throwIfAborted();
        throw new DOMException('住宅背景已释放', 'AbortError');
      }
      scenery = loaded; loaded.root.position.y = RESIDENCE_WORLD.groundTop;
      loaded.setCamera(camera); loaded.setNightFactor(night);
      if (weather) loaded.setWeather(weather);
      root.add(loaded.root); progress({ completed: 1, total: 1 });
    },
    setCamera(value: THREE.PerspectiveCamera): void { camera = value; scenery?.setCamera(value); },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void { scenery!.setLayerVisible(id, visible); },
    setWeather(value: PrecipSkyLook): void { weather = value; scenery?.setWeather(value); },
    setNightFactor(value: number): void { night = value; scenery?.setNightFactor(value); },
    update(time: number): void { scenery!.update(time); },
    dispose(): void { disposed = true; scenery?.dispose(); root.removeFromParent(); root.clear(); },
  };
}
