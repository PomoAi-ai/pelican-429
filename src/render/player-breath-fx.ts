import * as THREE from 'three';
import type { Entity } from '../entities/entity.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import type { FluidQuery } from '../world/fluid-map.ts';

/** 气泡只读水体和氧气；不会给角色施力或改变耗氧速度。 */
export function createPlayerBreathFx(fluid: FluidQuery) {
  const geometry = new THREE.RingGeometry(.72, 1, 16);
  const material = new THREE.MeshBasicMaterial({
    color: '#c8f6ff', transparent: true, opacity: .65, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const root = new THREE.InstancedMesh(geometry, material, 48);
  root.name = 'player-breath-bubbles';
  root.count = 0;
  root.frustumCulled = false;
  root.renderOrder = 3;
  root.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const bubbles: Array<{ x: number; y: number; age: number; size: number; phase: number }> = [];
  const motion = new THREE.Object3D();
  let timer = 0;
  return {
    root,
    update(player: Entity | undefined, dt: number, alpha: number) {
      const p = player?.pelican;
      if (player && p && player.health!.hp > 0) {
        const b = player.body;
        const noseY = b.y + b.height * .9;
        const submerged = waterSpanInColumn(fluid, Math.floor(b.x), noseY, noseY + .05) > 0;
        if (submerged) {
          const ratio = p.oxygenTicks / p.oxygenMaxTicks;
          const interval = ratio === 0 ? .12 : ratio < .25 ? .25 : .7;
          timer = Math.min(timer, interval) - dt;
          if (timer <= 0 && dt > 0) {
            const x = b.prevX + (b.x - b.prevX) * alpha + player.facing * b.halfWidth * .45;
            const y = b.prevY + (b.y - b.prevY) * alpha + b.height * .9;
            for (let i = 0; i < (ratio < .25 ? 3 : 2) && bubbles.length < 48; i++) {
              bubbles.push({ x: x + (Math.random() - .5) * .1, y: y - i * .07,
                age: 0, size: .035 + Math.random() * .04, phase: Math.random() * Math.PI * 2 });
            }
            timer = interval;
          }
        } else timer = 0;
      } else timer = 0;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i]!;
        bubble.age += dt;
        bubble.y += dt * (.65 + bubble.age * .3);
        bubble.x += Math.sin(bubble.phase + bubble.age * 5) * dt * .12;
        // 按真实水格收掉气泡，避免越过水面或穿出岸壁后仍漂浮。
        if (bubble.age >= 2.4 || waterSpanInColumn(fluid, Math.floor(bubble.x), bubble.y, bubble.y + .02) === 0) {
          bubbles.splice(i, 1);
        }
      }
      bubbles.forEach((bubble, i) => {
        motion.position.set(bubble.x, bubble.y, .45);
        motion.scale.setScalar(bubble.size * Math.min(1, bubble.age * 12) * Math.min(1, (2.4 - bubble.age) * 4));
        motion.updateMatrix();
        root.setMatrixAt(i, motion.matrix);
      });
      root.count = bubbles.length;
      root.visible = bubbles.length > 0;
      root.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
      root.dispose();
    },
  };
}
