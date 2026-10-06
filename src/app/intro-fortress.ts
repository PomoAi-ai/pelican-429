import { MathUtils } from 'three';
import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import { FORTRESS_BLACKHOLE } from '../config/facility-structure.ts';
import { INTRO_DURATION, INTRO_FORTRESS_REVEAL_AT, INTRO_GOAL_AT, introSceneAt } from '../config/intro.ts';
import { lerp } from '../core/math.ts';
import { createFishSchool } from '../entities/fish.ts';
import { focusHeight } from '../render/camera-rig.ts';
import { createStageRenderer, createStageView } from '../render/stage.ts';
import { createWorldViews } from '../render/world-views.ts';
import { createWorldLight } from '../render/light-texture.ts';
import { createFacilityLevel } from '../world/facility-level.ts';
import { createFacilityPresentation, facilityGameTuning, frameFacilityCamera } from './facility-presentation.ts';
import { createWorldPrecip, facilityWeather } from './precip-wiring.ts';

/** 序章只揭示真实关卡和落点；角色的坠落留给游戏模拟。 */
export async function createIntroFortress() {
  const tuning = facilityGameTuning();
  const renderer = createStageRenderer(tuning);
  // 最后一幕仍需拷贝到 2D 画布，固定像素上限避免高 DPR 放大两次渲染成本。
  renderer.setPixelRatio(1);
  const disposers: Array<() => void> = [() => renderer.dispose()];
  const dispose = (): void => { for (const release of disposers.splice(0).reverse()) release(); };
  try {
    const view = createStageView(renderer, tuning, { quality: 'high', antialias: 'smaa' });
    disposers.push(() => view.dispose());
    const facility = await createFacilityPresentation(view, 'fortress');
    disposers.push(() => facility.dispose());
    const level = createFacilityLevel('fortress');
    disposers.push(() => level.fluid.dispose());
    const weather = facilityWeather('fortress');
    const worldViews = createWorldViews({
      caveBackground: null,
      scene: view.scene, level,
      fish: createFishSchool(level.fishSpawns, level.fluid, tuning.fish),
      weather: { ...tuning.render.weather, direction: 1 }, windMode: weather.wind,
      terrainTextureSize: new URLSearchParams(location.search).get('textures') === 'original' ? 512 : 256,
    });
    disposers.push(() => worldViews.dispose());
    worldViews.weather.setEnabled(false);
    worldViews.weather.wind.setPower(weather.windPower);
    worldViews.weather.wind.setDirection(weather.windDirection);
    const lighting = createWorldLight({ map: level.map, fluid: level.fluid, trees: level.trees, lighting: tuning.render.lighting });
    disposers.push(() => lighting.dispose());
    let frame = 0;
    const precip = createWorldPrecip(view, level, worldViews, null);
    disposers.push(() => precip.dispose());
    const target = { rain: weather.rain, snow: weather.snow };
    // 初次揭示世界时已有雨雪；后续环境时间只随播放推进，拖动不倒退控制器。
    precip.controller.update(0, 0, target, 0, weather);
    let environmentTime = precip.controller.rules.blend;
    let lastSeconds: number | null = null;
    const hole = FORTRESS_BLACKHOLE.position;
    const overview = FACILITY_SCENES.fortress.overview;
    const gameHeight = 2 * tuning.camera.distance * Math.tan(MathUtils.degToRad(view.camera.fov) / 2);
    return {
      canvas: renderer.domElement,
      render(seconds: number, width: number, height: number): void {
        const scale = Math.min(1, 1440 / width, 900 / height);
        const renderWidth = Math.max(1, Math.round(width * scale));
        const renderHeight = Math.max(1, Math.round(height * scale));
        if (renderer.domElement.width !== renderWidth || renderer.domElement.height !== renderHeight) {
          renderer.setSize(renderWidth, renderHeight, false);
          view.setSize(renderWidth, renderHeight);
        }
        const reveal = MathUtils.smoothstep(seconds, introSceneAt('world'), INTRO_FORTRESS_REVEAL_AT);
        const enter = MathUtils.smoothstep(seconds, INTRO_GOAL_AT, INTRO_DURATION);
        const fullHeight = Math.max(overview.height, overview.width / view.camera.aspect);
        const nearHeight = Math.max(18, 22 / view.camera.aspect);
        const visible = frameFacilityCamera(view,
          lerp(lerp(hole.x, overview.x, reveal), hole.x + tuning.camera.lookAhead, enter),
          lerp(lerp(hole.y, overview.y, reveal), hole.y + focusHeight(tuning), enter),
          lerp(lerp(nearHeight, fullHeight, reveal), Math.max(gameHeight, 22 / view.camera.aspect), enter));
        const dt = lastSeconds === null ? 0 : Math.min(tuning.sim.maxFrameTime, Math.max(0, seconds - lastSeconds));
        lastSeconds = seconds;
        environmentTime += dt;
        facility.update(seconds);
        worldViews.update(visible, environmentTime, dt, 1);
        precip.update(visible, environmentTime, dt, target, weather);
        lighting.update(view.scene, ++frame);
        view.render();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
