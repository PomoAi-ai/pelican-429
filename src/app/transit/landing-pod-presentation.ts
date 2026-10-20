/**
 * 着陆舱的游戏内表现：舱模型随模拟的开场降落、停靠与起飞摆放玩家视图；机房关卡停着可返程的舱时另建返程穿梭层，
 * 舱升到下降起始高度后急加速飞走即离开关卡，回到主世界城区（沿用同一份种子、规模与 GM），由城区页的着陆舱降落在交通中心旁。
 * 另有坐着陆舱抵达（landing=1）时接着上一页穿梭画面的启动加载层。
 */
import type * as THREE from 'three';
import { t } from '../../config/i18n.ts';
import { createLandingPod, type LandingPod } from '../../render/transit/transit-landing-pod.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import type { PodLanding } from '../../sim/pod-landing.ts';
import { getPlayer, type SimWorld } from '../../sim/sim-world.ts';
import { createSceneLoading } from '../shell/scene-loading.ts';
import { createReturnCorridorOverlay } from './return-corridor-overlay.ts';

/** 坐着陆舱抵达：接着上一页的穿梭画面加载，首帧画好后揭幕；启动失败时换成加载画面显示错误。 */
export function createCorridorStartupLoading(): Pick<ReturnType<typeof createSceneLoading>, 'progress' | 'hide' | 'error' | 'dispose'> {
  const corridor = createReturnCorridorOverlay(document.body, true);
  return {
    progress: corridor.progress,
    async hide() { corridor.hide(.8); },
    error(error) {
      corridor.hide(0);
      const loading = createSceneLoading(document.body, () => location.reload());
      loading.show(t('鹈鹕 429'), 'PELICAN 429', 4);
      loading.error(error);
    },
    dispose() { corridor.hide(0); },
  };
}

export interface LandingPodPresentationOptions {
  readonly stage: Stage<StageRenderer>;
  readonly world: SimWorld;
  readonly landing: PodLanding;
  /** 关卡里停着可返程的舱（机房关卡）：建返程穿梭层，飞走后回城区。 */
  readonly returnable: boolean;
  readonly playerView: () => THREE.Object3D;
  readonly cameraDistance: number;
  /** 当前页网址参数：返程时带走种子、规模与 GM。 */
  readonly params: URLSearchParams;
  readonly releaseInput: () => void;
}

export function createLandingPodPresentation(o: LandingPodPresentationOptions): { readonly lander: LandingPod; update(): void; dispose(): void } {
  const { world } = o;
  const lander = createLandingPod(o.stage, o.landing, {
    landing: () => world.podLanding, takeoff: () => world.podTakeoff !== null,
    body: () => getPlayer(world).body, step: world.tuning.sim.step, planeZ: 0, cameraDistance: o.cameraDistance,
    carry(pose) {
      // The view's outer group rotates about the world origin, so it shifts back by the rotated body x to pivot about the body.
      const player = o.playerView();
      if (pose === null) { player.position.set(0, 0, 0); player.rotation.y = 0; return; }
      player.rotation.y = pose.yaw;
      player.position.set(pose.x * (1 - Math.cos(pose.yaw)), pose.lift, pose.z + pose.x * Math.sin(pose.yaw));
    },
  });
  // 返程穿梭层趁加载时隐藏着建好：新建渲染器会卡一两秒，留到飞走那一刻会把急加速冻住。
  const corridor = o.returnable ? createReturnCorridorOverlay(document.body, false) : null;
  let returning = false;
  return {
    lander,
    update() {
      if (corridor === null || returning || !lander.launched()) return;
      returning = true;
      o.releaseInput();
      const city = new URLSearchParams({ mode: 'game', landing: '1' });
      for (const key of ['seed', 'size', 'gm']) {
        const value = o.params.get(key);
        if (value !== null) city.set(key, value);
      }
      // 舱急加速冲出画面时淡入温和版穿梭画面再跳转，城区页以同一画面开场，加载完成后揭幕。
      corridor.depart(`${location.pathname}?${city}`);
    },
    dispose() {
      corridor?.hide(0);
      lander.dispose();
    },
  };
}
