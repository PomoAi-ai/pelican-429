import * as THREE from 'three';
import { HUMAN_MELEE_ATTACK, PLAYER_TRANSFORM } from '../config/player-form.ts';
import type { GrassyAction, GrassyAnimatedVariant, GrassyMotionState } from '../config/grassy.ts';
import type { Entity } from '../entities/entity.ts';
import { createPelicanViewFactory, rideProgress } from './entity-views.ts';
import type { PelicanViewOptions } from './entity-views.ts';
import { createGrassyRig } from './grassy/grassy-rig.ts';
import { animateGrassy } from './grassy/grassy-animator.ts';
import { createGrassyDeath } from './grassy/grassy-death.ts';
import { createPlayerTransformation } from './player-transform.ts';
import type { EntityViewFactory } from './view-registry.ts';
import { createTeleportEffect } from './teleport-effect.ts';
import { caption } from './npc/npc-effects.ts';

/** Both forms use their production rigs and share the pelican view's terrain and platform placement. */
export function createPlayerViewFactory(options: PelicanViewOptions & { windAt(x: number, y: number): number; grassyVariant?: GrassyAnimatedVariant; grassyGait?: 'run' | 'sprint' }): EntityViewFactory {
  const createBird = createPelicanViewFactory(options);
  return (entity) => {
    const human = createGrassyRig(options.grassyVariant ?? 'game');
    const animateDeath = createGrassyDeath(human);
    human.effects.setProjectilePreview(false);
    const bird = createBird(entity);
    const facingYaw = bird.object.getObjectByName('pelican-yaw')!;
    const transformation = createPlayerTransformation(human.root, bird.object);
    const root = new THREE.Group();
    root.name = 'player-forms';
    root.add(bird.object, human.root, transformation.root);
    const invincible = caption(['无敌', 'Invincible'], '#ffe3a0', 2.6, true);
    invincible.name = 'overload-invincible-label';
    invincible.visible = false;
    root.add(invincible);
    const teleport = createTeleportEffect([bird.object, human.root]);
    root.add(teleport.root);
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
    let deathTime = 0;
    let wasDead = false;

    function animateHuman(e: Entity, alpha: number, frameDt: number): void {
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
      if (combat.action === 'keyboard_smash' && e.attack?.def.id === HUMAN_MELEE_ATTACK.id) {
        const { startup, active, recovery } = e.attack.def;
        const ticks = e.attack.elapsed + alpha;
        const activeEnd = startup + active;
        const first = combat.smashSide === 0;
        // Reverse the authored second recovery to draw directly into the opposite strike, without replaying strike one.
        const progress = ticks < startup ? first ? ticks / startup * 0.3 : 1 - ticks / startup * 0.24
          : ticks < activeEnd ? first ? 0.3 + (ticks - startup) / active * 0.13 : 0.76 - (ticks - startup) / active * 0.16
          : first ? 0.5 : 0.6;
        const duration = human.actions.keyboard_smash.getClip().duration;
        const clipTime = progress * duration;
        const weight = THREE.MathUtils.smoothstep((ticks - activeEnd) / recovery, 0, 1);
        animateGrassy(human, 'keyboard_smash', clipTime, frameDt, air, motion, { side: combat.smashSide, recovery: weight });
      } else if (combat.action !== null) animateGrassy(human, combat.action, (combat.ticks + alpha) * step, frameDt, air, motion);
      else animateGrassy(human, action, action === 'idle' ? time : sample, frameDt, air);

      if (p.ride.mode === 'mounting' || p.ride.mode === 'dismounting') {
        const progress = rideProgress(p.ride, options.tuning, alpha);
        const size = p.ride.mode === 'mounting' ? progress : 1 - progress;
        human.cycle.root.scale.copy(bicycleScale).multiplyScalar(size);
      } else human.cycle.root.scale.copy(bicycleScale);
      // The simulation already supplies jump/flight altitude; retain authored limb poses without adding it twice.
      if (!e.body.onGround) human.root.position.y -= animatedRoot.position.y - restRootY;
    }

    return {
      object: root,
      sync(e, alpha, frameDt): void {
        transformation.restore();
        const dead = e.health!.hp <= 0;
        bird.sync(e, alpha, dead ? 0 : frameDt);
        const p = e.pelican!;
        human.root.position.copy(bird.object.position);
        // 两种形态共用已缓动的转身角；人的模型朝前轴比鹈鹕偏转九十度。
        human.root.rotation.set(0, facingYaw.rotation.y + Math.PI / 2, bird.object.rotation.z, 'ZYX');
        human.root.visible = p.form === 'human';
        bird.object.visible = p.form === 'pelican';
        if (dead) {
          deathTime = wasDead ? deathTime + frameDt : 0;
          if (human.root.visible) animateDeath(deathTime, frameDt, p.inWater, e.facing);
          else {
            const fall = THREE.MathUtils.smoothstep(deathTime, .15, p.inWater ? 1.05 : .78);
            bird.object.rotation.z += e.facing * fall * Math.PI * .48;
            bird.object.position.y += .42 * fall;
          }
        } else {
          if (wasDead) {
            human.motionPose.reset();
            motionTime = flightTime = airborneTime = 0;
            landingTime = 1;
            wasFlying = false;
            wasGrounded = e.body.onGround;
          }
          if (human.root.visible || p.transformTicks >= 0) animateHuman(e, alpha, frameDt);
        }
        wasDead = dead;
        invincible.visible = !dead && e.health!.overloadInvulnTicks > 0;
        invincible.position.copy(bird.object.position);
        invincible.position.y += e.body.height + .35;
        invincible.position.z = .9;
        transformation.root.position.copy(bird.object.position);
        transformation.root.rotation.z = bird.object.rotation.z;
        const progress = p.transformTicks < 0 ? -1 : (p.transformTicks + alpha) / PLAYER_TRANSFORM.durationTicks;
        transformation.update(progress, p.transformFrom);
        teleport.update(e.teleport, alpha, step, e.body.height, e.body.halfWidth);
      },
      dispose(): void {
        invincible.material.map!.dispose();
        invincible.material.dispose();
        teleport.dispose();
        transformation.dispose();
        human.dispose();
        bird.dispose();
        root.removeFromParent();
      },
    };
  };
}
