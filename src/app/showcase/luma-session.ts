import * as THREE from 'three';
import { LUMA, LUMA_ACTIONS } from '../../config/luma.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createLumaRig } from '../../render/luma/luma-rig.ts';
import { animateLuma } from '../../render/luma/luma-animator.ts';
import { createLumaTrail } from '../../render/luma/luma-trail.ts';
import { createStageView } from '../../render/stage.ts';
import type { InputFrame } from '../../sim/sim-world.ts';

/** 角色形状与动作来自共享资产，这里只负责检视环境、镜头和播放时间。 */
export function createLumaShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  const rig = createLumaRig();
  const trail = createLumaTrail(stage.scene);
  const emitter = new THREE.Vector3();
  rig.root.position.y = LUMA.hoverHeight;
  stage.scene.add(rig.root);
  const floorGeometry = new THREE.CircleGeometry(3, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#728d91', roughness: 0.92 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stage.scene.add(floor);
  const screen = new THREE.Vector3();
  let action = selectedAction();
  let time = 0;
  let revision = card.revision;
  let width = 0;
  let height = 0;
  let disposed = false;

  function selectedAction() {
    const entry = showcaseEntry(card.entryId);
    return LUMA_ACTIONS.find((item) => item.id === entry.action)!;
  }

  function reset(): void {
    action = selectedAction();
    time = 0;
    revision = card.revision;
    const underground = card.environment === 'underground';
    stage.scene.background = new THREE.Color(underground ? '#0c1b2a' : '#9ab4bd');
    floorMaterial.color.set(underground ? '#233443' : '#728d91');
    stage.hemiLight.intensity = TUNING.render.hemi * (underground ? 0.25 : 0.8);
    stage.keyLight.intensity = TUNING.render.keyLight * (underground ? 0.3 : 1);
    animateLuma(rig, action.id, time);
    trail.reset();
  }
  reset();

  return {
    get complete() { return time >= action.seconds; },
    get ticks() { return Math.floor(time / TUNING.sim.step); },
    get duration() { return action.seconds; },
    get progress() { return time / action.seconds; },
    get status() { return time >= action.seconds ? '演示完成' : `光子 · ${action.label}`; },
    get needsReset() { return revision !== card.revision; },
    reset,
    advance(elapsed: number, playing: boolean, _manual: (() => InputFrame) | null): number {
      if (!playing || time >= action.seconds) return 0;
      const dt = Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, action.seconds - time);
      time += dt;
      animateLuma(rig, action.id, time);
      rig.root.rotation.y = card.modelYaw;
      rig.motion.getWorldPosition(emitter);
      trail.update(emitter, dt);
      return dt;
    },
    render(rect: DOMRect, _dt: number, worldScale: boolean): THREE.Texture {
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== width || h !== height) { width = w; height = h; stage.setSize(w, h); }
      animateLuma(rig, action.id, time);
      rig.root.rotation.y = card.modelYaw;
      const viewHeight = (worldScale ? 6 : Math.max(2.6, 2.8 / stage.camera.aspect)) / card.zoom;
      const distance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
      const sinPitch = Math.sin(card.modelPitch);
      const cosPitch = Math.cos(card.modelPitch);
      stage.camera.position.set(0, 1.1 + distance * sinPitch + 0.1 * cosPitch, distance * cosPitch - 0.1 * sinPitch);
      stage.camera.lookAt(0, 1.1, 0);
      stage.camera.updateMatrixWorld();
      renderer.setScissorTest(false);
      return stage.renderTexture();
    },
    aim(clientX: number, clientY: number, rect: DOMRect) {
      screen.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2, 0.5).unproject(stage.camera);
      const camera = stage.camera.position;
      const k = -camera.z / (screen.z - camera.z);
      return { x: camera.x + (screen.x - camera.x) * k, y: camera.y + (screen.y - camera.y) * k };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      floor.removeFromParent();
      floorGeometry.dispose();
      floorMaterial.dispose();
      rig.dispose();
      trail.dispose();
      stage.dispose();
    },
  };
}
