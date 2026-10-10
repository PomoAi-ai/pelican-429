import * as THREE from 'three';
import { NPCS, npcAction } from '../../config/npc.ts';
import type { NpcAction, NpcForm, NpcKind } from '../../config/npc.ts';
import { animateNpc } from './npc-animator.ts';
import { createNpcRig, loadNpcAsset } from './npc-rig.ts';

export async function loadNpcForms(kind: NpcKind): Promise<void> {
  await Promise.all(NPCS[kind].forms.map(form => loadNpcAsset(kind, form.id)));
}

/** 两种身体在全身同时渐变；不改变轮廓高度，也不重复技能和武器。 */
export function createNpcTransformation(kind: NpcKind, initialForm: NpcForm) {
  const root = new THREE.Group();
  const rigs = NPCS[kind].forms.map(form => createNpcRig(kind, form.id));
  const effects = rigs[0]!.effects;
  const weapon = rigs[0]!.weapon;
  const humanMix = { value: initialForm === 'human' ? 1 : 0 };
  const materials: THREE.Material[] = [];
  let targetForm = initialForm;
  let progress = humanMix.value;

  function fadeMaterial<T extends THREE.Material>(material: T, human: boolean): T {
    // 材质属于缓存；只克隆变身实例的材质，贴图与几何继续共享。
    const faded = material.clone();
    faded.onBeforeCompile = shader => {
      shader.uniforms.npcHumanMix = humanMix;
      shader.fragmentShader = `uniform float npcHumanMix;\n${shader.fragmentShader}`.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float formNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
        if (${human ? 'formNoise >= npcHumanMix' : 'formNoise < npcHumanMix'}) discard;
      `);
    };
    faded.customProgramCacheKey = () => `npc-form-${human ? 'human' : 'monster'}`;
    materials.push(faded);
    return faded;
  }

  for (const rig of rigs) {
    root.add(rig.root);
    const human = rig.form === 'human';
    const copies = new Map<THREE.Material, THREE.Material>();
    const depth = fadeMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), human);
    rig.model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const copy = (material: THREE.Material): THREE.Material => {
        let cloned = copies.get(material);
        if (!cloned) { cloned = fadeMaterial(material, human); copies.set(material, cloned); }
        return cloned;
      };
      node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
      node.customDepthMaterial = depth;
    });
    rig.effects.root.removeFromParent();
    rig.weapon.root.visible = rig.weapon === weapon;
  }
  root.add(effects.root, weapon.root);

  function sync(): void {
    humanMix.value = THREE.MathUtils.smoothstep(progress, 0, 1);
    for (const rig of rigs) rig.root.visible = rig.form === 'human' ? progress > 0 : progress < 1;
  }
  sync();

  return {
    root, effects,
    get form() { return targetForm; },
    get transforming() { return progress !== (targetForm === 'human' ? 1 : 0); },
    duration(action: NpcAction) {
      const duration = Math.max(npcAction(kind, action).seconds, ...rigs.map(rig => rig.actions[action].getClip().duration));
      return duration + (action === 'attack' ? .6 : 0);
    },
    setForm(form: NpcForm) { targetForm = form; },
    replay() { progress = targetForm === 'human' ? 0 : 1; sync(); },
    resetPose() {
      for (const rig of rigs) rig.pose.reset();
    },
    sample(action: NpcAction, seconds: number, facing: 1 | -1, frameDt: number, idleFacing: number = 0, modelView?: { yaw: number; pitch: number }) {
      progress = targetForm === 'human' ? Math.min(1, progress + frameDt / .55) : Math.max(0, progress - frameDt / .55);
      sync();
      for (const rig of rigs) {
        animateNpc(rig, action, seconds, frameDt, facing, null, idleFacing);
        if (modelView) rig.root.rotation.set(modelView.pitch, modelView.yaw, 0);
      }
      const time = npcAction(kind, action).loop ? seconds % rigs[0]!.actions[action].getClip().duration : seconds;
      weapon.sample(action, time, rigs.find(rig => rig.form === 'monster')!.model, rigs.find(rig => rig.form === 'human')!.model, humanMix.value);
      // FX 自带横版世界坐标，不随身体旋转。
      effects.root.rotation.y = 0;
    },
    dispose() {
      for (const material of materials) material.dispose();
      for (const rig of rigs) rig.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
