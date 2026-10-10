import type { GrassyAction, GrassyMotionState } from '../../config/grassy.ts';
import type { Tuning } from '../../config/tuning.ts';
import type { Entity } from '../../entities/entity.ts';
import { rideProgress } from '../entity-views.ts';
import { animateGrassy } from './grassy-animator.ts';
import { animateGrassyCombat } from './grassy-combat-animator.ts';
import type { GrassyRig } from './grassy-rig.ts';

/** 正式游戏与透视场共用移动、战斗及上下车的动画时钟。 */
export function createGrassyPlayerAnimator(human: GrassyRig, entity: Entity,
  options: { tuning: Tuning; windAt: (x: number, y: number) => number; grassyGait?: 'run' | 'sprint' }) {
  const bicycleScale = human.cycle.root.scale.clone();
  const animatedRoot = human.root.getObjectByName('root')!;
  const restRootY = animatedRoot.position.y;
  const step = options.tuning.sim.step;
  let motionTime = 0;
  let flightTime = 0;
  let airborneTime = 0;
  let landingTime = 1;
  let wasFlying = false;
  let wasGrounded = entity.body.onGround;

  function update(e: Entity, alpha: number, frameDt: number): void {
    const p = e.pelican!;
    const time = (p.stateTicks + alpha) * step;
    const flying = p.flightMode !== 'none';
    motionTime += frameDt;
    flightTime = flying ? wasFlying ? flightTime + frameDt : 0 : 0;
    airborneTime = e.body.onGround ? 0 : wasGrounded ? 0 : airborneTime + frameDt;
    landingTime = e.body.onGround && !wasGrounded ? 0 : landingTime + frameDt;
    wasFlying = flying;
    wasGrounded = e.body.onGround;
    let action: GrassyAction = 'idle';
    let sample = motionTime;
    if (p.ride.mode !== 'off') {
      action = 'ride';
      sample = (p.ride.ticks + alpha) * step;
    } else if (flying) {
      const fastSpeed = (options.tuning.player.flight.humanSpeed + options.tuning.player.flight.humanFastSpeed) / 2;
      action = flightTime < 1.2 ? 'takeoff' : Math.abs(e.body.vx) > fastSpeed ? 'fly_fast' : Math.abs(e.body.vx) > 0.5 ? 'fly_forward' : 'hover';
      sample = flightTime;
    } else if (!e.body.onGround) {
      action = 'jump';
      const progress = e.body.vy > 0 ? 0.28 + Math.min(1, airborneTime / 0.35) * 0.18
        : 0.54 + Math.min(1, airborneTime / 0.5) * 0.2;
      sample = progress * human.actions.jump.getClip().duration;
    } else if (Math.abs(e.body.vx) > 0.08) {
      const sprintSpeed = (options.tuning.player.walkSpeed + options.tuning.player.runSpeed) / 2;
      action = p.moveGear === 'run' ? options.grassyGait ?? (Math.abs(e.body.vx) > sprintSpeed ? 'sprint' : 'run') : 'walk';
    }
    else if (landingTime < 0.36) {
      action = 'land';
      sample = 0.84 + landingTime;
    }
    const motion: GrassyMotionState | null = action === 'idle' || action === 'ride' ? null : { action, time: sample };
    const combat = p.humanCombat;
    const air = {
      forward: (e.body.vx / options.tuning.player.runSpeed - options.windAt(e.body.x, e.body.y + e.body.height)) * e.facing,
      lift: -e.body.vy / Math.sqrt(2 * options.tuning.physics.gravity * options.tuning.player.jumpHeight),
    };
    if (!animateGrassyCombat(human, e, alpha, frameDt, air, motion, step)) animateGrassy(human, action, action === 'idle' ? time : sample, frameDt, air);

    if (combat.action !== null && action === 'ride') human.cycle.update(true, sample);
    if (p.ride.mode === 'mounting' || p.ride.mode === 'dismounting') {
      const progress = rideProgress(p.ride, options.tuning, alpha);
      const size = p.ride.mode === 'mounting' ? progress : 1 - progress;
      human.cycle.root.scale.copy(bicycleScale).multiplyScalar(size);
    } else human.cycle.root.scale.copy(bicycleScale);
    // The simulation already supplies jump/flight altitude; retain authored limb poses without adding it twice.
    if (!e.body.onGround) human.root.position.y -= animatedRoot.position.y - restRootY;
  }

  return {
    reset(e: Entity): void {
      human.motionPose.reset();
      motionTime = flightTime = airborneTime = 0;
      landingTime = 1;
      wasFlying = false;
      wasGrounded = e.body.onGround;
      human.cycle.root.scale.copy(bicycleScale);
      human.cycle.update(false, 0);
    },
    update,
  };
}
