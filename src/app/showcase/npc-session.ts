import * as THREE from 'three';
import { NPCS, npcAction, npcModel } from '../../config/npc.ts';
import type { NpcKind, NpcAction } from '../../config/npc.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createNpcTransformation, loadNpcForms } from '../../render/npc/npc-transformation.ts';
import { createNpcTargets } from '../../render/npc/npc-targets.ts';
import { createStageView } from '../../render/stage.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { createNpcWorld } from './npc-world.ts';
import { BossScore } from '../boss-audio.ts';

/** 模型尺寸、材质和动作由游戏共享资源提供，展示场只控制取景与播放时间。 */
export function createNpcShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard, caveBackground: THREE.Texture) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  const entry = showcaseEntry(card.entryId);
  const kind = entry.actor as NpcKind;
  let action = selectedAction();
  let rig: ReturnType<typeof createNpcTransformation> | null = null;
  const targets = createNpcTargets(kind, true);
  stage.scene.add(targets.root);
  let environment = card.environment;
  let world = createNpcWorld(stage, environment, caveBackground);
  stage.addBackdrop(world.backdrop);
  const sky = stage.scene.background;
  const undergroundBackground = new THREE.Color('#111c27');
  const screen = new THREE.Vector3();
  let time = 0;
  let revision = card.revision;
  let transformationRevision = card.npcTransformationRevision;
  let width = 0;
  let height = 0;
  let disposed = false;
  let audioContext: AudioContext | null = null;
  let score: BossScore | null = null;
  let soundEnabled = false;
  let audioPlaying = false;
  let audioSpeed = card.speed;

  function stopAudio(): void {
    score?.stop();
    audioPlaying = false;
  }


  function selectedAction() {
    return npcAction(kind, showcaseEntry(card.entryId).action as NpcAction);
  }

  function duration(): number {
    return rig ? rig.duration(action.id) : 0;
  }

  function sample(frameDt: number): void {
    if (!rig) return;
    rig.root.position.set(world.x, world.groundY, 0);
    rig.sample(action.id, time, card.facing, frameDt);
    targets.root.position.set(world.x, world.groundY, 0);
    targets.sample(action.id, time, card.facing, card.targetDodge);
  }

  function show(): void {
    targets.root.visible = false;
    // 资源加载失败交给展示场的 unhandledrejection 错误面板。
    void loadNpcForms(kind).then(() => {
      // 关闭的预览不能重新挂回场景；加载中的形态选择以最后一次为准。
      if (disposed) return;
      rig = createNpcTransformation(kind, showcaseEntry(card.entryId).npcForm!);
      stage.scene.add(rig.root);
      sample(0);
    });
  }

  function reset(): void {
    stopAudio();
    const next = selectedAction();
    if (next.id === action.id) rig?.resetPose();
    action = next;
    time = 0;
    revision = card.revision;
    if (environment !== card.environment) {
      world.dispose();
      environment = card.environment;
      world = createNpcWorld(stage, environment, caveBackground);
    }
    stage.scene.background = environment === 'underground' ? undergroundBackground : sky;
    sample(0);
  }
  show();
  reset();

  return {
    get ready() { return rig !== null; },
    get complete() {
      return rig !== null && time >= duration() && !rig.transforming && rig.form === showcaseEntry(card.entryId).npcForm
        && transformationRevision === card.npcTransformationRevision;
    },
    get ticks() { return Math.floor(time / TUNING.sim.step); },
    get duration() { return duration(); },
    get progress() { return rig ? Math.min(1, time / duration()) : 0; },
    get status() {
      const npc = NPCS[kind];
      const label = `${npc.name} · ${npcModel(kind, showcaseEntry(card.entryId).npcForm!).label}`;
      if (!rig) return `${label} · 正在加载模型…`;
      return `${label} · ${npc.title} · ${time >= duration() ? '演示完成' : action.label}`;
    },
    get needsReset() { return revision !== card.revision; },
    reset,
    async setSoundEnabled(enabled: boolean): Promise<void> {
      soundEnabled = enabled;
      stopAudio();
      if (!enabled) return;
      if (!audioContext) {
        audioContext = new AudioContext();
        score = new BossScore(audioContext, audioContext.destination);
      }
      await audioContext.resume();
    },
    advance(elapsed: number, playing: boolean, _manual: (() => InputFrame) | null): number {
      if (!rig) { stopAudio(); return 0; }
      rig.setForm(showcaseEntry(card.entryId).npcForm!);
      if (transformationRevision !== card.npcTransformationRevision) rig.replay();
      transformationRevision = card.npcTransformationRevision;
      const dt = playing ? Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed : 0;
      if (!playing || time >= duration()) stopAudio();
      else if (soundEnabled && audioContext?.state === 'running' && (!audioPlaying || audioSpeed !== card.speed)) {
        stopAudio();
        score!.schedule(kind, action.id, audioContext.currentTime, card.speed, time);
        audioPlaying = true;
        audioSpeed = card.speed;
      }
      time = Math.min(duration(), time + dt);
      sample(dt);
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
      stopAudio();
      if (audioContext) void audioContext.close();
      world.dispose();
      rig?.dispose();
      targets.dispose();
      stage.dispose();
    },
  };
}
