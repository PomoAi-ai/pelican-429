import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from '../../config/i18n.ts';
import type { Tuning } from '../../config/tuning.ts';
import type { Rect, Vec2 } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import type { CameraRig } from '../../render/stage/camera-rig.ts';
import { shadowReceiverBounds } from '../../render/stage/shadow-fit.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import { SCENE_VIEW_ANGLES, createSceneViewControls, type SceneViewAngle } from '../../ui/panels/scene-view-controls.tsx';
import { tiltCamera } from '../perspective/perspective-controls.ts';

export type DevCamera = ReturnType<typeof createDevCamera>;

/** 开发开关 cam=free：游戏页的自由镜头、预设视角、暂停与回到起点；帧循环在自由镜头时不再让跟随相机接管。 */
export function createDevCamera(stage: Stage<StageRenderer>, cameraRig: CameraRig, tuning: Tuning) {
  const camera = stage.camera;
  const orbit = new OrbitControls(camera, stage.canvas);
  orbit.enableDamping = true;
  orbit.maxDistance = 300;
  orbit.enabled = false;
  const events = new AbortController();
  const state = { playing: true, following: true, preset: 'front' as SceneViewAngle };
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const tilt = new THREE.Vector3();
  let visible: Rect = cameraRig.visibleRect();
  let disposeView = (): void => {};
  return {
    get following(): boolean { return state.following; },
    get paused(): boolean { return !state.playing; },
    /** 在 cameraRig.update 之后调用：跟随时按预设倾斜，自由镜头由轨道控制器驱动。 */
    update(): void {
      if (!state.following) orbit.update();
      else if (state.preset !== 'front') {
        tilt.set(camera.position.x, camera.position.y, 0);
        tiltCamera(camera, tilt, camera.position.z, SCENE_VIEW_ANGLES[state.preset]);
      }
    },
    /** 正视跟随时就是跟随相机的矩形；倾斜或自由镜头按视锥与阴影深度带求，视锥离开玩耍平面时沿用上一帧。 */
    visibleRect(margin = 0): Rect {
      if (state.following && state.preset === 'front') return cameraRig.visibleRect(margin);
      camera.updateMatrixWorld();
      for (const [index, corner] of corners.entries()) corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(camera);
      const bounds = shadowReceiverBounds(corners, tuning.render.lighting.shadow.zMin, tuning.render.lighting.shadow.zMax);
      if (bounds !== null) visible = { x: bounds.centerX - bounds.halfWidth, y: bounds.centerY - bounds.halfHeight, w: bounds.halfWidth * 2, h: bounds.halfHeight * 2 };
      return { x: visible.x - margin, y: visible.y - margin, w: visible.w + margin * 2, h: visible.h + margin * 2 };
    },
    /** 视角按钮与“回到起点”接到工具条；reset 释放按住的键并清掉未走完的步长。 */
    attach(toolbar: HTMLElement, player: () => Entity, spawn: Readonly<Vec2>, reset: () => void): void {
      const host = document.createElement('span');
      const home = document.createElement('button');
      home.type = 'button';
      home.textContent = t('回到起点');
      toolbar.append(host, home);
      const view = createSceneViewControls(host);
      disposeView = () => { view.dispose(); host.remove(); home.remove(); };
      const sync = (): void => {
        view.set({ playing: state.playing, following: state.following });
        orbit.enabled = !state.following;
        reset();
        stage.canvas.focus({ preventScroll: true });
      };
      const follow = (): void => {
        state.following = true;
        const { body, facing } = player();
        cameraRig.snapTo(body.x, body.y, facing);
        sync();
      };
      view.on(action => {
        if (action === 'play') { state.playing = !state.playing; sync(); }
        else if (action === 'camera') {
          if (!state.following) { follow(); return; }
          state.following = false;
          orbit.target.set(cameraRig.focus.x, cameraRig.focus.y, 0);
          sync();
        } else if (action === 'playView') follow();
        else {
          state.preset = action;
          view.set({ preset: action });
          // 自由镜头绕当前注视点转过去；跟随时 update 每帧按预设倾斜。
          if (!state.following) { tiltCamera(camera, orbit.target, camera.position.distanceTo(orbit.target), SCENE_VIEW_ANGLES[action]); orbit.update(); }
          stage.canvas.focus({ preventScroll: true });
        }
      }, events.signal);
      orbit.addEventListener('start', () => view.set({ preset: null }));
      home.addEventListener('click', () => {
        Object.assign(player().body, { x: spawn.x, y: spawn.y, prevX: spawn.x, prevY: spawn.y, vx: 0, vy: 0 });
        follow();
      }, { signal: events.signal });
    },
    dispose(): void { events.abort(); disposeView(); orbit.dispose(); },
  };
}
