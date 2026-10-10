import * as THREE from 'three';
import { PLAYER_TRANSFORM } from '../config/player-form.ts';
import type { GrassyAnimatedVariant } from '../config/grassy.ts';
import { DEFAULT_CHARACTER_APPEARANCE, type CharacterAppearance } from '../config/character-appearance.ts';
import { createPelicanViewFactory } from './entity-views.ts';
import type { PelicanViewOptions } from './entity-views.ts';
import { createGrassyRig } from './grassy/grassy-rig.ts';
import { createGrassyPlayerAnimator } from './grassy/grassy-player-animator.ts';
import { createGrassyDeath } from './grassy/grassy-death.ts';
import { createPlayerTransformation } from './player-transform.ts';
import type { EntityViewFactory } from './view-registry.ts';
import { createTeleportEffect } from './teleport-effect.ts';
import { caption } from './npc/npc-effects.ts';

/** Both forms use their production rigs and share the pelican view's terrain and platform placement. */
export function createPlayerViewFactory(options: PelicanViewOptions & { grassyVariant?: GrassyAnimatedVariant; grassyGait?: 'run' | 'sprint'; appearance?: () => CharacterAppearance; modelView?: () => { yaw: number; pitch: number } }): EntityViewFactory {
  const createBird = createPelicanViewFactory(options);
  return (entity) => {
    let appearance = options.appearance ? options.appearance() : DEFAULT_CHARACTER_APPEARANCE;
    const human = createGrassyRig(options.grassyVariant ?? 'game', undefined, appearance);
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
    const humanAnimator = createGrassyPlayerAnimator(human, entity, options);
    const step = options.tuning.sim.step;
    let deathTime = 0;
    let wasDead = false;

    return {
      object: root,
      sync(e, alpha, frameDt): void {
        const nextAppearance = options.appearance ? options.appearance() : appearance;
        if (nextAppearance !== appearance) { human.applyAppearance(nextAppearance); appearance = nextAppearance; }
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
          if (wasDead) humanAnimator.reset(e);
          if (human.root.visible || p.transformTicks >= 0) humanAnimator.update(e, alpha, frameDt);
        }
        wasDead = dead;
        if (options.modelView) {
          const view = options.modelView();
          // 检视只转身体；先于变身羽毛采样，保持两种形态的附着点一致。
          human.root.rotation.x = view.pitch;
          human.root.rotation.y = view.yaw;
          bird.object.rotation.x = view.pitch;
          bird.object.rotation.y = view.yaw - Math.PI / 2 - facingYaw.rotation.y;
        }
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
