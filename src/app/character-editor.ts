import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CharacterAppearance } from '../config/character-appearance.ts';
import type { GrassyAction } from '../config/grassy.ts';
import { createGrassyRig, type GrassyRig } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import type { CharacterPreview } from '../ui/character-editor.ts';

/** 宿主先加载共享角色资产；预览只拥有自己的 renderer 和 rig，不销毁游戏的资源缓存。 */
export async function createCharacterPreview(parent: HTMLElement, appearance: CharacterAppearance, onError: (error: unknown) => void, prepare?: (renderer: THREE.WebGLRenderer) => Promise<void>): Promise<CharacterPreview> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  let rig: GrassyRig;
  try { await prepare?.(renderer); rig = createGrassyRig('game', undefined, appearance); }
  catch (error) { renderer.dispose(); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
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
  let previous = performance.now();
  let frame = 0;
  let disposed = false;
  const resize = new ResizeObserver(() => {
    const { width, height } = parent.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height); camera.updateProjectionMatrix();
  });
  resize.observe(parent);
  const draw = (now: number): void => {
    if (disposed) return;
    try {
      const dt = Math.min((now - previous) / 1000, .05); previous = now; age += dt;
      const duration = rig.actions[action].getClip().duration;
      for (const { node, visible } of equipment) node.visible = visible;
      animateGrassy(rig, action, age % (duration + (action === 'keyboard_smash' ? .8 : 0)), dt, null);
      if (!equipmentVisible) for (const { node } of equipment) node.visible = false;
      controls.update(); renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    } catch (error) { onError(error); }
  };
  frame = requestAnimationFrame(draw);
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
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); rig.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
