/**
 * 昼夜光照：按世界时间与一套外观（config/ai-city-look 的 DaylightLook）写降水层的基础灯光与晴天天空渐变（precip-sky 的 base），
 * 并驱动太阳方向与日月星；降水层再乘天气写到舞台灯光与天空，是唯一写灯光的一方。
 * 外观带 atmosphere（城区）时另管曝光、调色、雾和天色环境图：环境图按本帧天空渐变绘成等距柱状图，经舞台的 PMREM 卷积，两种后端通用。
 * openSky 是露天系数：0 时（洞穴）灯光回到白天值、太阳方向回到默认、日月星隐藏，洞内不随户外昼夜变化。
 * 每帧先 update()（降水层更新之前），再以本帧天气调用 updateSky()；dispose 恢复创建时改过的舞台设置。
 */
import * as THREE from 'three';
import type { DaylightAtmosphere, DaylightLook } from '../../config/ai-city-look.ts';
import { TUNING } from '../../config/tuning.ts';
import { sampleWorldTime, type GameTime, type WorldTime } from '../../core/calendar.ts';
import { planPasses } from '../stage/post-fx.ts';
import { SKY_BOTTOM, SKY_TOP, type Stage, type StageRenderer } from '../stage/stage.ts';
import { createCelestialSky, keyLightDirection } from './celestial-sky.ts';
import type { PrecipSkyBase, PrecipSkyLook } from './precip-sky.ts';

// 换图前 RoomEnvironment 为中性灰，平均辐亮度约 1.35。渐变天空的颜色已含昼夜与晨昏明暗，
// 按当前渐变的平均亮度归一，有效环境光沿用换图前的轨迹，只多出天色。
const ROOM_ENVIRONMENT_RADIANCE = 1.35;
// PMREM 卷积要整屏绘制多遍，天色渐变很慢，限频即可。
const SKY_ENV_INTERVAL_MS = 1000;
const luminance = (color: THREE.Color): number => .2126 * color.r + .7152 * color.g + .0722 * color.b;
const WHITE = new THREE.Color(1, 1, 1);

export interface DaylightOptions {
  readonly stage: Stage<StageRenderer>;
  readonly look: DaylightLook;
  readonly clock: Readonly<GameTime>;
  readonly openSky: () => number;
}

interface SunGlow { x: number; y: number; z: number; a: number }

/** 天色环境图：等距柱状画布 → PMREM，传回同一渲染目标，scene.environment 引用不变，只覆写内容。 */
function createSkyEnvironment(stage: Stage<StageRenderer>) {
  // 宽 1024 → cube 256，与舞台 RoomEnvironment 同尺寸，CUBEUV define 不变，切换环境图不重编译材质。
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('daylight: cannot create 2D context for the sky environment');
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = stage.createPmrem();
  let target: THREE.RenderTarget | null = null;
  // 上半为天空顶色到地平线色，下半为半球光地面色，地平线略作过渡。
  // 光面清漆反射的主要是地平线和太阳：暖色地平线带与太阳亮斑让高光带出午后暖金，而不是一片蓝天。
  const draw = (top: THREE.Color, bottom: THREE.Color, horizon: THREE.Color, ground: THREE.Color, sun: SunGlow): THREE.Texture => {
    const { width, height } = canvas;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top.getStyle());
    gradient.addColorStop(.42, bottom.getStyle());
    gradient.addColorStop(.5, horizon.getStyle());
    gradient.addColorStop(.54, ground.getStyle());
    gradient.addColorStop(1, ground.getStyle());
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (sun.a > 0) {
      // 与 three 等距柱状采样一致：u 由 atan(z, x)，v 由 asin(y)。
      const u = (Math.atan2(sun.z, sun.x) / (2 * Math.PI) + .5) * width;
      const v = (.5 - Math.asin(sun.y) / Math.PI) * height;
      for (const offset of [-width, 0, width]) {
        const glow = context.createRadialGradient(u + offset, v, 0, u + offset, v, height * .16);
        glow.addColorStop(0, `rgba(255,236,206,${sun.a})`);
        glow.addColorStop(.25, `rgba(255,214,168,${sun.a * .55})`);
        glow.addColorStop(1, 'rgba(255,214,168,0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      }
    }
    texture.needsUpdate = true;
    target = pmrem.fromEquirectangular(texture, target);
    return target.texture;
  };
  return { draw, dispose(): void { texture.dispose(); target?.dispose(); pmrem.dispose(); } };
}

/** 城区大气：曝光、调色、边光方向、雾与天色环境图；创建时写入，dispose 恢复。 */
function createAtmosphere(stage: Stage<StageRenderer>, look: DaylightAtmosphere) {
  const { scene, renderer, rimLight, postFx } = stage;
  const { grade } = postFx;
  const original = {
    fog: scene.fog, environment: scene.environment, exposure: renderer.toneMappingExposure, rim: rimLight.position.clone(),
    tint: grade.uTint.value.clone(), contrast: grade.uContrast.value, saturation: grade.uSaturation.value, ao: grade.uAoIntensity.value,
  };
  renderer.toneMappingExposure = look.exposure;
  grade.uTint.value.copy(WHITE);
  grade.uContrast.value = 1.035;
  grade.uSaturation.value = 1.08;
  grade.uAoIntensity.value = planPasses(stage.quality).ao ? look.aoIntensity : 0;
  rimLight.position.set(look.rimDirection.x, look.rimDirection.y, look.rimDirection.z);
  const fog = new THREE.Fog(look.fog, 55, 240);
  scene.fog = fog;
  const C = (hex: string): THREE.Color => new THREE.Color(hex);
  const palette = {
    top: C(look.skyTop), bottom: C(look.skyBottom), duskTop: C(look.duskTop), duskBottom: C(look.duskBottom),
    nightTop: C(look.nightTop), nightBottom: C(look.nightBottom), haze: C(look.haze), fog: C(look.fog), nightFog: C(look.nightFog),
  };
  const environment = look.skyReflection ? createSkyEnvironment(stage) : null;
  const horizon = new THREE.Color();
  const weatherFog = new THREE.Color();
  const sun: SunGlow = { x: 0, y: 1, z: 0, a: 0 };
  let signature = '';
  let envAt = -Infinity;
  let envScale = 1;
  return {
    get envScale() { return envScale; },
    /** 晴天天空渐变：夜色 → 白天 → 晨昏。 */
    sky(t: WorldTime, base: PrecipSkyBase): void {
      base.skyTop.copy(palette.nightTop).lerp(palette.top, t.daylight).lerp(palette.duskTop, t.twilight * .65);
      base.skyBottom.copy(palette.nightBottom).lerp(palette.bottom, t.daylight).lerp(palette.duskBottom, t.twilight * .8);
    },
    /** top/bottom 是降水层本帧画出的天空渐变（含天气）。 */
    update(t: WorldTime, top: THREE.Color, bottom: THREE.Color, cloud: number, fogAmount: number, fogColor: THREE.Color, base: PrecipSkyBase, skyTint: THREE.Color): void {
      const ground = base.hemiGround;
      horizon.copy(bottom).lerp(palette.haze, .5 * t.daylight * (1 - cloud));
      // 室内反弹只取天色的色相：亮度归一后向白收一半，昼夜明暗仍由天光网格与环境强度决定。
      skyTint.copy(horizon).multiplyScalar(1 / luminance(horizon)).lerp(WHITE, .5);
      skyTint.multiplyScalar(1 / luminance(skyTint));
      fog.color.copy(palette.nightFog).lerp(palette.fog, t.daylight).lerp(palette.duskBottom, t.twilight * .4)
        .lerp(weatherFog.copy(fogColor).multiplyScalar(base.sky), fogAmount);
      // 雾只区分世界前后层；拉远镜头查看院区时，不能把玩法层一起洗白。
      fog.near = Math.max(0, stage.camera.position.z) + 15;
      fog.far = fog.near + 185 * (1 - fogAmount * .7);
      if (!environment) return;
      // 按立体角加权：上半球顶色约占 1-2/π、地平线色约占 2/π，下半球为地面色。
      const radiance = .5 * ((1 - 2 / Math.PI) * luminance(top) + 2 / Math.PI * luminance(bottom)) + .5 * luminance(ground);
      envScale = ROOM_ENVIRONMENT_RADIANCE / radiance;
      const s = t.sunDirection;
      const length = Math.hypot(s.x, s.y, s.z);
      Object.assign(sun, { x: s.x / length, y: s.y / length, z: s.z / length, a: Math.round(10 * t.daylight * (1 - cloud)) / 10 });
      const next = `${top.getHexString()}${bottom.getHexString()}${ground.getHexString()}${horizon.getHexString()}`
        + `${sun.x.toFixed(2)}${sun.y.toFixed(2)}${sun.a}`;
      if (next === signature || performance.now() - envAt < SKY_ENV_INTERVAL_MS) return;
      const first = signature === '';
      signature = next;
      envAt = performance.now();
      const texture = environment.draw(top, bottom, horizon, ground, sun);
      if (first) scene.environment = texture;
    },
    dispose(): void {
      scene.fog = original.fog;
      scene.environment = original.environment;
      renderer.toneMappingExposure = original.exposure;
      rimLight.position.copy(original.rim);
      grade.uTint.value.copy(original.tint);
      grade.uContrast.value = original.contrast;
      grade.uSaturation.value = original.saturation;
      grade.uAoIntensity.value = original.ao;
      environment?.dispose();
    },
  };
}

export function createDaylight({ stage, look, clock, openSky }: DaylightOptions) {
  const C = (hex: string): THREE.Color => new THREE.Color(hex);
  const day = { key: C(look.keyColor), hemi: C(look.hemiSky), ground: C(look.hemiGround), rim: C(look.rimColor) };
  const night = { key: C(look.moonColor), sunset: C(look.sunsetColor), hemi: C(look.nightHemi), ground: C(look.nightGround), rim: C(look.nightRim) };
  const base: PrecipSkyBase = {
    key: look.keyIntensity, keyColor: day.key.clone(), hemi: look.hemiIntensity, hemiSky: day.hemi.clone(), hemiGround: day.ground.clone(),
    rim: look.rimIntensity, rimColor: day.rim.clone(), env: look.environmentIntensity, sky: 1,
    skyTop: new THREE.Color(SKY_TOP), skyBottom: new THREE.Color(SKY_BOTTOM),
  };
  const skyTint = new THREE.Color(1, 1, 1);
  const defaultSun = new THREE.Vector3().copy(TUNING.render.lighting.sun.direction).normalize();
  const sun = new THREE.Vector3();
  const celestial = createCelestialSky({ radius: look.celestialRadius, horizonLine: look.celestialHorizon });
  stage.scene.add(celestial.root);
  const atmosphere = look.atmosphere ? createAtmosphere(stage, look.atmosphere) : null;
  let t = sampleWorldTime(clock);
  const lerp = THREE.MathUtils.lerp;

  const update = (): void => {
    t = sampleWorldTime(clock);
    const s = openSky();
    const m = t.moonLight;
    const d = 1 - s * (1 - t.daylight);
    const floor = .6 + .4 * m;
    const sunPower = look.keyIntensity * d;
    const moonPower = look.night.key * s * t.night * m;
    base.key = sunPower + moonPower;
    base.keyColor.copy(night.key).lerp(day.key, d).lerp(night.sunset, .7 * s * t.twilight);
    base.hemi = lerp(look.night.hemi * floor, look.hemiIntensity, d);
    base.hemiSky.copy(night.hemi).lerp(day.hemi, d);
    base.hemiGround.copy(night.ground).lerp(day.ground, d);
    base.rim = lerp(look.night.rim * floor, look.rimIntensity, d);
    base.rimColor.copy(night.rim).lerp(day.rim, d);
    base.env = lerp(look.night.environment * floor, look.environmentIntensity, d) * (atmosphere ? atmosphere.envScale : 1);
    base.sky = lerp(.14 + .1 * m, 1, t.daylight);
    atmosphere?.sky(t, base);
    sun.copy(keyLightDirection(t.sunDirection, sunPower, moonPower)).normalize().lerp(defaultSun, 1 - s).normalize();
    stage.setSunDirection(sun);
  };
  update();

  return {
    base,
    /** 城区室内反弹的天色色相（无大气时为白）。 */
    skyTint,
    get time(): WorldTime { return t; },
    update,
    /** 降水层更新之后调用：weather 为本帧天气（天空渐变已含天气），室内按露天系数一并遮住日月星。 */
    updateSky(weather: PrecipSkyLook): void {
      const s = openSky();
      celestial.root.visible = s > 0;
      celestial.setWorldTime(t, 1 - (1 - weather.cloudAmount) * s);
      celestial.update(stage.camera);
      atmosphere?.update(t, weather.skyTop, weather.skyBottom, weather.cloudAmount, weather.fog, weather.fogColor, base, skyTint);
    },
    dispose(): void {
      celestial.dispose();
      atmosphere?.dispose();
    },
  };
}
export type Daylight = ReturnType<typeof createDaylight>;
