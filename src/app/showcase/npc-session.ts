import * as THREE from 'three';
import { NPCS, npcAction } from '../../config/npc.ts';
import type { NpcKind, NpcAction } from '../../config/npc.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createNpcRig, loadNpcAsset } from '../../render/npc/npc-rig.ts';
import { animateNpc } from '../../render/npc/npc-animator.ts';
import { createNpcTargets } from '../../render/npc/npc-targets.ts';
import { createStageView } from '../../render/stage.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { createNpcWorld } from './npc-world.ts';

/** 模型尺寸、材质和动作由游戏共享资源提供，展示场只控制取景与播放时间。 */
export function createNpcShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  let kind = showcaseEntry(card.entryId).actor as NpcKind;
  let action = selectedAction();
  let rig: ReturnType<typeof createNpcRig> | null = null;
  let targets = createNpcTargets(kind);
  stage.scene.add(targets.root);
  let environment = card.environment;
  let world = createNpcWorld(stage, environment);
  stage.addBackdrop(world.backdrop);
  const sky = stage.scene.background;
  const undergroundBackground = new THREE.Color('#111c27');
  const screen = new THREE.Vector3();
  let time = 0;
  let revision = card.revision;
  let width = 0;
  let height = 0;
  let disposed = false;

  function selectedAction() {
    return npcAction(kind, showcaseEntry(card.entryId).action as NpcAction);
  }

  function duration(): number {
    return rig ? Math.max(action.seconds, rig.actions[action.id].getClip().duration) : 0;
  }

  function sample(): void {
    if (!rig) return;
    animateNpc(rig, action.id, time);
    rig.root.position.set(world.x, world.groundY, 0);
    rig.root.rotation.y = card.facing * Math.PI / 2;
    // 身体朝向行进方向；技能与助威文字仍在横版世界平面展开。
    rig.effects.root.rotation.y = -rig.root.rotation.y;
    targets.root.position.set(world.x, world.groundY, 0);
    targets.sample(action.id, time, card.facing, card.targetDodge);
  }

  function show(next: NpcKind): void {
    if (kind !== next) {
      targets.dispose();
      targets = createNpcTargets(next);
      stage.scene.add(targets.root);
    }
    kind = next;
    rig?.dispose();
    rig = null;
    targets.root.visible = false;
    // 资源加载失败交给展示场的 unhandledrejection 错误面板。
    void loadNpcAsset(next).then(() => {
      if (disposed || kind !== next) return;
      rig?.dispose();
      rig = createNpcRig(next);
      stage.scene.add(rig.root);
      sample();
    });
  }

  function reset(): void {
    const next = showcaseEntry(card.entryId).actor as NpcKind;
    if (kind !== next) show(next);
    action = selectedAction();
    time = 0;
    revision = card.revision;
    if (environment !== card.environment) {
      world.dispose();
      environment = card.environment;
      world = createNpcWorld(stage, environment);
    }
    stage.scene.background = environment === 'underground' ? undergroundBackground : sky;
    sample();
  }
  show(kind);
  reset();

  return {
    get ready() { return rig !== null; },
    get complete() { return rig !== null && time >= duration(); },
    get ticks() { return Math.floor(time / TUNING.sim.step); },
    get duration() { return duration(); },
    get progress() { return rig ? Math.min(1, time / duration()) : 0; },
    get status() {
      const npc = NPCS[kind];
      if (!rig) return `${npc.name} · 正在加载模型…`;
      return `${npc.name} · ${npc.title} · ${time >= duration() ? '演示完成' : action.label}`;
    },
    get needsReset() { return revision !== card.revision; },
    reset,
    advance(elapsed: number, playing: boolean, _manual: (() => InputFrame) | null): number {
      if (!rig || !playing || time >= duration()) return 0;
      const dt = Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, duration() - time);
      time += dt;
      sample();
      return dt;
    },
    render(rect: DOMRect, dt: number, worldScale: boolean): THREE.Texture {
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== width || h !== height) { width = w; height = h; stage.setSize(w, h); }
      const baseFrame = npcAction(kind, 'idle');
      const expansion = action.release > 0
        ? THREE.MathUtils.smoothstep(time, 0.12, action.release * 0.75) * (1 - THREE.MathUtils.smoothstep(time, action.seconds - 0.9, action.seconds))
        : 1;
      const frameHeight = Math.max(7.2, THREE.MathUtils.lerp(baseFrame.viewHeight, action.viewHeight + 1.2, expansion));
      const frameWidth = action.id === 'ultimate' ? 15 : 13;
      const centerX = world.x + (action.id === 'skill1' || action.id === 'skill2' ? card.facing * 1.2 : 0);
      const centerY = world.groundY + Math.max(2, THREE.MathUtils.lerp(baseFrame.viewCenter, action.viewCenter, expansion));
      const viewHeight = (worldScale ? Math.max(9, frameHeight, frameWidth / stage.camera.aspect) : Math.max(frameHeight, frameWidth / stage.camera.aspect)) / card.zoom;
      const distance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
      const shake = rig ? rig.effects.shake : 0;
      const shakeX = shake * Math.sin(time * 61);
      const shakeY = shake * 0.6 * Math.sin(time * 79);
      stage.camera.position.set(centerX + shakeX, centerY + shakeY, distance);
      stage.camera.lookAt(centerX + shakeX, centerY + shakeY, 0);
      stage.camera.updateMatrixWorld();
      const darken = rig ? rig.effects.darken : 0;
      const underground = card.environment === 'underground';
      stage.scene.backgroundIntensity = 1 - darken * .85;
      stage.hemiLight.intensity = TUNING.render.hemi * (underground ? 0.65 : 1) * (1 - darken * 0.75);
      stage.keyLight.intensity = TUNING.render.keyLight * (1 - darken * 0.8);
      const halfWidth = viewHeight * stage.camera.aspect / 2;
      world.update({ x: centerX - halfWidth - 2, y: centerY - viewHeight / 2 - 2, w: halfWidth * 2 + 4, h: viewHeight + 4 }, time, dt);
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
      world.dispose();
      rig?.dispose();
      targets.dispose();
      stage.dispose();
    },
  };
}
