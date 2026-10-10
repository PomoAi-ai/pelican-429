import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TUNING } from '../config/tuning.ts';
import type { ShowcaseCard } from '../config/showcase.ts';
import { createStage } from '../render/stage.ts';
import { disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { disposeGrassyStaticAssets } from '../render/grassy/grassy-static.ts';
import { disposeD1Assets } from '../render/grassy/d1-rig.ts';
import { disposeEnemyAssets } from '../render/enemy-rig.ts';
import { disposeNpcAssets } from '../render/npc/npc-rig.ts';
import { DUMMY_HEALTH_LAYER } from '../render/entity-views.ts';
import { createCharacterStagePanel } from '../ui/character-stage-panel.ts';
import type { ShowcaseModel } from '../ui/showcase-model.ts';
import { createStageActor } from './showcase/stage-actor.ts';
import type { StageActor } from './showcase/stage-actor.ts';
import { createStageGround } from './showcase/stage-ground.ts';
import { createStageDragControls } from './showcase/stage-drag-controls.ts';
import type { CharacterStageView } from '../ui/character-stage-location.ts';

/** 角色共享一个舞台和后期通道；独立实例仅持有自己的动作与视图。 */
export function startCharacterStage(parent: HTMLElement, model: ShowcaseModel, returnUrl: string, view: CharacterStageView): void {
  const actors = new Map<number, { key: string; actor: StageActor; framing: StageActor['framing']; placed: boolean }>();
  const preparing = new Map<number, string>();
  const panel = createCharacterStagePanel(parent, model, returnUrl, async (card, enabled) => {
    const actor = actors.get(card.id)?.actor;
    if (!actor?.setSoundEnabled) throw new Error('角色尚未加载完成，暂时无法播放声音。');
    if (enabled) for (const [id, other] of actors) if (id !== card.id) await other.actor.setSoundEnabled?.(false);
    if (enabled) actor.reset();
    await actor.setSoundEnabled(enabled);
  }, view);
  const stage = createStage(panel.viewport, TUNING, { quality: 'low', antialias: 'msaa' });
  stage.camera.layers.enable(DUMMY_HEALTH_LAYER);
  stage.camera.near = .05;
  stage.camera.updateProjectionMatrix();
  stage.canvas.setAttribute('aria-label', '角色草地场景：点击角色或按 Enter 选择角色并打开工具条，拖动角色调整位置，拖动空白平移摄像头，滚轮或双指缩放，点击空白或按左右方向键切换轻微角度');
  stage.canvas.tabIndex = 0;
  const cameraControls = new OrbitControls(stage.camera, stage.canvas);
  cameraControls.enableRotate = false;
  cameraControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  cameraControls.touches.ONE = THREE.TOUCH.PAN;
  let cameraGestureMoved = false;
  cameraControls.addEventListener('start', () => { cameraGestureMoved = false; });
  let baseDistance = 1;
  let cameraZoom = panel.zoom;
  cameraControls.addEventListener('change', () => {
    cameraGestureMoved = true;
    panel.setZoom(baseDistance / stage.camera.position.z);
    cameraZoom = panel.zoom;
  });
  const pivot = new THREE.Group();
  const content = new THREE.Group();
  pivot.add(content);
  stage.scene.add(pivot);
  const dragControls = createStageDragControls(stage.canvas, stage.camera, content, actors, cameraControls,
    () => { cameraGestureMoved = true; }, id => panel.selectActor(id));
  const ground = createStageGround(content);
  const angles = [0, 8, -8];
  let angleIndex = angles.indexOf(view.angle);
  pivot.rotation.y = THREE.MathUtils.degToRad(view.angle);
  const changeAngle = (direction: number): void => {
    angleIndex = (angleIndex + direction + angles.length) % angles.length;
    view.angle = angles[angleIndex]!;
    pivot.rotation.y = THREE.MathUtils.degToRad(view.angle);
  };
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane();
  const groundBounds = new THREE.Box3();
  const groundCorner = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const localAim = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const screenCorners = [new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1), new THREE.Vector2(-1, 1), new THREE.Vector2(1, 1)];
  const onSceneAim = (event: PointerEvent): void => {
    const rect = stage.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, stage.camera);
    if (!raycaster.ray.intersectPlane(groundPlane, aimPoint)) return;
    for (const { actor } of actors.values()) {
      if (!actor.aimAt) continue;
      actor.root.worldToLocal(localAim.copy(aimPoint));
      actor.aimAt(localAim.x, localAim.y);
    }
  };
  const onSceneClick = (event: MouseEvent): void => {
    if (cameraGestureMoved) return;
    if (dragControls.hitActor(event) === undefined) changeAngle(1);
  };
  const onSceneKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      panel.selectNextActor();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    changeAngle(event.key === 'ArrowRight' ? 1 : -1);
  };
  stage.canvas.addEventListener('click', onSceneClick);
  stage.canvas.addEventListener('keydown', onSceneKey);
  stage.canvas.addEventListener('pointermove', onSceneAim);
  let stopped = false;
  let raf = 0;
  let last = performance.now();
  let layoutKey = '';
  const resetCamera = (): void => { panel.setZoom(1); layoutKey = ''; };
  panel.resetCamera.addEventListener('click', resetCamera);
  let environment = '';
  const loading = document.getElementById('loading')!;
  const key = (card: ShowcaseCard): string => {
    const entry = model.entry(card.entryId);
    return entry.npcForm ? entry.actor : `${card.entryId}:${card.revision}`;
  };

  const dispose = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    dragControls.dispose();
    for (const { actor } of actors.values()) actor.dispose();
    actors.clear();
    ground.dispose();
    stage.canvas.removeEventListener('click', onSceneClick);
    stage.canvas.removeEventListener('keydown', onSceneKey);
    stage.canvas.removeEventListener('pointermove', onSceneAim);
    cameraControls.dispose();
    panel.resetCamera.removeEventListener('click', resetCamera);
    stage.dispose(); panel.dispose();
    disposeGrassyAssets(); disposeGrassyStaticAssets(); disposeD1Assets(); disposeEnemyAssets(); disposeNpcAssets();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', dispose);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const fail = (error: unknown): void => {
    dispose();
    console.error(error);
    document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
    document.getElementById('error')!.hidden = false;
    loading.hidden = true;
  };
  const onError = (event: ErrorEvent): void => fail(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent): void => fail(event.reason);
  const onVisibility = (): void => {
    last = performance.now();
    if (document.hidden) {
      dragControls.cancel();
      for (const { actor } of actors.values()) void actor.setSoundEnabled?.(false);
    }
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', dispose);
  document.addEventListener('visibilitychange', onVisibility);

  const frame = (now: number): void => {
    if (stopped) return;
    const elapsed = Math.min((now - last) / 1000, TUNING.sim.maxFrameTime);
    last = now;
    try {
      for (const [id, item] of actors) {
        const card = model.cards.find((item) => item.id === id);
        if (!card) { dragControls.cancel(); item.actor.dispose(); actors.delete(id); }
      }
      const pending = model.cards.find((card) => actors.get(card.id)?.key !== key(card) && preparing.get(card.id) !== key(card));
      if (pending) {
        const requestedKey = key(pending);
        preparing.set(pending.id, requestedKey);
        const isCurrent = (): boolean => !stopped && model.cards.includes(pending) && key(pending) === requestedKey;
        void createStageActor(pending, isCurrent).then((actor) => {
          if (preparing.get(pending.id) === requestedKey) preparing.delete(pending.id);
          if (!actor) return;
          if (!isCurrent()) { actor.dispose(); return; }
          const previous = actors.get(pending.id);
          // 动作只替换实例内容，沿用入场时的占位和镜头范围。
          if (previous) { actor.root.position.copy(previous.actor.root.position); previous.actor.dispose(); }
          actors.set(pending.id, { key: requestedKey, actor, framing: previous ? previous.framing : { ...actor.framing }, placed: previous?.placed ?? false });
          content.add(actor.root);
          if (!previous) layoutKey = '';
        }).catch(fail);
      }
      if (!document.hidden) {
        const rect = panel.viewport.getBoundingClientRect();
        const nextLayout = `${model.cards.map((card) => card.id).join(',')}:${rect.width}:${rect.height}`;
        if (nextLayout !== layoutKey) {
          layoutKey = nextLayout;
          let left = Infinity;
          let right = -Infinity;
          let height = 5;
          for (const item of actors.values()) {
            if (!item.placed) continue;
            const center = item.actor.root.position.x + item.framing.x;
            left = Math.min(left, center - item.framing.width / 2);
            right = Math.max(right, center + item.framing.width / 2);
          }
          for (const card of model.cards) {
            const item = actors.get(card.id);
            if (!item) continue;
            if (!item.placed) {
              const start = right === -Infinity ? 0 : right + 2;
              item.actor.root.position.x = start + item.framing.width / 2 - item.framing.x;
              item.placed = true;
              left = Math.min(left, start);
              right = start + item.framing.width;
            }
            height = Math.max(height, item.framing.y + item.framing.height / 2);
          }
          const width = actors.size ? Math.max(5, right - left) : 5;
          const centerX = actors.size ? (left + right) / 2 : width / 2;
          pivot.position.x = centerX;
          content.position.x = -centerX;
          const centerY = height * 0.45;
          const viewHeight = Math.max(height * 1.5, (width + 3) / stage.camera.aspect);
          baseDistance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
          stage.camera.position.set(centerX, centerY, baseDistance / panel.zoom);
          stage.camera.lookAt(centerX, centerY, 0);
          cameraControls.target.set(centerX, centerY, 0);
          cameraControls.minDistance = baseDistance / 12;
          cameraControls.maxDistance = baseDistance / .65;
          cameraControls.update();
        }
        if (cameraZoom !== panel.zoom) {
          stage.camera.position.z = baseDistance / panel.zoom;
          cameraControls.update();
        }
        if (environment !== panel.environment) {
          environment = panel.environment;
          const underground = environment === 'underground';
          stage.scene.background = new THREE.Color(underground ? '#172b3b' : '#b8ccc4');
          stage.hemiLight.intensity = TUNING.render.hemi * (underground ? 0.65 : 1);
        }
        for (const card of model.cards) {
          const item = actors.get(card.id);
          const view = panel.views.get(card.id)!;
          if (!item || item.key !== key(card)) { view.update('正在准备预览…', 0, true); continue; }
          const { actor } = item;
          if (card.playing && card.loop && actor.complete) actor.reset();
          actor.update(elapsed);
          if ((model.entry(card.entryId).npcForm || model.entry(card.entryId).actor === 'luma') && (item.framing.y !== actor.framing.y
            || item.framing.width !== actor.framing.width || item.framing.height !== actor.framing.height)) {
            Object.assign(item.framing, actor.framing);
            layoutKey = '';
          }
          view.update(actor.status, actor.progress, !actor.ready);
        }
        stage.camera.updateMatrixWorld();
        content.updateWorldMatrix(true, false);
        groundPlane.normal.set(0, 0, 1); groundPlane.constant = 0;
        groundPlane.applyMatrix4(content.matrixWorld);
        groundBounds.makeEmpty();
        for (const corner of screenCorners) {
          raycaster.setFromCamera(corner, stage.camera);
          // 接近地平线、射线不再交地面时，以可视远端限定流式范围。
          if (!raycaster.ray.intersectPlane(groundPlane, groundCorner)) raycaster.ray.at(stage.camera.far, groundCorner);
          content.worldToLocal(groundCorner);
          groundBounds.expandByPoint(groundCorner);
        }
        ground.update({ x: groundBounds.min.x - 4, y: groundBounds.min.y - 4, w: groundBounds.max.x - groundBounds.min.x + 8, h: groundBounds.max.y - groundBounds.min.y + 8 }, now / 1000);
        stage.render();
        panel.setNote(`场景中 ${model.cards.length} 个角色 · 角度 ${angles[angleIndex]}° · 点击空白切换`);
        loading.hidden = true;
      }
      raf = requestAnimationFrame(frame);
    } catch (error) { fail(error); }
  };
  raf = requestAnimationFrame(frame);
}
