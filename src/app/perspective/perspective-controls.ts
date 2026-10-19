import type { UtilityDroneFleet } from '../../render/character/utility-drone.ts';
import { t } from '../../config/i18n.ts';
import { protectPlayer } from '../../render/character/player-occlusion.ts';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_BINDINGS, buildBindingLookup, type GameAction } from '../../config/keybindings.ts';
import { TUNING, type Tuning } from '../../config/tuning.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import { damp } from '../../core/math.ts';
import { getSkillWaitTicks } from '../../entities/skill-wait.ts';
import type { Entity } from '../../entities/entity.ts';
import type { PelicanInput } from '../../entities/pelican-controller.ts';
import { createActionTracker } from '../../input/action-map.ts';
import { bindKeyboardMouse, type KeyboardMouseBinding } from '../../input/keyboard-mouse.ts';
import { savePrev, type Body } from '../../physics/body.ts';
import { definitionGroundAt, type DefinitionCollision } from '../../physics/definition-collision.ts';
import type { SolarPanelState } from '../../physics/solar-panel.ts';
import { createCameraRig } from '../../render/stage/camera-rig.ts';
import type { LandingPod } from '../../render/transit/transit-landing-pod.ts';
import { carryInPod, placeInPod, podLandingPhase, POD_WALK_INPUT, type PodLanding } from '../../sim/pod-landing.ts';
import type { LandingPodPlan } from '../../config/transit.ts';
import { DEFAULT_PELICAN_ANIM_TUNING } from '../../render/pelican/pelican-animator.ts';
import { createGrassyPlayerAnimator } from '../../render/grassy/grassy-player-animator.ts';
import { createGrassyProjectileViews } from '../../render/grassy/grassy-projectile-view.ts';
import { createFlyingRoadsterView } from '../../render/character/flying-roadster-view.ts';
import { createViewRegistry } from '../../render/stage/view-registry.ts';
import type { GrassyRig } from '../../render/grassy/grassy-rig.ts';
import type { Stage } from '../../render/stage/stage.ts';
import { createGameHud, type GameHudWorld } from '../../ui/hud/game-hud.ts';
import type { WorldToScreen } from '../../ui/hud/hud.ts';
import { createWeaponHud } from '../../ui/hud/weapon-hud.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createPerspectivePlayer } from './perspective-player.ts';
// 原生 HUD 的样式由装配它的入口引入（index.html 不再全局外链）。
import '../../ui/hud/hud.css';
import '../../ui/hud/control-surface.css';
import '../../ui/hud/game-hud.css';

/** 镜头绕 target 按预设偏航与俯仰摆在 distance 处。 */
export function tiltCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, distance: number, angles: readonly [number, number]): void {
  const yaw = THREE.MathUtils.degToRad(angles[0]);
  const pitch = THREE.MathUtils.degToRad(angles[1]);
  camera.position.set(target.x + distance * Math.sin(yaw) * Math.cos(pitch),
    target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

export function createPerspectiveControls(app: HTMLElement, stage: Stage, droneFleet: UtilityDroneFleet, orbit: OrbitControls,
  rig: GrassyRig, collision: DefinitionCollision, bounds: THREE.Box3, initial: SceneSection, viewAngles: readonly [number, number], solarPanels: readonly SolarPanelState[], unlimitedFlight = true,
  // onMode 把游玩与跟随状态交给宿主的暂停与镜头按钮显示；按钮由宿主持有，点击后回调 setPlaying / setFollowing。
  options: { cameraMode: 'game' | 'inspection'; tuning: Tuning; onMode: (playing: boolean, following: boolean) => void; applyForce?: (body: Body, dt: number) => void; airWind?: (body: Body) => number; carriers?: readonly Entity[]; world?: GameHudWorld; steer?: (frame: PelicanInput, body: Body) => PelicanInput; lander?: () => LandingPod | null }) {
  const world = { width: Math.ceil(bounds.max.x + 1), height: Math.ceil(bounds.max.y + 8) };
  protectPlayer(rig.root);
  const player = createPerspectivePlayer(collision, { x: initial.playerX, y: initial.playerY }, world, solarPanels, unlimitedFlight, options);
  const stepper = createFixedStepper(TUNING.sim);
  const tracker = createActionTracker();
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  const projectileViews = createGrassyProjectileViews();
  const carriers = options.carriers ?? [];
  const projectiles = createViewRegistry(stage.scene, { codexShot: projectileViews.factory, bugShot: projectileViews.factory, flyingRoadster: createFlyingRoadsterView });
  const follow = createCameraRig({ camera: stage.camera, tuning: options.tuning,
    bounds: { ...world, minX: bounds.min.x, minY: Math.min(0, bounds.min.y), width: bounds.max.x - bounds.min.x + 1 },
    viewport: () => stage.canvas.getBoundingClientRect() });
  const mode = app.querySelector<HTMLElement>('[data-mode]')!;
  const hint = app.querySelector<HTMLElement>('.room-preview-hint')!;
  const skillButtons = [...app.querySelectorAll<HTMLButtonElement>('[data-skill]')];
  const hudRoot = app.querySelector<HTMLElement>('.room-preview-hud')!;
  const animator = createGrassyPlayerAnimator(rig, player.entity, { tuning: TUNING, windAt: () => 0 });
  let binding: KeyboardMouseBinding | null = null;
  let buttonCast = false;
  let current = initial;
  let playing = true;
  let following = true;
  let angles = viewAngles;
  let landing: PodLanding | null = null;
  let elapsed = 0;
  const castSkill = (action: GameAction): void => {
    buttonCast = true;
    tracker.press(action, 'keyboard', 'skill-button');
    tracker.release(action, 'skill-button');
    stage.canvas.focus({ preventScroll: true });
  };
  const projected = new THREE.Vector3();
  // HUD 每帧要投影多次；尺寸缓存下来，避免在样式刚写完时读布局触发强制重排。
  let canvasSize = { width: stage.canvas.clientWidth, height: stage.canvas.clientHeight };
  const resize = new ResizeObserver(([entry]) => { canvasSize = entry!.contentRect; });
  resize.observe(stage.canvas);
  const project: WorldToScreen = (x, y) => {
    projected.set(x, y, 0).project(stage.camera);
    if (projected.z < -1 || projected.z > 1) return null;
    return { x: (projected.x + 1) * canvasSize.width / 2, y: (1 - projected.y) * canvasSize.height / 2 };
  };
  const weaponHud = createWeaponHud(hudRoot, {
    weapons: TUNING.weapons,
    project,
    onTransform: () => castSkill('transform'),
    onSkill: castSkill,
  });
  const hud = createGameHud(hudRoot, {
    updateDrone: (index, x, y, dt, talking, flying, groundAngle, groundHeight, escortDepth) => {
      const depth = escortDepth ?? (current.walkZ ? current.walkZ(x, !flying && groundHeight !== null ? groundHeight : y - 0.34) : 0);
      droneFleet.updateFollower(index, x, y, dt, talking, flying, groundAngle, groundHeight, depth);
    },
    droneEscort: index => options.lander?.()?.droneEscort(index),
    groundAt: (x, y) => definitionGroundAt(collision, x, y),
    // 透视场景是多边形碰撞，没有墙体格；车顶平台在这里不提供。
    droneBlocked: () => false,
    canvas: stage.canvas, project, world: options.world,
    blocked: () => !playing,
  });
  const updateHud = (frameDt: number): void => weaponHud.update({
    entities: [player.entity], playerId: player.entity.id, frameDt,
    skillWaitTicks: [0, 1, 2, 3].map(index => getSkillWaitTicks(player.entity, index, TUNING, 0, 0)),
    photonCooldownTicks: 0, photonChargeTicks: 0, photonActiveTicks: 0, transformUnlocked: false,
  });
  updateHud(0);
  stage.canvas.tabIndex = 0;
  rig.effects.setProjectilePreview(false);

  const aim = (): void => {
    if (options.cameraMode === 'game') {
      orbit.target.set(stage.camera.position.x, stage.camera.position.y, 0);
    } else {
      orbit.target.set(follow.focus.x, follow.focus.y, 0);
    }
    // The follow rig has just placed the camera at its distance, including a pod closeup's.
    tiltCamera(stage.camera, orbit.target, stage.camera.position.z, angles);
  };
  const syncMode = (): void => {
    orbit.enabled = true;
    // 游玩时左右键保留攻击，自由镜头用中键，避免旋转镜头误触发技能。
    orbit.mouseButtons.LEFT = playing ? null : THREE.MOUSE.ROTATE;
    orbit.mouseButtons.MIDDLE = playing ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY;
    orbit.mouseButtons.RIGHT = playing ? null : THREE.MOUSE.PAN;
    options.onMode(playing, following);
    mode.textContent = `${t(playing ? '游玩中' : '已暂停')} · ${t(following ? '跟随镜头' : '自由镜头')}`;
    for (const skill of skillButtons) skill.disabled = !playing;
    hudRoot.inert = !playing;
    hint.textContent = t(playing
      ? following ? 'A / D 移动 · 按住空格无限飞行 · 松开滑翔 / S 下降 · R 上下车 · J / 右键 / 1 / 2 技能 · 中键旋转 · 滚轮缩放'
        : '正常游玩中 · 按住空格无限飞行 · S 下降 · R 上下车 · 中键旋转 · Shift + 中键平移 · 滚轮缩放 · 技能照常释放'
      : following ? '玩法已暂停 · 可切换自由镜头检查场景' : '玩法已暂停 · 左键旋转 · 右键平移 · 滚轮缩放');
    if (!unlimitedFlight && playing) hint.textContent = t('A / D 移动 · 空格跳跃 / 飞行 · S 下穿平台 · 能量门自动感应 · 中键调整镜头');
  };
  const setFollowing = (enabled: boolean): void => {
    following = enabled;
    syncMode();
    if (following) { follow.snapTo(player.entity.body.x, player.entity.body.y, player.entity.facing); aim(); }
    if (playing) stage.canvas.focus({ preventScroll: true });
  };
  const setPlaying = (enabled: boolean): void => {
    playing = enabled;
    tracker.releaseAll(); stepper.reset();
    weaponHud.resetInput();
    buttonCast = false;
    binding?.dispose(); binding = null;
    syncMode();
    if (playing) {
      binding = bindKeyboardMouse({ target: window, canvas: stage.canvas, doc: document, tracker, lookup });
      stage.canvas.focus({ preventScroll: true });
    }
  };
  const adjustCamera = (): void => {
    if (following) setFollowing(false);
    for (const preset of app.querySelectorAll('[data-view]')) preset.setAttribute('aria-pressed', 'false');
  };
  orbit.addEventListener('start', adjustCamera);
  const releaseSkill = (event: Event): void => {
    const skill = (event.currentTarget as HTMLButtonElement).dataset.skill as GameAction;
    castSkill(skill);
  };
  for (const skill of skillButtons) skill.addEventListener('click', releaseSkill);
  // 目录与滑杆使用方向键时不驱动角色；keyup 仍由游戏输入在捕获阶段释放。
  const stopKey = (event: Event): void => { if (event.target !== stage.canvas) event.stopPropagation(); };
  app.addEventListener('keydown', stopKey);

  return {
    hud,
    get body() { return player.entity.body; },
    get playing(): boolean { return playing; },
    get following(): boolean { return following; },
    setPlaying,
    /** 焦点移到工具条时只释放按住的键，不像 setPlaying 那样把焦点抢回画布。 */
    releaseInput(): void { tracker.releaseAll(); },
    setFollowing,
    setViewAngles(value: readonly [number, number]): void { angles = value; setFollowing(true); },
    select(section: SceneSection): void {
      current = section;
      player.teleport(section.playerX, section.playerY);
      rig.root.position.set(section.playerX, section.playerY, section.walkZ ? section.walkZ(section.playerX, section.playerY) : 0);
      rig.root.rotation.y = player.entity.facing * Math.PI / 2;
      projectiles.sync([...carriers, ...player.projectiles], 0, 0);
      animator.reset(player.entity);
      animator.update(player.entity, 0, 0);
      updateHud(0);
      setPlaying(playing);
      setFollowing(following);
    },
    observe(): void { setFollowing(false); },
    /** Seats the player in the arrival pod; input stays locked until it has walked out to the plan's exit. */
    land(plan: LandingPodPlan): void {
      landing = placeInPod(player.entity, plan, TUNING.sim.step);
      animator.reset(player.entity);
    },
    get landing(): PodLanding | null { return landing; },
    update(dt: number): void {
      if (!playing) return;
      const alpha = stepper.advance(dt, () => {
        const pointer = binding!.pointer;
        const aimPoint = pointer.inside ? follow.screenToWorld(pointer.clientX, pointer.clientY, { x: 0, y: 0 }) : null;
        const frame = tracker.consume(buttonCast ? null : aimPoint);
        buttonCast = false;
        const body = player.entity.body;
        // Keys pressed during the landing are consumed and dropped.
        const phase = landing === null ? 'done' : podLandingPhase(landing, body);
        if (phase === 'carry') { savePrev(body); carryInPod(landing!, body); }
        else if (phase === 'walk') player.step(POD_WALK_INPUT);
        else {
          landing = null;
          player.step(options.steer ? options.steer(frame, body) : frame);
        }
        if (body.y < bounds.min.y - 6) {
          player.teleport(current.playerX, current.playerY);
          animator.reset(player.entity);
        }
      });
      const entity = player.entity;
      const body = entity.body;
      const x = THREE.MathUtils.lerp(body.prevX, body.x, alpha);
      const y = THREE.MathUtils.lerp(body.prevY, body.y, alpha);
      // 有落地家具的分区：中线行走，过家具前让、站上家具回到其深度中心，平滑过渡；其余分区固定 Z=0。
      rig.root.position.set(x, y, current.walkZ ? damp(rig.root.position.z, current.walkZ(x, y), 12, dt) : 0);
      const p = entity.pelican!;
      if (p.moveX !== 0 || entity.attack !== undefined || p.humanCombat.action !== null || p.shotTicks >= 0) {
        rig.root.rotation.y = damp(rig.root.rotation.y, entity.facing * Math.PI / 2, DEFAULT_PELICAN_ANIM_TUNING.yawRate, dt);
      }
      animator.update(entity, alpha, dt);
      elapsed += dt;
      const pod = options.lander?.();
      pod?.update(alpha, elapsed, dt);
      projectiles.sync([...carriers, ...player.projectiles], alpha, dt);
      weaponHud.handleEvents(player.events.drain());
      // 相机先就位再投影 HUD，跟随物不落后一帧。
      if (following) { follow.update(x, y, entity.facing, dt, pod?.closeup()); aim(); }
      updateHud(dt);
      hud.update(entity, dt);
    },
    dispose(): void {
      binding?.dispose(); tracker.releaseAll();
      resize.disconnect();
      orbit.removeEventListener('start', adjustCamera);
      for (const skill of skillButtons) skill.removeEventListener('click', releaseSkill);
      projectiles.dispose(); projectileViews.dispose();
      weaponHud.dispose();
      hud.dispose();
      droneFleet.dispose();
      app.removeEventListener('keydown', stopKey);
    },
  };
}
