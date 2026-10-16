import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_BINDINGS, buildBindingLookup, type GameAction } from '../config/keybindings.ts';
import { TUNING, type Tuning } from '../config/tuning.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import { damp } from '../core/math.ts';
import { getSkillWaitTicks } from '../entities/skill-wait.ts';
import { createActionTracker } from '../input/action-map.ts';
import { bindKeyboardMouse, type KeyboardMouseBinding } from '../input/keyboard-mouse.ts';
import type { Body } from '../physics/body.ts';
import type { DefinitionCollision } from '../physics/definition-collision.ts';
import type { SolarPanelState } from '../physics/solar-panel.ts';
import { createCameraRig } from '../render/camera-rig.ts';
import { DEFAULT_PELICAN_ANIM_TUNING } from '../render/pelican/pelican-animator.ts';
import { createGrassyPlayerAnimator } from '../render/grassy/grassy-player-animator.ts';
import { createGrassyProjectileViews } from '../render/grassy/grassy-projectile-view.ts';
import { createViewRegistry } from '../render/view-registry.ts';
import type { GrassyRig } from '../render/grassy/grassy-rig.ts';
import type { Stage } from '../render/stage.ts';
import { createWeaponHud } from '../ui/weapon-hud.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createPerspectivePlayer } from './perspective-player.ts';

export function createPerspectiveControls(app: HTMLElement, stage: Stage, orbit: OrbitControls,
  rig: GrassyRig, collision: DefinitionCollision, bounds: THREE.Box3, initial: SceneSection, viewAngles: readonly [number, number], solarPanels: readonly SolarPanelState[], unlimitedFlight = true,
  options: { cameraMode: 'game' | 'inspection'; tuning: Tuning; applyForce?: (body: Body, dt: number) => void; airWind?: (body: Body) => number } = { cameraMode: 'inspection', tuning: TUNING }) {
  const world = { width: Math.ceil(bounds.max.x + 1), height: Math.ceil(bounds.max.y + 8) };
  const player = createPerspectivePlayer(collision, { x: initial.playerX, y: initial.playerY }, world, solarPanels, unlimitedFlight, options);
  const stepper = createFixedStepper(TUNING.sim);
  const tracker = createActionTracker();
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  const projectileViews = createGrassyProjectileViews();
  const projectiles = createViewRegistry(stage.scene, { codexShot: projectileViews.factory, bugShot: projectileViews.factory });
  const follow = createCameraRig({ camera: stage.camera, tuning: options.tuning,
    bounds: { ...world, minX: bounds.min.x, minY: Math.min(0, bounds.min.y), width: bounds.max.x - bounds.min.x + 1 },
    viewport: () => stage.canvas.getBoundingClientRect() });
  const button = app.querySelector<HTMLButtonElement>('[data-play]')!;
  const cameraButton = app.querySelector<HTMLButtonElement>('[data-camera]')!;
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
  const castSkill = (action: GameAction): void => {
    buttonCast = true;
    tracker.press(action, 'keyboard', 'skill-button');
    tracker.release(action, 'skill-button');
    stage.canvas.focus({ preventScroll: true });
  };
  const projected = new THREE.Vector3();
  const weaponHud = createWeaponHud(hudRoot, {
    weapons: TUNING.weapons,
    project(x, y) {
      projected.set(x, y, 0).project(stage.camera);
      if (projected.z < -1 || projected.z > 1) return null;
      const rect = stage.canvas.getBoundingClientRect();
      return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 };
    },
    onTransform: () => castSkill('transform'),
    onSkill: castSkill,
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
      return;
    }
    const camera = stage.camera;
    const distance = options.tuning.camera.distance;
    const yaw = THREE.MathUtils.degToRad(angles[0]);
    const pitch = THREE.MathUtils.degToRad(angles[1]);
    orbit.target.set(follow.focus.x, follow.focus.y, 0);
    camera.position.set(orbit.target.x + distance * Math.sin(yaw) * Math.cos(pitch),
      orbit.target.y + distance * Math.sin(pitch), distance * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(orbit.target);
    camera.updateMatrixWorld();
  };
  const syncMode = (): void => {
    orbit.enabled = true;
    // 游玩时左右键保留攻击，自由镜头用中键，避免旋转镜头误触发技能。
    orbit.mouseButtons.LEFT = playing ? null : THREE.MOUSE.ROTATE;
    orbit.mouseButtons.MIDDLE = playing ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY;
    orbit.mouseButtons.RIGHT = playing ? null : THREE.MOUSE.PAN;
    button.setAttribute('aria-pressed', String(playing));
    button.textContent = playing ? '暂停游玩' : '继续游玩';
    cameraButton.setAttribute('aria-pressed', String(following));
    cameraButton.textContent = following ? '自由镜头' : '跟随玩家';
    mode.textContent = `${playing ? '游玩中' : '已暂停'} · ${following ? '跟随镜头' : '自由镜头'}`;
    for (const skill of skillButtons) skill.disabled = !playing;
    hudRoot.inert = !playing;
    hint.textContent = playing
      ? following ? 'A / D 移动 · 按住空格无限飞行 · 松开滑翔 / S 下降 · R 上下车 · J / 右键 / 1 / 2 技能 · 中键旋转 · 滚轮缩放'
        : '正常游玩中 · 按住空格无限飞行 · S 下降 · R 上下车 · 中键旋转 · Shift + 中键平移 · 滚轮缩放 · 技能照常释放'
      : following ? '玩法已暂停 · 可切换自由镜头检查场景' : '玩法已暂停 · 左键旋转 · 右键平移 · 滚轮缩放';
    if (!unlimitedFlight && playing) hint.textContent = 'A / D 移动 · 空格跳跃 / 飞行 · S 下穿平台 · 能量门自动感应 · 中键调整镜头';
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
  const toggle = (): void => setPlaying(!playing);
  const toggleCamera = (): void => setFollowing(!following);
  const adjustCamera = (): void => {
    if (following) setFollowing(false);
    for (const preset of app.querySelectorAll('[data-view]')) preset.setAttribute('aria-pressed', 'false');
  };
  orbit.addEventListener('start', adjustCamera);
  button.addEventListener('click', toggle);
  cameraButton.addEventListener('click', toggleCamera);
  const releaseSkill = (event: Event): void => {
    const skill = (event.currentTarget as HTMLButtonElement).dataset.skill as GameAction;
    castSkill(skill);
  };
  for (const skill of skillButtons) skill.addEventListener('click', releaseSkill);
  // 目录与滑杆使用方向键时不驱动角色；keyup 仍由游戏输入在捕获阶段释放。
  const stopKey = (event: Event): void => { if (event.target !== stage.canvas) event.stopPropagation(); };
  app.addEventListener('keydown', stopKey);

  return {
    get body() { return player.entity.body; },
    get playing(): boolean { return playing; },
    get following(): boolean { return following; },
    setPlaying,
    setFollowing,
    setViewAngles(value: readonly [number, number]): void { angles = value; setFollowing(true); },
    select(section: SceneSection): void {
      current = section;
      player.teleport(section.playerX, section.playerY);
      rig.root.position.set(section.playerX, section.playerY, section.walkZ ? section.walkZ(section.playerX, section.playerY) : 0);
      rig.root.rotation.y = player.entity.facing * Math.PI / 2;
      projectiles.sync(player.projectiles, 0, 0);
      animator.reset(player.entity);
      animator.update(player.entity, 0, 0);
      updateHud(0);
      button.disabled = false;
      setPlaying(playing);
      setFollowing(following);
    },
    observe(): void { setFollowing(false); },
    update(dt: number): void {
      if (!playing) return;
      const alpha = stepper.advance(dt, () => {
        const pointer = binding!.pointer;
        const aimPoint = pointer.inside ? follow.screenToWorld(pointer.clientX, pointer.clientY, { x: 0, y: 0 }) : null;
        player.step(tracker.consume(buttonCast ? null : aimPoint));
        buttonCast = false;
        const body = player.entity.body;
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
      projectiles.sync(player.projectiles, alpha, dt);
      weaponHud.handleEvents(player.events.drain());
      updateHud(dt);
      if (following) { follow.update(x, y, entity.facing, dt); aim(); }
    },
    dispose(): void {
      binding?.dispose(); tracker.releaseAll();
      button.removeEventListener('click', toggle);
      cameraButton.removeEventListener('click', toggleCamera);
      orbit.removeEventListener('start', adjustCamera);
      for (const skill of skillButtons) skill.removeEventListener('click', releaseSkill);
      projectiles.dispose(); projectileViews.dispose();
      weaponHud.dispose();
      app.removeEventListener('keydown', stopKey);
    },
  };
}
