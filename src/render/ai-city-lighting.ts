import * as THREE from 'three';
import { AI_CITY_LOOK, type AiCityLook } from '../config/ai-city-look.ts';
import { sampleWorldTime, type WorldTime } from '../core/calendar.ts';
import { createSkyTexture, type Stage } from './stage.ts';
import { createCelestialSky, keyLightDirection } from './celestial-sky.ts';
import { planPasses } from './post-fx.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

// 换图前 RoomEnvironment 为中性灰，平均辐亮度约 1.35。渐变天空的颜色已含昼夜与晨昏明暗，
// 按当前渐变的平均亮度归一，有效环境光沿用换图前的轨迹，只多出天色。
const ROOM_ENVIRONMENT_RADIANCE = 1.35;
const luminance = (color: THREE.Color): number => .2126 * color.r + .7152 * color.g + .0722 * color.b;
// PMREM 卷积要整屏绘制多遍，天色渐变很慢，限频即可。
const SKY_ENV_INTERVAL_MS = 1000;

/** 住宅目录和游戏共用昼夜光照；离开住宅时恢复检查舞台。 */
export function createAiCityLighting(stage: Stage, look: AiCityLook = AI_CITY_LOOK) {
  const { scene, renderer, keyLight, hemiLight, rimLight, postFx } = stage;
  const original = {
    background: scene.background, fog: scene.fog,
    environment: scene.environment, environmentIntensity: scene.environmentIntensity,
    exposure: renderer.toneMappingExposure,
    key: keyLight.color.clone(), keyIntensity: keyLight.intensity,
    hemi: hemiLight.color.clone(), ground: hemiLight.groundColor.clone(), hemiIntensity: hemiLight.intensity,
    rim: rimLight.color.clone(), rimIntensity: rimLight.intensity, rimPosition: rimLight.position.clone(),
    tint: postFx.grade.uTint.value.clone(), contrast: postFx.grade.uContrast.value,
    saturation: postFx.grade.uSaturation.value, ao: postFx.grade.uAoIntensity.value,
    shadow: keyLight.shadow.intensity,
  };
  const sky = createSkyTexture(look.skyTop, look.skyBottom);
  const canvas = sky.image as HTMLCanvasElement;
  const context = canvas.getContext('2d')!;
  const palette = {
    top: new THREE.Color(look.skyTop), bottom: new THREE.Color(look.skyBottom),
    haze: new THREE.Color(look.haze),
    nightTop: new THREE.Color('#07112e'), nightBottom: new THREE.Color('#283959'),
    duskTop: new THREE.Color(look.duskTop), duskBottom: new THREE.Color(look.duskBottom),
    key: new THREE.Color(look.keyColor), sunset: new THREE.Color(look.sunsetColor), moon: new THREE.Color('#9bb9f4'),
    hemi: new THREE.Color(look.hemiSky), ground: new THREE.Color(look.hemiGround),
    nightHemi: new THREE.Color('#7791c7'), nightGround: new THREE.Color('#354163'),
    fog: new THREE.Color(look.fog), nightFog: new THREE.Color('#1b2b4b'),
    rim: new THREE.Color(look.rimColor), nightRim: new THREE.Color('#85acec'),
  };
  const top = new THREE.Color();
  const bottom = new THREE.Color();
  const ground = new THREE.Color();
  const horizon = new THREE.Color();
  const skyTint = new THREE.Color(1, 1, 1);
  const sunGlow = { x: 0, y: 1, z: 0, a: 0 };
  const weatherColor = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  // 宽 1024 → cube 256，与舞台 RoomEnvironment 同尺寸，CUBEUV define 不变，切换环境图不重编译材质。
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 1024;
  envCanvas.height = 512;
  const envContext = envCanvas.getContext('2d')!;
  const envSky = new THREE.CanvasTexture(envCanvas);
  envSky.mapping = THREE.EquirectangularReflectionMapping;
  envSky.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget: THREE.WebGLRenderTarget | null = null;
  let envDirty = false;
  let envAt = 0;
  // 等距柱状图上半为天空顶色到地平线色，下半为半球光地面色，地平线略作过渡。
  // 光面清漆反射的主要是地平线和太阳：暖色地平线带与太阳亮斑让高光带出午后暖金，而不是一片蓝天。
  const refreshEnvironment = (): THREE.WebGLRenderTarget => {
    const { width, height } = envCanvas;
    const gradient = envContext.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top.getStyle());
    gradient.addColorStop(.42, bottom.getStyle());
    gradient.addColorStop(.5, horizon.getStyle());
    gradient.addColorStop(.54, ground.getStyle());
    gradient.addColorStop(1, ground.getStyle());
    envContext.fillStyle = gradient;
    envContext.fillRect(0, 0, width, height);
    if (sunGlow.a > 0) {
      // 与 three 等距柱状采样一致：u 由 atan(z, x)，v 由 asin(y)。
      const u = (Math.atan2(sunGlow.z, sunGlow.x) / (2 * Math.PI) + .5) * width;
      const v = (.5 - Math.asin(sunGlow.y) / Math.PI) * height;
      for (const offset of [-width, 0, width]) {
        const glow = envContext.createRadialGradient(u + offset, v, 0, u + offset, v, height * .16);
        glow.addColorStop(0, `rgba(255,236,206,${sunGlow.a})`);
        glow.addColorStop(.25, `rgba(255,214,168,${sunGlow.a * .55})`);
        glow.addColorStop(1, 'rgba(255,214,168,0)');
        envContext.fillStyle = glow;
        envContext.fillRect(0, 0, width, height);
      }
    }
    envSky.needsUpdate = true;
    // 传回同一渲染目标，scene.environment 引用不变，只覆写内容。
    envTarget = pmrem.fromEquirectangular(envSky, envTarget);
    envAt = performance.now();
    envDirty = false;
    return envTarget;
  };
  const celestial = createCelestialSky({ horizonLine: look.celestialHorizon });
  celestial.root.visible = false;
  scene.add(celestial.root);
  const fog = new THREE.Fog(look.fog, 55, 240);
  let active = false;
  let world = sampleWorldTime({ day: 1, second: 36000 });
  let weather: PrecipSkyLook | null = null;
  let skySignature = '';
  const setWorldTime = (next: WorldTime, atmosphere: PrecipSkyLook | null): void => {
    world = next;
    weather = atmosphere;
    if (!active) return;
    const { daylight, night, twilight } = world;
    top.copy(palette.nightTop).lerp(palette.top, daylight).lerp(palette.duskTop, twilight * .65);
    bottom.copy(palette.nightBottom).lerp(palette.bottom, daylight).lerp(palette.duskBottom, twilight * .8);
    if (weather) {
      top.lerp(weatherColor.copy(weather.skyTop).multiplyScalar(.08 + .92 * daylight), weather.cloudAmount);
      bottom.lerp(weatherColor.copy(weather.skyBottom).multiplyScalar(.12 + .88 * daylight), weather.cloudAmount);
    }
    ground.copy(palette.nightGround).lerp(palette.ground, daylight);
    horizon.copy(bottom).lerp(palette.haze, .5 * daylight * (1 - (weather?.cloudAmount ?? 0)));
    // 室内反弹只取天色的色相：亮度归一后向白收一半，昼夜明暗仍由天光网格与环境强度决定。
    skyTint.copy(horizon).multiplyScalar(1 / luminance(horizon)).lerp(white, .5);
    skyTint.multiplyScalar(1 / luminance(skyTint));
    const sun = world.sunDirection;
    const sunLength = Math.hypot(sun.x, sun.y, sun.z);
    Object.assign(sunGlow, { x: sun.x / sunLength, y: sun.y / sunLength, z: sun.z / sunLength,
      a: Math.round(10 * daylight * (1 - (weather?.cloudAmount ?? 0))) / 10 });
    const signature = `${top.getHexString()}${bottom.getHexString()}${ground.getHexString()}${horizon.getHexString()}`
      + `${sunGlow.x.toFixed(2)}${sunGlow.y.toFixed(2)}${sunGlow.a}`;
    if (signature !== skySignature) {
      skySignature = signature;
      envDirty = true;
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, top.getStyle());
      gradient.addColorStop(1, bottom.getStyle());
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      sky.needsUpdate = true;
    }
    celestial.setWorldTime(world, weather?.cloudAmount ?? 0);
    const sunPower = look.keyIntensity * daylight;
    const moonPower = .3 * night * world.moonLight;
    stage.setSunDirection(keyLightDirection(world.sunDirection, sunPower, moonPower));
    // 夜间补光下限随月相缩放：新月夜更暗，但不至于全黑。
    const floor = .6 + .4 * world.moonLight;
    keyLight.color.copy(palette.moon).lerp(palette.key, daylight).lerp(palette.sunset, twilight * .7);
    keyLight.intensity = sunPower + moonPower;
    hemiLight.color.copy(palette.nightHemi).lerp(palette.hemi, daylight);
    hemiLight.groundColor.copy(ground);
    hemiLight.intensity = .3 * floor + (look.hemiIntensity - .3 * floor) * daylight;
    rimLight.color.copy(palette.nightRim).lerp(palette.rim, daylight);
    rimLight.intensity = .2 * floor + (look.rimIntensity - .2 * floor) * daylight;
    // 按立体角加权：上半球顶色约占 1-2/π、地平线色约占 2/π，下半球为地面色。
    const skyRadiance = .5 * ((1 - 2 / Math.PI) * luminance(top) + 2 / Math.PI * luminance(bottom)) + .5 * luminance(ground);
    scene.environmentIntensity = (.07 * floor + (look.environmentIntensity - .07 * floor) * daylight) * ROOM_ENVIRONMENT_RADIANCE / skyRadiance;
    fog.color.copy(palette.nightFog).lerp(palette.fog, daylight).lerp(palette.duskBottom, twilight * .4);
    if (weather) {
      keyLight.intensity *= weather.key;
      hemiLight.intensity *= weather.hemi;
      rimLight.intensity *= weather.rim;
      scene.environmentIntensity *= weather.env;
      keyLight.shadow.intensity = original.shadow * weather.shadow;
      postFx.grade.uSaturation.value = 1.08 * weather.saturation;
      fog.color.lerp(weatherColor.copy(weather.fogColor).multiplyScalar(.12 + .88 * daylight), weather.fog);
    }
  };
  const setEnabled = (enabled: boolean): void => {
    if (active === enabled) return;
    active = enabled;
    celestial.root.visible = enabled;
    scene.background = enabled ? sky : original.background;
    scene.fog = enabled ? fog : original.fog;
    renderer.toneMappingExposure = enabled ? look.exposure : original.exposure;
    postFx.grade.uTint.value.copy(enabled ? new THREE.Color('#ffffff') : original.tint);
    postFx.grade.uContrast.value = enabled ? 1.035 : original.contrast;
    postFx.grade.uSaturation.value = enabled ? 1.08 : original.saturation;
    postFx.grade.uAoIntensity.value = enabled ? (planPasses(stage.quality).ao ? look.aoIntensity : 0) : original.ao;
    if (enabled) {
      rimLight.position.set(look.rimDirection.x, look.rimDirection.y, look.rimDirection.z);
      setWorldTime(world, weather);
      scene.environment = refreshEnvironment().texture;
    } else {
      scene.environment = original.environment;
      scene.environmentIntensity = original.environmentIntensity;
      keyLight.color.copy(original.key); keyLight.intensity = original.keyIntensity;
      hemiLight.color.copy(original.hemi); hemiLight.groundColor.copy(original.ground); hemiLight.intensity = original.hemiIntensity;
      rimLight.color.copy(original.rim); rimLight.intensity = original.rimIntensity; rimLight.position.copy(original.rimPosition);
      keyLight.shadow.intensity = original.shadow;
    }
  };
  const update = (): void => {
    if (!active) return;
    if (envDirty && performance.now() - envAt >= SKY_ENV_INTERVAL_MS) refreshEnvironment();
    celestial.update(stage.camera);
    // 雾只区分世界前后层；拉远镜头查看院区时，不能把玩法层一起洗白。
    fog.near = Math.max(0, stage.camera.position.z) + 15;
    fog.far = fog.near + 185 * (1 - (weather?.fog ?? 0) * .7);
  };
  return { setEnabled, setWorldTime, update, skyTint, dispose(): void {
    setEnabled(false); celestial.dispose(); sky.dispose();
    envSky.dispose(); envTarget?.dispose(); pmrem.dispose();
  } };
}
