/**
 * 城区表现：住宅环境（背景、前景、空中交通）与建筑的城区光场着色；昼夜与天气灯光由通用接线（precip-wiring）按城区 look 写入。
 * 环境按住宅坐标建模，整体平移 CITY_ORIGIN 放进格子世界，并用平移后的代理相机做分段流式与视差。
 * 城区光场着色是 GLSL 注入，只用于 WebGL；WebGPU 下建筑改挂通用光场（无窗光与日照步进）。
 */
import * as THREE from 'three';
import { CITY_ORIGIN, getResidenceResource, RESIDENCE_TRANSIT, RESIDENCE_WORLD } from '../../config/residence.ts';
import { solarTrackingAngle } from '../../physics/solar-panel.ts';
import { createAiCityEnvironment } from '../../render/city/ai-city-environment.ts';
import { createHarborResidenceEnvironment } from '../../render/city/harbor-residence-environment.ts';
import type { Daylight } from '../../render/sky/daylight.ts';
import type { PrecipView } from '../../render/sky/precip-view.ts';
import { createCityLighting } from '../../render/stage/light-field-city.ts';
import type { WorldLight } from '../../render/stage/light-field-material.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import type { WorldViews } from '../../render/stage/world-views.ts';
import type { CityState } from '../../sim/city.ts';
import { setCitySunAngle, type SimWorld } from '../../sim/sim-world.ts';
import type { GameFeature } from '../game/frame-loop.ts';

export interface CityPresentationInput {
  readonly stage: Stage<StageRenderer>;
  readonly world: SimWorld;
  readonly city: CityState;
  readonly worldViews: WorldViews;
  readonly worldLight: WorldLight;
  readonly precip: PrecipView;
  readonly daylight: Daylight;
  readonly signal: AbortSignal;
  readonly progress: (completed: number, total: number) => void;
}

const markLightMap = (root: THREE.Object3D, noLightMap: boolean): void => root.traverse(node => {
  if (!(node instanceof THREE.Mesh)) return;
  for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.userData.noLightMap = noLightMap;
});

const isWebGlStage = (stage: Stage<StageRenderer>): stage is Stage => stage.renderer instanceof THREE.WebGLRenderer;

/** 入口门（最低的门）旁的住宅中心，住宅坐标；没有门时取默认出生点。 */
function homeCenter(city: CityState): number {
  const entrance = [...city.building.specials.values()].filter(item => getResidenceResource(item.resourceId).kind === 'door').sort((a, b) => a.y - b.y)[0];
  return entrance ? entrance.x - CITY_ORIGIN.x + (entrance.resourceId === 'door-left' ? 8.5 : -8.5) : RESIDENCE_WORLD.spawn.x;
}

export async function createCityPresentation(input: CityPresentationInput): Promise<GameFeature & { leave(): void; dispose(): void }> {
  const { stage, world, city, worldViews, worldLight, precip, daylight } = input;
  const harbor = city.variant === 'harbor';
  const center = homeCenter(city);
  const environment = harbor ? createHarborResidenceEnvironment(center, RESIDENCE_TRANSIT) : createAiCityEnvironment({ homeCenter: center, scenery: 'full' });
  environment.root.position.set(CITY_ORIGIN.x, CITY_ORIGIN.y, 0);
  const proxy = new THREE.PerspectiveCamera();
  const syncProxy = (): void => {
    proxy.copy(stage.camera);
    proxy.position.x -= CITY_ORIGIN.x;
    proxy.position.y -= CITY_ORIGIN.y;
    proxy.updateMatrixWorld();
    environment.setCamera(proxy);
  };
  syncProxy();
  stage.scene.add(environment.root);
  if (!stage.backdrop) throw new Error('city-presentation: stage.addBackdrop must run first');
  stage.backdrop.blur(environment.foreground);
  const cityLighting = isWebGlStage(stage)
    ? createCityLighting(worldLight.field, worldLight.atlas, { slots: stage.quality === 'low' ? 2 : 4, undergroundTop: city.building.site.foundationTop }) : null;
  if (cityLighting) stage.scene.add(cityLighting.root);
  const dispose = (): void => {
    cityLighting?.dispose(); environment.dispose();
  };
  try {
    await environment.prepare(input.signal, step => input.progress(step.completed, step.total));
  } catch (error) { dispose(); throw error; }
  markLightMap(environment.root, true);
  // 城区背景层远在玩法层之后。
  stage.camera.far = Math.max(stage.camera.far, RESIDENCE_WORLD.width * 8);
  stage.camera.updateProjectionMatrix();
  let left = false;
  return {
    paused: false,
    /** 星舰进入穿越航道：城区整体隐藏，环境不再推进。 */
    leave() {
      left = true;
    },
    update(_view, time) {
      if (left) return;
      const t = daylight.time;
      setCitySunAngle(world, solarTrackingAngle(t.sunDirection));
      const look = precip.sky.look!;
      // 新建的块与建筑网格接入城区光场着色；WebGPU 下撤掉标记，由通用光场在下一次遍历时挂上。
      if (worldViews.takeBuildingChanges()) {
        for (const root of [worldViews.pieces.root, worldViews.buildings.root]) {
          if (cityLighting) cityLighting.attach(root);
          else markLightMap(root, false);
        }
      }
      syncProxy();
      environment.setWeather(look);
      environment.setNightFactor(t.night, t.moonLight);
      environment.update(time);
      // 环境分段按镜头逐个建出，远景不挂游戏光场。
      markLightMap(environment.root, true);
      cityLighting?.setFrame(stage.camera, t.night, time, daylight.skyTint);
    },
    dispose,
  };
}
