import { TUNING } from '../config/tuning.ts';
import type { FacilitySceneId } from '../config/facility-scenes.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import type { Rect } from '../core/math.ts';
import { NEUTRAL_INPUT } from '../entities/pelican-controller.ts';
import { createPelicanRig } from '../render/pelican/pelican-rig.ts';
import { loadEnemyAsset, disposeEnemyAssets } from '../render/enemy-rig.ts';
import type { Stage } from '../render/stage.ts';
import { levelGroundColumns } from '../render/surface-decor-view.ts';
import { createWorldViews } from '../render/world-views.ts';
import { createSimWorld, getPlayer, stepSim } from '../sim/sim-world.ts';
import { createFacilityLevel } from '../world/facility-level.ts';
import { createEntityViews } from './scene-wiring.ts';
import { createWorldPrecip, facilityWeather } from './precip-wiring.ts';

export async function createFacilityEnvironment(stage: Stage, sceneId: FacilitySceneId) {
  const disposers: Array<() => void> = [];
  const dispose = (): void => { for (const release of disposers.splice(0).reverse()) release(); };
  try {
    const level = createFacilityLevel(sceneId);
    disposers.push(() => level.fluid.dispose());
    const weather = facilityWeather(sceneId);
    const world = createSimWorld({
      level, tuning: TUNING, windMode: weather.wind,
      weather: { ...TUNING.render.weather, direction: 1 },
      precipMode: weather.precip, precipState: { rain: weather.rain, snow: weather.snow },
    });
    world.env.rainPower = weather.rainPower;
    world.env.snowPower = weather.snowPower;
    disposers.push(disposeEnemyAssets);
    await Promise.all([...new Set(world.entities.flatMap((entity) => entity.enemy ? [entity.enemy.kind] : []))].map(loadEnemyAsset));
    const ground = levelGroundColumns(level);
    if (sceneId === 'original') stage.addBackdrop({ width: level.map.width, height: level.map.height, surface: ground });
    const worldViews = createWorldViews({
      scene: stage.scene, level, fish: world.fish, ground, wind: world.env.wind,
      pelican: () => getPlayer(world).body, actors: () => world.entities,
    });
    disposers.push(() => worldViews.dispose());
    worldViews.weather.setEnabled(false);
    const precip = createWorldPrecip(stage, level, worldViews);
    disposers.push(() => precip.dispose());
    const rig = createPelicanRig({ scale: TUNING.render.pelicanScale });
    disposers.push(() => rig.dispose());
    const entities = createEntityViews(stage, level, disposers, () => world.entities, worldViews.treeRide, rig);
    const stepper = createFixedStepper(TUNING.sim);
    return {
      update(view: Readonly<Rect>, time: number, dt: number): void {
        const alpha = stepper.advance(dt, () => stepSim(world, NEUTRAL_INPUT));
        worldViews.handleEvents(world.events.drain());
        worldViews.update(view, time, dt, alpha);
        precip.update(view, time, dt, world.env.precip, world.env);
        entities.views.sync(world.entities, alpha, dt);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
