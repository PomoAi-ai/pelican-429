import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CharacterAppearance } from '../../config/character-appearance.ts';
import type { GrassyAction } from '../../config/grassy.ts';
import { createGrassyRig, type GrassyRig } from '../../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../../render/grassy/grassy-animator.ts';
import type { CharacterPreview } from '../../ui/panels/character-editor.tsx';
import { createViewLoop } from '../shell/view-loop.ts';
import { readPageParams } from '../shell/page-context.ts';
import { TUNING } from '../../config/tuning.ts';
import { createRenderer } from '../../render/stage/stage.ts';

/** 宿主先加载共享角色资产；预览只拥有自己的次级 renderer（不绑定角色贴图）和 rig，不销毁游戏的资源缓存。 */
export async function createCharacterPreview(parent: HTMLElement, appearance: CharacterAppearance, onError: (error: unknown) => void, prepare?: () => Promise<void>): Promise<CharacterPreview> {
  const renderer = createRenderer('studio', TUNING, readPageParams().debug);
  let rig: GrassyRig;
  try { await prepare?.(); rig = createGrassyRig('game', undefined, appearance); }
  catch (error) { renderer.dispose(); throw error; }
  parent.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f5f7fa');
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 100);
  scene.add(rig.root, new THREE.HemisphereLight('#ffffff', '#b2bac9', 2));
  const key = new THREE.DirectionalLight('#ffffff', 2.8); key.position.set(-3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight('#d8e9ff', 1.2); fill.position.set(4, 3, -4); scene.add(fill);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.minDistance = 1.2; controls.maxDistance = 14;
  controls.minPolarAngle = .3; controls.maxPolarAngle = Math.PI * .7;
  controls.target.set(0, 1.6, 0); camera.position.set(0, 1.6, 6.7); controls.update();
  const equipment = ['FlightHarness', 'FlightCuff_L', 'FlightCuff_R', 'KeyboardWeapon', 'grassy-attack-effects'].map(name => {
    const node = rig.root.getObjectByName(name)!;
    return { node, visible: node.visible };
  });
  let equipmentVisible = true;
  let action: GrassyAction = 'idle';
  let age = 0;
  const resize = new ResizeObserver(() => {
    const { width, height } = parent.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height); camera.updateProjectionMatrix();
  });
  resize.observe(parent);
  const loop = createViewLoop(dt => {
    age += dt;
    const duration = rig.actions[action].getClip().duration;
    for (const { node, visible } of equipment) node.visible = visible;
    animateGrassy(rig, action, age % (duration + (action === 'keyboard_smash' ? .8 : 0)), dt, null);
    if (!equipmentVisible) for (const { node } of equipment) node.visible = false;
    controls.update(); renderer.render(scene, camera);
  }, onError);
  loop.start();
  return {
    applyAppearance: value => rig.applyAppearance(value),
    setAction(value) { action = value; age = 0; rig.motionPose.reset(); },
    setView(view) {
      const close = view === 'face';
      const distance = close ? 2.3 : view === 'game' ? 11 : action === 'ride' ? 8 : 6.7;
      const center = close ? 2.6 : 1.6;
      controls.target.set(0, center, 0);
      camera.position.set(view === 'side' ? distance : 0, center, view === 'side' ? 0 : view === 'back' ? -distance : distance);
      controls.update();
    },
    setEquipmentVisible(value) { equipmentVisible = value; },
    dispose() {
      loop.stop(); resize.disconnect(); controls.dispose(); rig.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
