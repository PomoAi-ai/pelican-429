import * as THREE from 'three';
import { sampleWorldTime, type GameTime } from '../../core/calendar.ts';
import { TUNING } from '../../config/tuning.ts';
import { createCelestialSky, keyLightDirection } from './celestial-sky.ts';
import type { FreeWorldBackgroundView } from './free-world-background.ts';
import type { LightShafts } from './light-shafts.ts';
import type { PrecipSkyBase } from './precip-sky.ts';
import type { Stage, StageRenderer } from '../stage/stage.ts';
import type { WeatherFx } from './weather-fx.ts';

export interface FreeWorldDaylightOptions {
  readonly stage: Stage<StageRenderer>;
  readonly background: FreeWorldBackgroundView;
  readonly shafts: LightShafts;
  readonly clouds: WeatherFx;
  readonly clock: Readonly<GameTime>;
}

const NIGHT_KEY = new THREE.Color('#9bb9f4');
const DUSK_KEY = new THREE.Color('#ffbc7e');
const NIGHT_HEMI = new THREE.Color('#7791c7');
const NIGHT_PAINT = new THREE.Color('#5a6a94');
const DUSK_PAINT = new THREE.Color('#ffc4a0');
const WHITE = new THREE.Color(1, 1, 1);

/**
 * 家园昼夜驱动：只改写降水层的基础灯光（降水层仍是唯一写灯光的一方），并给背景、云、光束乘昼夜色、驱动日月星。
 * 白天值取自创建时的舞台灯光，满日照时 base 与原值相同，正午画面不变；露天系数取自背景，洞穴不随户外昼夜变化。
 */
export function createFreeWorldDaylight({ stage, background, shafts, clouds, clock }: FreeWorldDaylightOptions) {
  const { keyLight, hemiLight, rimLight, scene } = stage;
  const day = { key: keyLight.intensity, keyColor: keyLight.color.clone(), hemi: hemiLight.intensity, hemiSky: hemiLight.color.clone(), rim: rimLight.intensity, env: scene.environmentIntensity };
  const base: PrecipSkyBase = { ...day, keyColor: day.keyColor.clone(), hemiSky: day.hemiSky.clone(), sky: 1 };
  const defaultSun = new THREE.Vector3().copy(TUNING.render.lighting.sun.direction).normalize();
  const sun = new THREE.Vector3();
  const celestial = createCelestialSky({ radius: 180, horizonLine: .5 });
  scene.add(celestial.root);
  let t = sampleWorldTime(clock);

  return {
    base,
    /** 降水层更新之前调用：写 base、太阳方向、背景与云的昼夜色、光束强度。 */
    update(): void {
      t = sampleWorldTime(clock);
      const s = background.environment.sky;
      const m = t.moonLight;
      const d = 1 - s * (1 - t.daylight);
      const n = s * t.night;
      const w = s * t.twilight;
      const sunPower = day.key * d;
      const moonPower = day.key * .12 * n * m;
      base.key = sunPower + moonPower;
      base.keyColor.copy(NIGHT_KEY).lerp(day.keyColor, d).lerp(DUSK_KEY, .7 * w);
      base.hemi = day.hemi * THREE.MathUtils.lerp(.28 * (.6 + .4 * m), 1, d);
      base.hemiSky.copy(NIGHT_HEMI).lerp(day.hemiSky, d);
      base.rim = day.rim * THREE.MathUtils.lerp(.3, 1, d);
      base.env = day.env * THREE.MathUtils.lerp(.18, 1, d);
      base.sky = THREE.MathUtils.lerp(.14 + .1 * m, 1, t.daylight);
      background.paint.copy(NIGHT_PAINT).multiplyScalar(.75 + .25 * m).lerp(WHITE, t.daylight).lerp(DUSK_PAINT, .6 * t.twilight);
      clouds.setSkyLight(background.paint);
      shafts.setStrength(t.daylight);
      // 地下时光照方向回到默认太阳方向，洞内阴影不随户外日月转动。
      sun.copy(keyLightDirection(t.sunDirection, sunPower, moonPower)).normalize().lerp(defaultSun, 1 - s).normalize();
      stage.setSunDirection(sun);
    },
    /** 降水层更新之后调用：cloudCover 为本帧云量，室内按露天系数一并遮住日月星。 */
    updateSky(cloudCover: number): void {
      const s = background.environment.sky;
      celestial.root.visible = s > 0;
      celestial.setWorldTime(t, 1 - (1 - cloudCover) * s);
      celestial.update(stage.camera);
    },
    dispose(): void {
      celestial.dispose();
    },
  };
}
export type FreeWorldDaylight = ReturnType<typeof createFreeWorldDaylight>;
