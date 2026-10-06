import * as THREE from 'three';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createStageView } from '../../render/stage.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { createLumaActor } from './stage-actor.ts';

/** 角色形状与动作来自共享资产，这里只负责检视环境、镜头和播放时间。 */
export function createLumaShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  let actor = createLumaActor(card);
  stage.scene.add(actor.root);
  const floorGeometry = new THREE.CircleGeometry(3, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#728d91', roughness: 0.92 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stage.scene.add(floor);
  const screen = new THREE.Vector3();
  let revision = card.revision;
  let width = 0;
  let height = 0;
  let disposed = false;

  function configureEnvironment(): void {
    const underground = card.environment === 'underground';
    stage.scene.background = new THREE.Color(underground ? '#0c1b2a' : '#9ab4bd');
    floorMaterial.color.set(underground ? '#233443' : '#728d91');
    stage.hemiLight.intensity = TUNING.render.hemi * (underground ? 0.25 : 0.8);
    stage.keyLight.intensity = TUNING.render.keyLight * (underground ? 0.3 : 1);
  }
  configureEnvironment();

  function reset(): void {
    actor.dispose();
    actor = createLumaActor(card);
    stage.scene.add(actor.root);
    revision = card.revision;
    configureEnvironment();
  }

  return {
    get complete() { return actor.complete; },
    get ticks() { return Math.floor(actor.progress * showcaseEntry(card.entryId).seconds / TUNING.sim.step); },
    get duration() { return showcaseEntry(card.entryId).seconds; },
    get progress() { return actor.progress; },
    get status() { return actor.complete ? '演示完成' : actor.status; },
    get needsReset() { return revision !== card.revision; },
    reset,
    advance(elapsed: number, playing: boolean, _manual: (() => InputFrame) | null): number {
      const previous = actor.progress;
      actor.update(playing ? elapsed : 0);
      return (actor.progress - previous) * showcaseEntry(card.entryId).seconds;
    },
    render(rect: DOMRect, _dt: number, worldScale: boolean): THREE.Texture {
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== width || h !== height) { width = w; height = h; stage.setSize(w, h); }
      const { x, y, width: frameWidth, height: frameHeight } = actor.framing;
      const fittedHeight = Math.max(frameHeight, frameWidth / stage.camera.aspect);
      const viewHeight = (worldScale ? Math.max(6, fittedHeight) : fittedHeight) / card.zoom;
      const distance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
      const sinPitch = Math.sin(card.modelPitch);
      const cosPitch = Math.cos(card.modelPitch);
      stage.camera.position.set(x, y + distance * sinPitch + 0.1 * cosPitch, distance * cosPitch - 0.1 * sinPitch);
      stage.camera.lookAt(x, y, 0);
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
      actor.dispose();
      stage.dispose();
    },
  };
}
