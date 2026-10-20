/**
 * 检视页天气：与游戏同一条昼夜与降水路径（daylight 写基础灯光，降水视图乘天气写灯光、天空与雨雪）。
 * 天气状态只来自页面模拟世界的环境（风、龙卷、雨雪与游戏同一套 sim 环境），工作台的天气设置经环境命令写入；
 * 遮雨列与滴水按格子世界算（levelPrecipSource），可编辑场地由降水视图按节奏刷新。
 */
import * as THREE from 'three';
import { AI_CITY_LOOK } from '../../config/ai-city-look.ts';
import { DEFAULT_PRECIP, type PrecipState } from '../../config/precip-rules.ts';
import type { SceneWeatherSettings } from '../../config/scene-weather.ts';
import { DEFAULT_WEATHER, type SceneWeatherMode } from '../../config/weather-rules.ts';
import type { GameTime } from '../../core/calendar.ts';
import { createDaylight } from '../../render/sky/daylight.ts';
import { sharedPrecipUniforms } from '../../render/sky/precip-surface.ts';
import { createPrecipView, levelPrecipSource } from '../../render/sky/precip-view.ts';
import { createTornadoFx } from '../../render/sky/tornado-fx.ts';
import { createWeatherFx } from '../../render/sky/weather-fx.ts';
import { sharedWindUniforms, windUniformValues, writeWindUniforms } from '../../render/sky/wind.ts';
import { shadowReceiverBounds } from '../../render/stage/shadow-fit.ts';
import type { Stage } from '../../render/stage/stage.ts';
import { setPrecipIntensity, setPrecipMode, setTornado, setTornadoCount, setTornadoPower, type SimWorld } from '../../sim/sim-world.ts';

const MANUAL: Readonly<Record<SceneWeatherMode, PrecipState>> = {
  clear: { rain: 'none', snow: 'none' }, overcast: { rain: 'none', snow: 'none' },
  rain: { rain: 'medium', snow: 'none' }, storm: { rain: 'heavy', snow: 'none' },
  snow: { rain: 'none', snow: 'medium' },
};

/** 工作台天气设置 → 环境命令；只写变化的项，龙卷不会每帧重建。 */
function applyWeather(world: SimWorld, settings: SceneWeatherSettings | null, mode: SceneWeatherMode, applied: Map<string, unknown>): void {
  const env = world.env;
  const set = <T>(key: string, value: T, apply: (value: T) => void): void => {
    if (applied.get(key) === value) return;
    applied.set(key, value);
    apply(value);
  };
  const precip = settings ? settings.precip : 'manual';
  const manual = settings ?? MANUAL[mode];
  set('rain', manual.rain, rain => setPrecipIntensity(world, 'rain', rain));
  set('snow', manual.snow, snow => setPrecipIntensity(world, 'snow', snow));
  set('precip', precip, value => setPrecipMode(world, value));
  if (!settings) return;
  set('wind', settings.wind, wind => env.wind.setMode(wind));
  set('windPower', settings.windPower, power => env.wind.setPower(power));
  set('windDirection', settings.windDirection, direction => env.wind.setDirection(direction));
  set('rainPower', settings.rainPower, power => { env.rainPower = power; });
  set('snowPower', settings.snowPower, power => { env.snowPower = power; });
  set('tornadoPower', settings.tornadoPower, power => setTornadoPower(world, power));
  set('tornadoCount', settings.tornadoCount, count => setTornadoCount(world, count));
  set('tornado', settings.tornado, on => setTornado(world, on));
}

export function createWorkspaceWeather(stage: Stage, clock: Readonly<GameTime>, world: SimWorld) {
  const env = world.env;
  const windUniforms = sharedWindUniforms();
  // 降水视图把遮雨列写进共享 uniform；离开页面时还原，下一页不会读到已释放的纹理。
  const uniforms = sharedPrecipUniforms();
  const previousColumns = { texture: uniforms.uPrCols.value, width: uniforms.uPrColsW.value, origin: uniforms.uPrColsOrigin.value };
  const particles = createWeatherFx({ scene: stage.scene, weather: {
    ...DEFAULT_WEATHER, clouds: { ...DEFAULT_WEATHER.clouds, count: 0 },
  }, wind: env.wind, cameraDistance: 40 });
  const daylight = createDaylight({ stage, look: AI_CITY_LOOK, clock, openSky: () => 1 });
  // 检视页镜头可俯仰：雨雪按镜头视锥在玩法平面上的范围摆放，相机换成正对该范围的等效相机。
  const view = { x: 0, y: 0, w: 1, h: 1 };
  const camera = { position: { x: 0, y: 0, z: 12 }, fov: stage.camera.fov, aspect: 1 };
  const precip = createPrecipView({
    scene: stage.scene, ...levelPrecipSource(world.level, DEFAULT_PRECIP), camera,
    sky: { scene: stage.scene, base: daylight.base, keyLight: stage.keyLight, hemiLight: stage.hemiLight, rimLight: stage.rimLight,
      grade: stage.postFx.grade, clouds: particles },
    surfaces: () => [stage.scene],
    windSway: (x) => env.wind.sway(x),
  });
  const ground = (x: number): number => precip.columns.at(Math.min(precip.columns.width - 1, Math.max(0, Math.floor(x)))).stop;
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const applied = new Map<string, unknown>();
  let mode: SceneWeatherMode = 'clear';
  let cloud = 0;
  let settings: SceneWeatherSettings | null = null;
  const tornadoViews: ReturnType<typeof createTornadoFx>[] = [];
  return {
    daylight,
    setWeather(next: SceneWeatherMode): void { mode = next; },
    setSettings(next: SceneWeatherSettings): void { settings = next; },
    /** 每帧在模拟推进之前写入设置；之后按环境状态画昼夜 → 降水（唯一写灯光）→ 日月、雾与环境图。 */
    apply(): void { applyWeather(world, settings, mode, applied); },
    update(time: number, dt: number): void {
      writeWindUniforms(windUniforms, windUniformValues(env.wind.rules, env.wind.time, env.wind.state, env.wind.cloudDrift));
      cloud += ((mode === 'overcast' ? .7 : 0) - cloud) * (1 - Math.exp(-dt));
      precip.setOvercast(cloud);
      while (tornadoViews.length < env.tornadoes.length) {
        const fx = createTornadoFx();
        tornadoViews.push(fx); stage.scene.add(fx.root);
      }
      tornadoViews.forEach((fx, index) => fx.update(env.tornadoes[index] ?? null));
      stage.camera.updateMatrixWorld();
      for (const [index, corner] of corners.entries()) {
        corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(stage.camera);
      }
      const visible = shadowReceiverBounds(corners, -1, 1);
      if (visible) {
        Object.assign(view, { x: visible.centerX - visible.halfWidth, y: visible.centerY - visible.halfHeight,
          w: visible.halfWidth * 2, h: visible.halfHeight * 2 });
        Object.assign(camera.position, { x: visible.centerX, y: visible.centerY,
          z: Math.max(12, visible.halfHeight / Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2)) });
        camera.fov = stage.camera.fov;
        camera.aspect = view.w / view.h;
      }
      daylight.update();
      precip.update(view, time, dt, env.precip, env);
      daylight.updateSky(precip.sky.look!);
      precip.rain.root.visible = precip.snow.root.visible = particles.root.visible = visible !== null;
      if (visible) particles.update(view, dt, ground);
    },
    dispose(): void {
      precip.dispose(); daylight.dispose(); particles.dispose();
      for (const fx of tornadoViews) fx.dispose();
      uniforms.uPrCols.value = previousColumns.texture;
      uniforms.uPrColsW.value = previousColumns.width;
      uniforms.uPrColsOrigin.value = previousColumns.origin;
    },
  };
}
