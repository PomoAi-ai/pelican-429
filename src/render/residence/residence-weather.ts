import * as THREE from 'three';
import { DEFAULT_PRECIP, resolvePrecipState, type PrecipState } from '../../config/precip-rules.ts';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import type { SceneWeatherSettings } from '../../config/scene-weather.ts';
import { TUNING } from '../../config/tuning.ts';
import { DEFAULT_WEATHER, type SceneWeatherMode } from '../../config/weather-rules.ts';
import type { WorldTime } from '../../core/calendar.ts';
import { definitionColliderSection, type DefinitionCollider } from '../../physics/definition-collision.ts';
import type { Body } from '../../physics/body.ts';
import { createTornado, stepTornado, tornadoForce, TORNADO_RULES, type TornadoState } from '../../world/tornado.ts';
import type { TileQuery } from '../../world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_STONE } from '../../world/tile-types.ts';
import { createWindController, type WindController } from '../../world/wind.ts';
import { createPrecipController } from '../sky/precip.ts';
import { precipSkyLook } from '../sky/precip-sky.ts';
import { createPrecipSurfacePatcher, sharedPrecipUniforms } from '../sky/precip-surface.ts';
import { createRainFx } from '../sky/rain-fx.ts';
import { shadowReceiverBounds } from '../stage/shadow-fit.ts';
import { createSnowFx } from '../sky/snow-fx.ts';
import type { Stage } from '../stage/stage.ts';
import { createWeatherFx } from '../sky/weather-fx.ts';
import { createTornadoFx } from '../sky/tornado-fx.ts';
import { sharedWindUniforms, windUniformValues, writeWindUniforms } from '../sky/wind.ts';

const PRECIP: Readonly<Record<SceneWeatherMode, PrecipState>> = {
  clear: { rain: 'none', snow: 'none' }, overcast: { rain: 'none', snow: 'none' },
  rain: { rain: 'medium', snow: 'none' }, storm: { rain: 'heavy', snow: 'none' },
  snow: { rain: 'none', snow: 'medium' },
};

/** 从真实实体取顶面，保留半砖高度；负坐标按纹理原点映射。 */
export function residenceWeatherRoofs(solids: readonly DefinitionCollider[], origin: number, width: number): Float32Array {
  const roofs = new Float32Array(width);
  for (const solid of solids) {
    const left = Math.max(0, Math.floor(Math.min(...solid.points.map(point => point[0])) - origin));
    const right = Math.min(width - 1, Math.ceil(Math.max(...solid.points.map(point => point[0])) - origin) - 1);
    for (let column = left; column <= right; column++) {
      const x = origin + column;
      const range = definitionColliderSection(solid, 0, x + .001, x + .999);
      if (range) roofs[column] = Math.max(roofs[column]!, range[1]);
    }
  }
  return roofs;
}

/** 住宅只装配游戏已有风场与雨雪；遮雨数据来自可编辑住宅当前的碰撞实体。 */
export function createResidenceWeather(stage: Stage, solids: () => readonly DefinitionCollider[],
  bounds: { readonly width: number; readonly minX: number;
    readonly precipColumns?: (columns: Float32Array) => void;
    readonly wind?: WindController } = RESIDENCE_WORLD) {
  const wind = bounds.wind ?? createWindController(DEFAULT_WEATHER, 'breeze');
  const windUniforms = sharedWindUniforms();
  const controller = createPrecipController(DEFAULT_PRECIP);
  const uniforms = sharedPrecipUniforms();
  const surfaces = createPrecipSurfacePatcher(uniforms);
  const previousColumns = { texture: uniforms.uPrCols.value, width: uniforms.uPrColsW.value, origin: uniforms.uPrColsOrigin.value };
  const columns = new Float32Array(bounds.width * 4);
  const texture = new THREE.DataTexture(columns, bounds.width, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  uniforms.uPrCols.value = texture;
  uniforms.uPrColsW.value = bounds.width;
  uniforms.uPrColsOrigin.value = bounds.minX;
  const rain = createRainFx({ rules: DEFAULT_PRECIP, emitters: new Float32Array() });
  const snow = createSnowFx(DEFAULT_PRECIP);
  const particles = createWeatherFx({ scene: stage.scene, weather: {
    ...DEFAULT_WEATHER, clouds: { ...DEFAULT_WEATHER.clouds, count: 0 },
  }, wind, cameraDistance: 40 });
  stage.scene.add(rain.root, snow.root);
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let mode: SceneWeatherMode = 'clear';
  let cloud = 0;
  let frame = 0;
  let settings: SceneWeatherSettings | null = null;
  let roofHeight = 1;
  const tornadoes: TornadoState[] = [];
  const tornadoViews: ReturnType<typeof createTornadoFx>[] = [];
  const columnIndex = (x: number): number => Math.min(bounds.width - 1, Math.max(0, Math.floor(x - bounds.minX))) * 4;
  const roof = (x: number): number => columns[columnIndex(x)]!;
  const ground = (x: number): number => columns[columnIndex(x) + 1]!;
  // 龙卷逻辑只查询列顶；这里接真实半砖屋顶，不另造一张填满砖块的世界。
  const roofMap: TileQuery = {
    width: bounds.width, get height() { return roofHeight; }, registry: DEFAULT_TILES,
    inBounds: (x, y) => x >= 0 && x < bounds.width && y >= 0 && y < roofHeight,
    collisionAt: (x, y) => y < roof(x + bounds.minX) ? 'solid' : 'none',
    get: (x, y) => y < roof(x + bounds.minX) ? TILE_STONE : TILE_AIR,
    shapeAt: () => 0,
  };
  const updateTornadoes = (dt: number, external: readonly TornadoState[] | undefined): void => {
    const count = external ? external.length : settings?.tornado ? settings.tornadoCount : 0;
    while (tornadoViews.length < count) {
      const view = createTornadoFx();
      tornadoViews.push(view); stage.scene.add(view.root);
    }
    if (!external) {
      tornadoes.splice(count);
      while (tornadoes.length < count) {
        const i = tornadoes.length;
        const offset = Math.ceil(i / 2) * 10 * (i % 2 === 0 ? 1 : -1);
        tornadoes.push(createTornado(roofMap, stage.camera.position.x - bounds.minX + offset, settings!.tornadoPower, i * 2.4));
      }
      for (const tornado of tornadoes) {
        tornado.power = settings!.tornadoPower;
        stepTornado(tornado, roofMap, dt);
        tornado.y = roof(tornado.x + bounds.minX);
      }
    }
    tornadoViews.forEach((view, index) => {
      if (external) view.update(external[index] ?? null);
      else {
        const tornado = tornadoes[index];
        view.update(tornado ? { ...tornado, x: tornado.x + bounds.minX } : null);
      }
    });
  };
  return {
    wind,
    setWeather(next: SceneWeatherMode): void { mode = next; },
    setSettings(next: SceneWeatherSettings): void {
      settings = next;
      if (wind.mode !== next.wind) wind.setMode(next.wind);
      wind.setPower(next.windPower);
      wind.setDirection(next.windDirection);
    },
    airWind(body: Body): number {
      return body.y + body.height >= roof(body.x)
        ? wind.sway(body.x) * TUNING.player.airWindSpeed * Math.max(0, wind.state.scale - 1) : 0;
    },
    applyToBody(body: Body, dt: number): void {
      if (body.y + body.height < roof(body.x)) return;
      let forceX = 0; let forceY = 0;
      for (const tornado of tornadoes) {
        const force = tornadoForce(tornado, body.x - bounds.minX, body.y + body.height * .5);
        forceX += force.x; forceY += force.y;
      }
      if (forceY <= 0) return;
      const maxSpeed = TORNADO_RULES.maxSpeed * Math.sqrt(settings!.tornadoPower);
      body.vx = THREE.MathUtils.clamp(body.vx + forceX * dt, -maxSpeed, maxSpeed);
      body.vy = Math.min(body.vy + forceY * dt, maxSpeed);
      if (body.vy > 0) body.onGround = false;
    },
    update(time: number, dt: number, world: WorldTime,
      environment?: { readonly precip: PrecipState; readonly tornadoes: readonly TornadoState[] }) {
      if (!bounds.wind) wind.update(time);
      writeWindUniforms(windUniforms, windUniformValues(wind.rules, wind.time, wind.state, wind.cloudDrift));
      const precip = environment ? environment.precip
        : settings ? resolvePrecipState(DEFAULT_PRECIP, settings.precip, time, settings) : PRECIP[mode];
      controller.update(time, dt, precip, wind.sway(stage.camera.position.x), settings ?? { rainPower: 1, snowPower: 1 });
      cloud += ((mode === 'overcast' ? .7 : 0) - cloud) * (1 - Math.exp(-dt));
      const visual = controller.visual;
      const look = precipSkyLook({ ...visual, overcast: Math.max(visual.overcast, cloud),
        dim: Math.max(visual.dim, cloud * .4), fog: Math.max(visual.fog, cloud * .1) }, controller.lightning.flash);
      if (frame++ % 15 === 0) {
        if (bounds.precipColumns) bounds.precipColumns(columns);
        else {
          const roofs = residenceWeatherRoofs(solids(), bounds.minX, bounds.width);
          for (let i = 0; i < roofs.length; i++) columns.set([roofs[i]!, roofs[i]!, 1, 0], i * 4);
        }
        roofHeight = 1;
        for (let i = 0; i < bounds.width; i++) roofHeight = Math.max(roofHeight, Math.ceil(columns[i * 4]!) + 1);
        texture.needsUpdate = true;
        surfaces.patchTree(stage.scene);
      }
      uniforms.uPrRipple.value = visual.splash;
      uniforms.uPrWet.value = controller.wetness;
      uniforms.uPrSnow.value = controller.snowCover;
      updateTornadoes(dt, environment?.tornadoes);
      stage.camera.updateMatrixWorld();
      for (const [index, corner] of corners.entries()) {
        corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(stage.camera);
      }
      const visibleBounds = shadowReceiverBounds(corners, -1, 1);
      rain.root.visible = snow.root.visible = particles.root.visible = visibleBounds !== null;
      if (visibleBounds) {
        const view = { x: visibleBounds.centerX - visibleBounds.halfWidth, y: visibleBounds.centerY - visibleBounds.halfHeight,
          w: visibleBounds.halfWidth * 2, h: visibleBounds.halfHeight * 2 };
        const camera = { position: { x: visibleBounds.centerX, y: visibleBounds.centerY,
          z: Math.max(12, visibleBounds.halfHeight / Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2)) },
          fov: stage.camera.fov, aspect: view.w / view.h };
        const brightness = look.particle * (.35 + .65 * world.daylight);
        rain.update({ time, view, camera, density: visual.rain, speed: visual.rainSpeed,
          length: visual.rainLength, width: visual.rainWidth, fall: controller.rainFall,
          drift: controller.rainDrift, splash: visual.splash, drip: 0, brightness });
        snow.update({ time, camera, density: visual.snow, size: visual.flakeSize, fall: controller.snowFall,
          drift: controller.snowDrift, big: Math.min(1, visual.snow), brightness });
        particles.update(view, dt, ground);
      }
      return look;
    },
    dispose(): void {
      rain.dispose(); snow.dispose(); particles.dispose(); texture.dispose();
      for (const view of tornadoViews) view.dispose();
      uniforms.uPrCols.value = previousColumns.texture;
      uniforms.uPrColsW.value = previousColumns.width;
      uniforms.uPrColsOrigin.value = previousColumns.origin;
      uniforms.uPrRipple.value = 0;
      uniforms.uPrWet.value = uniforms.uPrSnow.value = 0;
    },
  };
}
