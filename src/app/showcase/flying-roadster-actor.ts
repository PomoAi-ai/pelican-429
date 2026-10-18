import * as THREE from 'three';
import type { ShowcaseCard, ShowcaseEntry } from '../../config/showcase.ts';
import { FLYING_ROADSTER } from '../../config/flying-roadster.ts';
import { TUNING } from '../../config/tuning.ts';
import { createFlyingRoadsterModel } from '../../render/flying-roadster-view.ts';
import type { StageActor } from './stage-actor.ts';

/** 展示场只编排位移与动作，车轮、面罩、尾喷和材质都由游戏模型驱动。 */
export function createFlyingRoadsterActor(card: ShowcaseCard, entry: ShowcaseEntry): StageActor {
  const root = new THREE.Group();
  const elevation = new THREE.Group();
  const inspection = new THREE.Group();
  const vehicle = createFlyingRoadsterModel();
  root.add(elevation); elevation.add(inspection); inspection.add(vehicle.object);
  let time = 0;
  const duration = entry.seconds;
  const sample = (dt: number): void => {
    const progress = time / duration;
    const takeoff = entry.action === 'takeoff';
    const cruise = entry.action === 'cruise';
    const roll = entry.action === 'roll';
    const lift = cruise ? 1 : takeoff ? THREE.MathUtils.smoothstep(time, .2, 1.4) : 0;
    elevation.position.y = cruise ? 1.5 : takeoff ? 1.5 * THREE.MathUtils.smoothstep(time, 1, 4) : 0;
    // 游戏车头朝 +X，检视面板的零度正面朝 +Z。
    inspection.rotation.set(card.modelPitch, card.modelYaw - Math.PI / 2, 0);
    vehicle.object.rotation.y = card.facing === 1 ? 0 : Math.PI;
    vehicle.object.position.x = roll ? 1.5 * Math.sin(progress * Math.PI * 2) : cruise ? 3 * progress - 1.5 : 0;
    // 轮底原点偏向车头，检视俯仰按非对称车身包络补高，起飞高度仍独立保留。
    const yaw = inspection.rotation.y;
    const pitch = Math.sin(card.modelPitch);
    const depth = FLYING_ROADSTER.length * .6 * Math.abs(Math.sin(yaw)) + FLYING_ROADSTER.width / 2 * Math.abs(Math.cos(yaw));
    inspection.position.y = Math.max(0, depth * Math.abs(pitch) - vehicle.object.position.x * Math.sin(yaw) * pitch);
    vehicle.update(dt, {
      lift,
      cruise: cruise ? THREE.MathUtils.smoothstep(time, 0, 1.2) : 0,
      canopy: entry.action === 'canopy' ? THREE.MathUtils.smoothstep(time, .3, 2.3) : 0,
      wheelSpeed: roll ? 1.5 * Math.PI * 2 / duration * Math.cos(progress * Math.PI * 2) * card.facing : 0,
    });
  };
  sample(0);
  return {
    root, anchor: new THREE.Vector3(0, 4.6, 0),
    framing: { x: 0, y: 2.4, width: 11, height: 5 },
    ready: true,
    get complete() { return time >= duration; },
    get progress() { return time / duration; },
    get status() { return `白色飞行车 · ${entry.label} · ${time >= duration ? '演示完成' : '共享游戏模型'}`; },
    update(elapsed) {
      const dt = card.playing ? Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, duration - time) : 0;
      time += dt;
      sample(dt);
    },
    reset() { time = 0; vehicle.reset(); sample(0); },
    dispose() { vehicle.dispose(); root.removeFromParent(); },
  };
}
