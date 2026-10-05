import { LUMA_ACTIONS } from '../../config/luma.ts';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { TUNING } from '../../config/tuning.ts';
import type { LumaAction } from '../../config/luma.ts';
import { animateLumaParticles } from './luma-rig.ts';
import type { LumaRig } from './luma-rig.ts';

const DURATION = Object.fromEntries(LUMA_ACTIONS.map((action) => [action.id, action.seconds])) as Record<LumaAction, number>;
const ULTIMATE_CHARGE = PHOTON_ULTIMATE.chargeTicks * TUNING.sim.step;

/** 动作由整团光的位移和粒子聚散表达，根节点留给游戏或展示场摆放。 */
export function animateLuma(rig: LumaRig, action: LumaAction, time: number): void {
  const cycle = time / DURATION[action] * Math.PI * 2;
  let x = 0;
  let y = 0.045 * Math.sin(cycle);
  let tilt = 0.06 * Math.sin(cycle);
  let spread = 1;
  let energy = 1 + 0.12 * Math.sin(cycle);
  switch (action) {
    case 'idle':
      break;
    case 'guide':
      x = 0.55 * Math.sin(cycle);
      y = 0.09 * Math.sin(cycle * 2);
      tilt = -0.16 * Math.cos(cycle);
      energy = 1.15;
      break;
    case 'wait':
      y = 0.02 * Math.sin(cycle);
      spread = 0.75;
      energy = 0.8 + 0.12 * Math.sin(cycle);
      break;
    case 'alert':
      energy = 1.1 + 0.8 * Math.sin(cycle * 2) ** 4;
      spread = 0.9 + 0.16 * Math.sin(cycle * 2) ** 2;
      break;
    case 'celebrate':
      x = 0.16 * Math.sin(cycle);
      y = 0.12 * (1 - Math.cos(cycle * 2));
      spread = 1.15 + 0.25 * Math.sin(cycle) ** 2;
      energy = 1.2;
      break;
    case 'ultimate': {
      const charge = Math.min(1, time / ULTIMATE_CHARGE);
      const burst = Math.exp(-Math.max(0, time - ULTIMATE_CHARGE) * 7);
      y = 0.06 * Math.sin(cycle * 3);
      spread = time < ULTIMATE_CHARGE ? 1 - charge * 0.62 : 1 + burst * 2.1;
      energy = time < ULTIMATE_CHARGE ? 1.2 + charge * charge * 3 : 1.5 + burst * 5;
      break;
    }
  }
  rig.motion.position.set(x, y, 0);
  rig.particles.rotation.z = tilt;
  animateLumaParticles(rig, time * 1.5, spread, energy, action === 'alert');
}
