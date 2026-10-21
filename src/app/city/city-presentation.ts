/**
 * 城区表现：住宅环境（背景、前景、空中交通）与光场的固定灯槽；昼夜与天气灯光由通用接线（precip-wiring）按城区 look 写入。
 * 环境按住宅坐标建模，整体平移 CITY_ORIGIN 放进格子世界，并用平移后的代理相机做分段流式与视差。
 */
import * as THREE from 'three';
import { CITY_ORIGIN, getResidenceResource, RESIDENCE_WORLD, type ResidenceVariant } from '../../config/residence.ts';
import { solarTrackingAngle } from '../../physics/solar-panel.ts';
import { createAiCityEnvironment, type AiCityClearing } from '../../render/city/ai-city-environment.ts';
import { createHarborResidenceEnvironment } from '../../render/city/harbor-residence-environment.ts';
import { createResidenceFourEnvironment } from '../../render/city/residence-four-environment.ts';
import { createResidenceThreeEnvironment } from '../../render/city/residence-three-environment.ts';
import type { Daylight } from '../../render/sky/daylight.ts';
import type { PrecipSkyLook } from '../../render/sky/precip-sky.ts';
import type { PrecipView } from '../../render/sky/precip-view.ts';
import type { WorldLight } from '../../render/stage/light-field-material.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import { cityMap, type CityState } from '../../sim/city.ts';
import { setCitySunAngle, type SimWorld } from '../../sim/sim-world.ts';
import type { GameFeature } from '../game/frame-loop.ts';

interface CityPresentationInput {
  readonly stage: Stage<StageRenderer>;
  readonly world: SimWorld;
  readonly city: CityState;
  readonly worldLight: WorldLight;
  readonly precip: PrecipView;
  readonly daylight: Daylight;
  readonly signal: AbortSignal;
  readonly progress: (completed: number, total: number) => void;
}

/** 城区背景环境：按住宅坐标建模，由城区表现整体平移进格子世界；foreground 交给背景层做近景模糊，没有则为 null。 */
interface CityEnvironment {
  readonly root: THREE.Object3D;
  readonly foreground: THREE.Object3D | null;
  prepare(signal: AbortSignal, progress: (step: { completed: number; total: number }) => void): Promise<void>;
  setCamera(camera: THREE.PerspectiveCamera): void;
  setWeather(look: PrecipSkyLook): void;
  setNightFactor(night: number, moonLight: number): void;
  update(time: number): void;
  dispose(): void;
}

type CityEnvironmentStage = Pick<Stage<StageRenderer>, 'renderer' | 'scene' | 'camera' | 'keyLight'>;

/** clearing 是地图的交通中心用地（住宅坐标），其中不建前景格子；没有交通中心为 null。 */
const CITY_ENVIRONMENTS: Readonly<Record<ResidenceVariant,
  (homeCenter: number, clearing: AiCityClearing | null, stage: CityEnvironmentStage) => CityEnvironment>> = {
  original: (homeCenter, clearing) => createAiCityEnvironment({ homeCenter, scenery: 'full', clearing }),
  harbor: (homeCenter, clearing) => createHarborResidenceEnvironment(homeCenter, clearing),
  three: createResidenceThreeEnvironment,
  four: createResidenceFourEnvironment,
};

// 远景不挂游戏光场。
const markNoLightMap = (root: THREE.Object3D): void => root.traverse(node => {
  if (!(node instanceof THREE.Mesh)) return;
  for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.userData.noLightMap = true;
});

/** 入口门（最低的门）旁的住宅中心，住宅坐标；没有门时取默认出生点。 */
function homeCenter(city: CityState): number {
  const entrance = [...city.building.specials.values()].filter(item => getResidenceResource(item.resourceId).kind === 'door').sort((a, b) => a.y - b.y)[0];
  return entrance ? entrance.x - CITY_ORIGIN.x + (entrance.resourceId === 'door-left' ? 8.5 : -8.5) : RESIDENCE_WORLD.spawn.x;
}

export async function createCityPresentation(input: CityPresentationInput): Promise<GameFeature & { leave(): void; dispose(): void }> {
  const { stage, world, city, worldLight, precip, daylight } = input;
  const environment = CITY_ENVIRONMENTS[city.variant](homeCenter(city), cityMap(city.variant).transit, stage);
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
  if (environment.foreground) stage.backdrop.blur(environment.foreground);
  stage.scene.add(worldLight.lamps);
  const dispose = (): void => {
    worldLight.lamps.removeFromParent(); environment.dispose();
  };
  try {
    await environment.prepare(input.signal, step => input.progress(step.completed, step.total));
  } catch (error) { dispose(); throw error; }
  markNoLightMap(environment.root);
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
      syncProxy();
      environment.setWeather(look);
      environment.setNightFactor(t.night, t.moonLight);
      environment.update(time);
      // 环境分段按镜头逐个建出。
      markNoLightMap(environment.root);
    },
    dispose,
  };
}
