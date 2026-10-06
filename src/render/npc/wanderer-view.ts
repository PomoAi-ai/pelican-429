import * as THREE from 'three';
import { NPCS } from '../../config/npc.ts';
import { TUNING } from '../../config/tuning.ts';
import { lerp } from '../../core/math.ts';
import type { EntityViewFactory } from '../view-registry.ts';
import { animateNpc } from './npc-animator.ts';
import { caption } from './npc-effects.ts';
import { createNpcRig } from './npc-rig.ts';
import { createNpcTransformation } from './npc-transformation.ts';

export const createWandererView: EntityViewFactory = entity => {
  const kind = entity.npc!.kind;
  const transformation = entity.npc!.fromBoss ? createNpcTransformation(kind, 'monster') : null;
  const rig = transformation ? null : createNpcRig(kind, 'human');
  const model = transformation ? transformation.root : rig!.root;
  transformation?.setForm('human');
  const root = new THREE.Group();
  const label = caption(NPCS[kind].name, kind === 'sam' ? '#b9f6ff' : '#beffdb', 3.2);
  label.position.set(0, NPCS[kind].visualHeight + .45, 0);
  root.add(model, label);
  return {
    object: root,
    sync(e, alpha, frameDt) {
      const npc = e.npc!;
      root.position.set(lerp(e.body.prevX, e.body.x, alpha), lerp(e.body.prevY, e.body.y, alpha), 0);
      const seconds = (npc.actionTicks + alpha) * TUNING.sim.step;
      if (transformation) transformation.sample(npc.action, seconds, e.facing, frameDt, npc.idleFacing);
      else animateNpc(rig!, npc.action, seconds, frameDt, e.facing, null, npc.idleFacing);
    },
    dispose() {
      if (transformation) transformation.dispose();
      else rig!.dispose();
      label.material.map!.dispose();
      label.material.dispose();
      root.removeFromParent();
    },
  };
};
