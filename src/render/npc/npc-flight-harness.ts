import * as THREE from 'three';
import type { TextureTier } from '../character-model.ts';
import { createGrassyFlightHarness } from '../grassy/grassy-rig.ts';
import { createThruster } from '../grassy/grassy-particles.ts';
import type { NpcMotion } from './npc-pose.ts';

/** 背带跟随躯干，推进器承担升力，双手保持握杖与施法。 */
export function createNpcFlightHarness(model: THREE.Group, tier: TextureTier) {
  const mount = new THREE.Group();
  mount.position.set(0, .18, -.02);
  mount.scale.set(1.15, .95, 1.2);
  const harness = createGrassyFlightHarness(tier);
  mount.add(harness);
  model.getObjectByName('spine')!.add(mount);
  const jets = ['fx_pack_L', 'fx_pack_R'].map(name => createThruster(harness.getObjectByName(name)!));
  for (const jet of jets) jet.update(0, 0);
  let time = 0;
  let thrust = 0;
  return {
    update(motion: NpcMotion | null, dt: number) {
      time += dt;
      const target = motion !== null && motion.flying ? 1 + Math.abs(motion.vx) / 12 + Math.max(0, motion.vy) / 9 : 0;
      thrust = THREE.MathUtils.damp(thrust, target, 18, dt);
      for (const jet of jets) jet.update(time, thrust < .01 ? 0 : thrust);
    },
    dispose() {
      // 只释放新建尾焰；背包材质与几何属于共享主角资产。
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const jet of jets) jet.root.traverse(node => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
          geometries.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      mount.removeFromParent();
    },
  };
}
