import * as THREE from 'three';
import { isEnemyKind } from '../../config/enemy-models.ts';
import { DEFAULT_CHARACTER_APPEARANCE } from '../../config/character-appearance.ts';
import { isGrassyAttack } from '../../config/grassy.ts';
import { LUMA, LUMA_ACTIONS } from '../../config/luma.ts';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { npcAction, npcModel, SAM_ROUTING_SOURCE } from '../../config/npc.ts';
import type { NpcAction, NpcKind } from '../../config/npc.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard, ShowcaseEntry } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import type { Vec2 } from '../../core/math.ts';
import { loadEnemyAsset } from '../../render/enemy-rig.ts';
import { createFishView } from '../../render/fish-view.ts';
import { loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { createGrassyStaticModel, loadGrassyStaticAsset } from '../../render/grassy/grassy-static.ts';
import { createD1Rig, loadD1Asset } from '../../render/grassy/d1-rig.ts';
import { GRASSY_HEIGHT } from '../../config/grassy.ts';
import { animateLuma } from '../../render/luma/luma-animator.ts';
import { createLumaCompanion } from '../../render/luma/luma-companion.ts';
import { createLumaRig } from '../../render/luma/luma-rig.ts';
import { createLumaTrail } from '../../render/luma/luma-trail.ts';
import { createLumaUltimate } from '../../render/luma/luma-ultimate.ts';
import { createNpcTransformation, loadNpcForms } from '../../render/npc/npc-transformation.ts';
import { createNpcTargets } from '../../render/npc/npc-targets.ts';
import { createPelicanRig } from '../../render/pelican/pelican-rig.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import { BossScore } from '../boss-audio.ts';
import { createEntityViews } from '../scene-wiring.ts';
import { createShowcaseScenario } from './catalog.ts';
import { createShowcaseRunner } from './runner.ts';
import { createLumaProjectilePreview } from './luma-projectile-preview.ts';

export interface StageActor {
  readonly root: THREE.Group;
  readonly framing: { x: number; y: number; width: number; height: number };
  readonly anchor: THREE.Vector3;
  readonly ready: boolean;
  readonly complete: boolean;
  readonly progress: number;
  readonly status: string;
  update(dt: number): void;
  aimAt?(x: number, y: number): void;
  reset(): void;
  setSoundEnabled?(enabled: boolean): Promise<void>;
  dispose(): void;
}

/** 每个角色保留游戏自身的模拟和动画，所有可见对象挂到同一个舞台。 */
export async function createStageActor(card: ShowcaseCard, isCurrent: () => boolean): Promise<StageActor | null> {
  const entry = showcaseEntry(card.entryId);
  if (entry.d1Animation) {
    await loadD1Asset();
    if (!isCurrent()) return null;
    return createD1Actor(card, entry);
  }
  if (entry.staticModel) {
    await loadGrassyStaticAsset(entry.staticModel);
    if (!isCurrent()) return null;
    const model = createGrassyStaticModel(entry.staticModel);
    const root = new THREE.Group();
    root.add(model.root);
    const sample = (): void => { model.root.rotation.set(card.modelPitch, card.modelYaw, 0); };
    sample();
    return {
      root, anchor: new THREE.Vector3(0, GRASSY_HEIGHT + .4, 0),
      framing: { x: 0, y: GRASSY_HEIGHT / 2, width: 3.2, height: GRASSY_HEIGHT },
      ready: true, complete: false, progress: 0, status: `${entry.label} · 静态模型，尚未绑定`,
      update: sample, reset: sample,
      dispose() { model.dispose(); root.removeFromParent(); },
    };
  }
  if (entry.actor === 'sam' || entry.actor === 'tibo') {
    const transformationRevision = card.npcTransformationRevision;
    await loadNpcForms(entry.actor);
    if (!isCurrent()) return null;
    // 加载期间仍可选形态，构造时使用最后一次选择。
    return createNpcActor(card, entry.actor, showcaseEntry(card.entryId), transformationRevision);
  }
  if (entry.actor === 'luma') return createLumaActor(card);
  await loadGrassyAsset(entry.grassyAnimation?.variant ?? 'game');
  if (isEnemyKind(entry.actor)) await loadEnemyAsset(entry.actor);
  if (!isCurrent()) return null;
  return createSimulatedActor(card, entry);
}

function createD1Actor(card: ShowcaseCard, entry: ShowcaseEntry): StageActor {
  const rig = createD1Rig();
  rig.setHairVisible(entry.d1HairVisible !== false);
  const root = new THREE.Group();
  root.add(rig.root);
  const action = rig.actions[entry.d1Animation!];
  const duration = action.getClip().duration;
  // 展示场用统一的循环/重播控制，避免动作自身循环后进度与画面不一致。
  action.setLoop(THREE.LoopOnce, 1).play();
  let time = 0;
  const rotate = (): void => { rig.root.rotation.set(card.modelPitch, card.modelYaw, 0); };
  const reset = (): void => { time = 0; action.reset().play(); rig.mixer.update(0); rotate(); };
  reset();
  return {
    root, anchor: new THREE.Vector3(0, GRASSY_HEIGHT + .4, 0),
    framing: { x: 0, y: 2, width: 3.2, height: 4 }, ready: true,
    get complete() { return time >= duration; },
    get progress() { return time / duration; },
    get status() { return `D1 · ${entry.label} · ${time >= duration ? '演示完成' : '骨骼动画'}`; },
    update(elapsed) {
      rotate();
      if (!card.playing || time >= duration) return;
      const dt = Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, duration - time);
      time += dt;
      rig.mixer.update(dt);
    },
    reset,
    dispose() { rig.dispose(); root.removeFromParent(); },
  };
}

function createSimulatedActor(card: ShowcaseCard, entry: ShowcaseEntry): StageActor {
  const root = new THREE.Group();
  const content = new THREE.Group();
  root.add(content);
  const anchor = new THREE.Vector3();
  const framing = { x: 0, y: 0, width: 0, height: 0 };
  const humanCombat = entry.actor === 'human' && (isGrassyAttack(entry.grassyAnimation!.clip) || entry.action === 'photon_burst');
  const photon = entry.action === 'photon_burst' || entry.action === 'ultimate';
  const disposers: Array<() => void> = [];
  let simulation: ReturnType<typeof createContent>;
  let aim: Vec2 | undefined;

  function disposeContent(): void {
    for (const dispose of disposers.splice(0).reverse()) dispose();
    content.clear();
  }

  function createContent() {
    const scenario = createShowcaseScenario(entry.id, card.environment, card.facing, card.attackMotion);
    disposers.push(() => scenario.dispose());
    const { world } = scenario;
    const player = getPlayer(world);
    const subject = entry.actor === 'fish' ? world.fish.fish[0]!
      : entry.actor === 'dummy' ? world.entities.find(entity => entity.dummy)!
        : isEnemyKind(entry.actor) ? world.entities.find(entity => entity.enemy)!
          : player;
    const originY = Math.min(scenario.groundY, subject.body.y);
    const rig = createPelicanRig({ scale: TUNING.render.pelicanScale });
    disposers.push(() => rig.dispose());
    const clip = entry.grassyAnimation?.clip;
    const gait = clip === 'run' || clip === 'sprint' ? clip : undefined;
    // 目录展示原版主角，游戏里保存的捏人搭配不改变资源身份。
    const turning = entry.actor === 'pelican' && entry.action === 'turn' ? rig.root.getObjectByName('pelican-yaw')! : null;
    const initialTurnYaw = card.facing === 1 ? 0 : -Math.PI;
    // 转身演示保留动画的转角；检视滑条仍控制它的起始朝向。
    const modelView = () => ({ yaw: card.modelYaw + (turning ? turning.rotation.y - initialTurnYaw : 0), pitch: card.modelPitch });
    const views = createEntityViews({ scene: content }, world.level, disposers, () => world.entities, { sample: () => null }, world.env.wind, rig, entry.grassyAnimation?.variant, gait, () => DEFAULT_CHARACTER_APPEARANCE, modelView);
    const luma = photon ? createLumaCompanion(content, player) : null;
    if (luma) disposers.push(() => luma.dispose());
    const fish = entry.actor === 'fish' ? createFishView(world.fish, { modelView }) : null;
    if (fish) { content.add(fish.root); disposers.push(() => fish.dispose()); }
    const runner = createShowcaseRunner(scenario);
    const basicHuman = entry.actor === 'human' && !humanCombat;
    framing.width = basicHuman ? 6 : scenario.width;
    framing.height = basicHuman ? Math.max(5, scenario.height - 3) : scenario.height;
    framing.y = basicHuman ? framing.height / 2 : scenario.focus().y - originY;
    const visibleEntities = () => world.entities.filter(entity => {
      if (entity.dummy && entity !== subject) return false;
      if (entity === player && subject !== player) return false;
      return true;
    });
    function sync(dt: number): void {
      const body = subject.body;
      const subjectX = THREE.MathUtils.lerp(body.prevX, body.x, runner.alpha);
      // 共享场景中固定角色的展示位置，不沿用单动作演示的追踪/攻击取景中心。
      content.position.set(-subjectX, -originY, 0);
      const events = world.events.drain();
      views.orbFx.handleEvents(events);
      views.projectileFx.handleEvents(events);
      luma?.handleEvents(events);
      const animDt = world.hitstopTicks > 0 ? 0 : dt;
      views.views.sync(visibleEntities(), runner.alpha, animDt);
      for (const entity of world.entities) {
        if (entity.enemy && !entity.removed) views.views.get(entity.id)!.object.rotation.set(card.modelPitch, card.modelYaw - Math.PI / 2 - (entity.facing === 1 ? 0 : Math.PI), 0);
      }
      if (entry.actor === 'dummy') {
        const object = views.views.get(subject.id)!.object;
        object.rotation.set(card.modelPitch, card.modelYaw, object.rotation.z);
      }
      luma?.update(player, runner.alpha, animDt, world.photon.chargeTicks > 0 || world.photon.activeTicks > 0);
      fish?.update(runner.alpha, runner.time);
      views.orbs.update(world.entities, runner.alpha);
      views.projectileFx.update(world.entities, runner.alpha, animDt);
      views.orbFx.update(animDt);
      anchor.set(0,
        THREE.MathUtils.lerp(body.prevY, body.y, runner.alpha) + body.height + .5 - originY, 0);
    }
    sync(0);
    return { scenario, runner, sync };
  }
  function reset(): void {
    disposeContent();
    try { simulation = createContent(); }
    catch (error) { disposeContent(); throw error; }
  }
  reset();
  return {
    root, anchor, framing, ready: true,
    get complete() { return simulation.runner.complete; },
    get progress() { return Math.min(1, simulation.scenario.elapsedTicks / simulation.scenario.durationTicks); },
    get status() { return simulation.scenario.status(); },
    update(dt) {
      const worldAim = aim === undefined ? undefined : { x: aim.x - content.position.x, y: aim.y - content.position.y };
      simulation.sync(simulation.runner.advance(dt, card.speed, card.playing, null, worldAim));
    },
    aimAt(x, y) { aim = { x, y }; },
    reset,
    dispose() { disposeContent(); root.removeFromParent(); },
  };
}

export function createLumaActor(card: ShowcaseCard): StageActor {
  const root = new THREE.Group();
  const rig = createLumaRig();
  root.add(rig.root);
  const trail = createLumaTrail(root);
  const emitter = new THREE.Vector3();
  const action = LUMA_ACTIONS.find(item => item.id === showcaseEntry(card.entryId).action)!;
  const ultimate = action.id === 'ultimate' ? createLumaUltimate(root) : null;
  const projectiles = ultimate ? createLumaProjectilePreview(root) : null;
  const chargeSeconds = PHOTON_ULTIMATE.chargeTicks * TUNING.sim.step;
  const activeSeconds = PHOTON_ULTIMATE.activeTicks * TUNING.sim.step;
  // 爆裂从光子自身位置展开，给低侧光轮留出离地空间。
  rig.root.position.y = ultimate ? 3.2 : LUMA.hoverHeight;
  rig.root.scale.setScalar(ultimate ? 1.3 : 1);
  const anchor = new THREE.Vector3(0, rig.root.position.y + .8, 0);
  let time = 0;
  let aim: Vec2 | null = null;
  const sample = (): void => {
    const animating = !ultimate || time < chargeSeconds + activeSeconds;
    animateLuma(rig, animating ? action.id : 'idle', animating ? time : time - chargeSeconds - activeSeconds);
    rig.root.rotation.x = card.modelPitch;
    rig.root.rotation.y = card.modelYaw;
    rig.motion.getWorldPosition(emitter);
    root.worldToLocal(emitter);
    anchor.copy(emitter); anchor.y += .8;
  };
  sample();
  ultimate?.start(emitter.x, emitter.y);
  return {
    root, anchor, framing: ultimate ? { x: 0, y: 4.5, width: 28, height: 12 } : { x: 0, y: 1.1, width: 2.8, height: 2.6 }, ready: true,
    get complete() { return time >= action.seconds; },
    get progress() { return time / action.seconds; },
    get status() { return `光子 · ${action.label}`; },
    update(elapsed) {
      sample();
      if (!card.playing || time >= action.seconds) return;
      const dt = Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, action.seconds - time);
      const previous = time;
      time += dt; sample();
      if (ultimate) {
        if (previous < chargeSeconds && time >= chargeSeconds) {
          ultimate.burst(emitter.x, emitter.y, PHOTON_ULTIMATE.radius);
          const angle = aim === null ? card.facing < 0 ? Math.PI : 0 : Math.atan2(aim.y - emitter.y, aim.x - emitter.x);
          projectiles!.start(emitter.x, emitter.y, angle);
          projectiles!.update(time - chargeSeconds);
          ultimate.update(time - chargeSeconds, emitter);
        } else {
          ultimate.update(dt, emitter);
          projectiles!.update(dt);
        }
      }
      trail.update(emitter, dt);
    },
    aimAt(x, y) { aim = { x, y }; },
    reset() { time = 0; trail.reset(); projectiles?.reset(); sample(); ultimate?.start(emitter.x, emitter.y); },
    dispose() { projectiles?.dispose(); ultimate?.dispose(); trail.dispose(); rig.dispose(); root.removeFromParent(); },
  };
}

function createNpcActor(card: ShowcaseCard, kind: NpcKind, entry: ShowcaseEntry, transformationRevision: number): StageActor {
  const root = new THREE.Group();
  let action = npcAction(kind, entry.action as NpcAction);
  const rig = createNpcTransformation(kind, entry.npcForm!);
  const targets = createNpcTargets(kind, false);
  root.add(rig.root, targets.root);
  let duration = rig.duration(action.id);
  const framing = { x: 0, y: action.viewCenter, width: action.id === 'attack' ? 8 : action.release > 0 ? 15 : 7, height: Math.max(7.2, action.viewHeight + 1.2) };
  const anchor = new THREE.Vector3(0, (action.id === 'ultimate' || kind === 'sam' && action.id === 'skill2') ? 7.1 : kind === 'sam' ? SAM_ROUTING_SOURCE.y + 1.1 : npcAction(kind, 'idle').viewCenter * 2 + .5, 0);
  let time = 0;
  let revision = card.revision;
  let audioContext: AudioContext | null = null;
  let score: BossScore | null = null;
  let soundEnabled = false;
  let audioPlaying = false;
  let audioSpeed = card.speed;
  const stopAudio = (): void => { score?.stop(); audioPlaying = false; };
  const sample = (frameDt: number): void => {
    rig.sample(action.id, time, card.facing, frameDt, 0, { yaw: card.modelYaw, pitch: card.modelPitch });
    targets.sample(action.id, time, card.facing, card.targetDodge);
  };
  const reset = (): void => {
    stopAudio();
    const next = npcAction(kind, showcaseEntry(card.entryId).action as NpcAction);
    // 切换动作保留当前显示姿态；同动作重播才清除过渡历史。
    if (next.id === action.id) rig.resetPose();
    action = next;
    // 高位技能字幕延伸到头顶上方，角色操作条跟随其外沿。
    anchor.y = (action.id === 'ultimate' || kind === 'sam' && action.id === 'skill2') ? 7.1 : kind === 'sam' ? SAM_ROUTING_SOURCE.y + 1.1 : npcAction(kind, 'idle').viewCenter * 2 + .5;
    duration = rig.duration(action.id);
    Object.assign(framing, { y: action.viewCenter, width: action.id === 'attack' ? 8 : action.release > 0 ? 15 : 7, height: Math.max(7.2, action.viewHeight + 1.2) });
    time = 0;
    revision = card.revision;
    sample(0);
  };
  sample(0);
  return {
    root, anchor, framing, ready: true,
    get complete() {
      return action.id === showcaseEntry(card.entryId).action && revision === card.revision
        && time >= duration && !rig.transforming && rig.form === showcaseEntry(card.entryId).npcForm
        && transformationRevision === card.npcTransformationRevision;
    },
    get progress() { return time / duration; },
    get status() { return `${npcModel(kind, rig.form).label} · ${time >= duration ? '演示完成' : action.label}`; },
    update(elapsed) {
      if (action.id !== showcaseEntry(card.entryId).action || revision !== card.revision) reset();
      rig.setForm(showcaseEntry(card.entryId).npcForm!);
      if (transformationRevision !== card.npcTransformationRevision) rig.replay();
      transformationRevision = card.npcTransformationRevision;
      const dt = card.playing ? Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed : 0;
      if (!card.playing || time >= duration) stopAudio();
      else if (soundEnabled && audioContext?.state === 'running' && (!audioPlaying || audioSpeed !== card.speed)) {
        stopAudio(); score!.schedule(kind, action.id, audioContext.currentTime, card.speed, time);
        audioPlaying = true; audioSpeed = card.speed;
      }
      time = Math.min(duration, time + dt);
      sample(dt);
    },
    reset,
    async setSoundEnabled(enabled) {
      soundEnabled = enabled; stopAudio();
      if (!enabled) return;
      if (!audioContext) { audioContext = new AudioContext(); score = new BossScore(audioContext, audioContext.destination); }
      await audioContext.resume();
    },
    dispose() { stopAudio(); if (audioContext) void audioContext.close(); targets.dispose(); rig.dispose(); root.removeFromParent(); },
  };
}
