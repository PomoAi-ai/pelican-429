import * as THREE from 'three';
import { AI_CITY_LOOK } from '../config/ai-city-look.ts';
import { sampleWorldTime, type WorldTime } from '../core/world-clock.ts';
import { createSkyTexture, type Stage } from './stage.ts';
import { createCelestialSky } from './celestial-sky.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

/** 住宅目录和游戏共用昼夜光照；离开住宅时恢复检查舞台。 */
export function createAiCityLighting(stage: Stage) {
  const { scene, renderer, keyLight, hemiLight, rimLight, postFx } = stage;
  const original = {
    background: scene.background, fog: scene.fog, environment: scene.environmentIntensity,
    exposure: renderer.toneMappingExposure,
    key: keyLight.color.clone(), keyIntensity: keyLight.intensity,
    hemi: hemiLight.color.clone(), ground: hemiLight.groundColor.clone(), hemiIntensity: hemiLight.intensity,
    rim: rimLight.color.clone(), rimIntensity: rimLight.intensity, rimPosition: rimLight.position.clone(),
    tint: postFx.grade.uTint.value.clone(), contrast: postFx.grade.uContrast.value,
    saturation: postFx.grade.uSaturation.value, ao: postFx.grade.uAoIntensity.value,
    shadow: keyLight.shadow.intensity,
  };
  const sky = createSkyTexture(AI_CITY_LOOK.skyTop, AI_CITY_LOOK.skyBottom);
  const canvas = sky.image as HTMLCanvasElement;
  const context = canvas.getContext('2d')!;
  const palette = {
    top: new THREE.Color(AI_CITY_LOOK.skyTop), bottom: new THREE.Color(AI_CITY_LOOK.skyBottom),
    nightTop: new THREE.Color('#07112e'), nightBottom: new THREE.Color('#283959'),
    duskTop: new THREE.Color('#666da9'), duskBottom: new THREE.Color('#f5ad7d'),
    key: new THREE.Color(AI_CITY_LOOK.keyColor), sunset: new THREE.Color('#ffbc7e'), moon: new THREE.Color('#9bb9f4'),
    hemi: new THREE.Color(AI_CITY_LOOK.hemiSky), ground: new THREE.Color(AI_CITY_LOOK.hemiGround),
    nightHemi: new THREE.Color('#7791c7'), nightGround: new THREE.Color('#354163'),
    fog: new THREE.Color(AI_CITY_LOOK.fog), nightFog: new THREE.Color('#1b2b4b'),
    rim: new THREE.Color(AI_CITY_LOOK.rimColor), nightRim: new THREE.Color('#85acec'),
  };
  const top = new THREE.Color();
  const bottom = new THREE.Color();
  const weatherColor = new THREE.Color();
  const celestial = createCelestialSky();
  celestial.root.visible = false;
  scene.add(celestial.root);
  const fog = new THREE.Fog(AI_CITY_LOOK.fog, 55, 240);
  let active = false;
  let world = sampleWorldTime(10);
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
    const signature = `${top.getHexString()}${bottom.getHexString()}`;
    if (signature !== skySignature) {
      skySignature = signature;
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, top.getStyle());
      gradient.addColorStop(1, bottom.getStyle());
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      sky.needsUpdate = true;
    }
    celestial.setWorldTime(world, weather?.cloudAmount ?? 0);
    // 晨昏按日月光强连续交接方向，避免切换阴影时受光面突然翻转。
    const sunPower = AI_CITY_LOOK.keyIntensity * daylight;
    const moonPower = .3 * night;
    const moonShare = moonPower / (sunPower + moonPower);
    stage.setSunDirection({ x: world.sunDirection.x * (1 - 2 * moonShare),
      y: Math.max(.04, Math.abs(world.sunDirection.y)), z: world.sunDirection.z });
    keyLight.color.copy(palette.moon).lerp(palette.key, daylight).lerp(palette.sunset, twilight * .7);
    keyLight.intensity = sunPower + moonPower;
    hemiLight.color.copy(palette.nightHemi).lerp(palette.hemi, daylight);
    hemiLight.groundColor.copy(palette.nightGround).lerp(palette.ground, daylight);
    hemiLight.intensity = .3 + (AI_CITY_LOOK.hemiIntensity - .3) * daylight;
    rimLight.color.copy(palette.nightRim).lerp(palette.rim, daylight);
    rimLight.intensity = .2 + (AI_CITY_LOOK.rimIntensity - .2) * daylight;
    scene.environmentIntensity = .07 + (AI_CITY_LOOK.environmentIntensity - .07) * daylight;
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
    renderer.toneMappingExposure = enabled ? AI_CITY_LOOK.exposure : original.exposure;
    postFx.grade.uTint.value.copy(enabled ? new THREE.Color('#ffffff') : original.tint);
    postFx.grade.uContrast.value = enabled ? 1.035 : original.contrast;
    postFx.grade.uSaturation.value = enabled ? 1.08 : original.saturation;
    postFx.grade.uAoIntensity.value = enabled ? .3 : original.ao;
    if (enabled) {
      rimLight.position.set(.6, .5, -.8);
      setWorldTime(world, weather);
    } else {
      scene.environmentIntensity = original.environment;
      keyLight.color.copy(original.key); keyLight.intensity = original.keyIntensity;
      hemiLight.color.copy(original.hemi); hemiLight.groundColor.copy(original.ground); hemiLight.intensity = original.hemiIntensity;
      rimLight.color.copy(original.rim); rimLight.intensity = original.rimIntensity; rimLight.position.copy(original.rimPosition);
      keyLight.shadow.intensity = original.shadow;
    }
  };
  const update = (): void => {
    if (!active) return;
    celestial.update(stage.camera);
    // 雾只区分世界前后层；拉远镜头查看院区时，不能把玩法层一起洗白。
    fog.near = Math.max(0, stage.camera.position.z) + 15;
    fog.far = fog.near + 185 * (1 - (weather?.fog ?? 0) * .7);
  };
  return { setEnabled, setWorldTime, update, dispose(): void { setEnabled(false); celestial.dispose(); sky.dispose(); } };
}
