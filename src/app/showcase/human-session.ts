import * as THREE from 'three';
import { GRASSY_HEIGHT, GRASSY_MODELS, grassyAction } from '../../config/grassy.ts';
import type { ShowcaseCard, ShowcaseEntry } from '../../config/showcase.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createGrassyStaticModel, loadGrassyStaticAsset } from '../../render/grassy/grassy-static.ts';
import type { GrassyStaticModel } from '../../render/grassy/grassy-static.ts';
import { createGrassyRig, loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import type { GrassyRig } from '../../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../../render/grassy/grassy-animator.ts';
import { DEFAULT_PELICAN_ANIM_TUNING } from '../../render/pelican/pelican-animator.ts';
import { createStageView } from '../../render/stage.ts';
import type { InputFrame } from '../../sim/sim-world.ts';

/** 模型与骨骼动作来自共享资源；展示场只管理版本、播放时间、灯光与镜头。 */
export function createHumanShowcaseSession(renderer: THREE.WebGLRenderer, card: ShowcaseCard) {
  const stage = createStageView(renderer, TUNING, { quality: 'high', antialias: 'msaa' });
  let entry = showcaseEntry(card.entryId);
  let model: GrassyStaticModel | null = null;
  let rig: GrassyRig | null = null;
  const floorGeometry = new THREE.CircleGeometry(5, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#a8c6b7', roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  stage.scene.add(floor);
  const screen = new THREE.Vector3();
  const target = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const cameraBack = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const yawAxis = new THREE.Vector3(0, 1, 0);
  let time = 0;
  let viewYaw = card.modelYaw;
  let viewPitch = card.modelPitch;
  let request = 0;
  let revision = card.revision;
  let width = 0;
  let height = 0;
  let disposed = false;

  function assetKey(item: ShowcaseEntry): string {
    return item.grassyAnimation ? `animated:${item.grassyAnimation.variant}` : `static:${item.action}`;
  }

  function duration(): number {
    return rig && entry.grassyAnimation ? entry.grassyAnimation.clip === 'codex_attack'
      ? grassyAction('codex_attack').seconds : rig.actions[entry.grassyAnimation.clip].getClip().duration : 0;
  }

  function animate(frameDt: number): void {
    const { clip, flight } = entry.grassyAnimation!;
    animateGrassy(rig!, clip, time, frameDt, null, flight ? { action: flight, time } : null);
  }

  function show(): void {
    const currentRequest = ++request;
    const animation = entry.grassyAnimation;
    const staticVariant = animation ? null : GRASSY_MODELS.find((item) => item.id === entry.action)!;
    model?.dispose();
    model = null;
    rig = null;
    const pending = animation ? loadGrassyAsset(animation.variant) : loadGrassyStaticAsset(staticVariant!.id);
    // 加载失败不在这里处理，交给展示场的 unhandledrejection 显示错误。
    void pending.then(() => {
      // 请求序号也覆盖 A → B → A；较旧的回调不能覆盖最后一次选择。
      if (disposed || currentRequest !== request) return;
      if (animation) {
        rig = createGrassyRig(animation.variant);
        model = rig;
        animate(0);
      } else model = createGrassyStaticModel(staticVariant!.id);
      stage.scene.add(model.root);
    });
  }

  function reset(): void {
    const next = showcaseEntry(card.entryId);
    const assetChanged = assetKey(next) !== assetKey(entry);
    entry = next;
    time = 0;
    if (assetChanged) show();
    revision = card.revision;
    const underground = card.environment === 'underground';
    stage.scene.background = new THREE.Color(underground ? '#172b3b' : '#d6e5df');
    floorMaterial.color.set(underground ? '#465567' : '#a8c6b7');
    stage.hemiLight.intensity = TUNING.render.hemi * (underground ? 0.65 : 1);
    if (rig && entry.grassyAnimation) { rig.motionPose.reset(); animate(0); }
  }
  show();
  reset();

  return {
    get ready() { return model !== null; },
    get complete() { return rig !== null && time >= duration(); },
    get ticks() { return Math.floor(time / TUNING.sim.step); },
    get duration() { return duration(); },
    get progress() { return model ? rig ? Math.min(1, time / duration()) : 1 : 0; },
    get status() {
      if (!model) return `${entry.label} · 正在加载模型…`;
      return `${entry.label} · ${rig ? time >= duration() ? '演示完成' : '骨骼动画' : '静态'} · ${GRASSY_HEIGHT} 格`;
    },
    get needsReset() { return revision !== card.revision; },
    reset,
    advance(elapsed: number, playing: boolean, _manual: (() => InputFrame) | null): number {
      // 检视旋转沿最短圆弧缓动，暂停骨骼动作时仍可调整视角。
      const blend = 1 - Math.exp(-DEFAULT_PELICAN_ANIM_TUNING.yawRate * elapsed);
      viewYaw += Math.atan2(Math.sin(card.modelYaw - viewYaw), Math.cos(card.modelYaw - viewYaw)) * blend;
      viewPitch += (card.modelPitch - viewPitch) * blend;
      if (!rig || !entry.grassyAnimation || !playing || time >= duration()) return 0;
      const dt = Math.min(Math.min(elapsed, TUNING.sim.maxFrameTime) * card.speed, duration() - time);
      time += dt;
      animate(dt);
      return dt;
    },
    render(rect: DOMRect, _dt: number, worldScale: boolean): THREE.Texture {
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== width || h !== height) { width = w; height = h; stage.setSize(w, h); }
      if (model) model.root.rotation.y = viewYaw;
      const action = entry.grassyAnimation ? grassyAction(entry.grassyAnimation.clip) : null;
      const framingHeight = action ? action.viewHeight : 3.8;
      const center = action ? action.viewCenter : GRASSY_HEIGHT / 2;
      const viewHeight = worldScale ? 6 : Math.max(framingHeight, framingHeight * 0.56 / stage.camera.aspect);
      const tangent = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2);
      let distance = viewHeight / (2 * tangent);
      target.set(0, center, 0);
      cameraBack.set(0, Math.sin(viewPitch), Math.cos(viewPitch));
      cameraUp.set(0, Math.cos(viewPitch), -Math.sin(viewPitch));
      if (!worldScale && action && 'viewBounds' in action) {
        const flight = entry.grassyAnimation!.flight;
        // 空中组合需要为抬高的发射点和后收双腿保留取景余量。
        const min: [number, number, number] = [...action.viewBounds.min];
        const max: [number, number, number] = [...action.viewBounds.max];
        if (flight) {
          min[0] -= 0.35; max[0] += 0.35;
          min[1] -= 0.7; max[1] += 0.9;
          min[2] -= 0.8; max[2] += 0.8;
        }
        target.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).applyAxisAngle(yawAxis, viewYaw);
        // 随模型旋转弹道范围，以最小透视距离容纳完整技能，侧面与背面也不裁掉远端。
        for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
          corner.set(x, y, z).applyAxisAngle(yawAxis, viewYaw).sub(target);
          const extent = Math.max(Math.abs(corner.x) / stage.camera.aspect, Math.abs(corner.dot(cameraUp)));
          distance = Math.max(distance, corner.dot(cameraBack) + extent * 1.08 / tangent);
        }
      }
      stage.camera.position.copy(target).addScaledVector(cameraBack, distance / card.zoom);
      stage.camera.lookAt(target);
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
      model?.dispose();
      stage.dispose();
    },
  };
}
