import * as THREE from 'three';
import { DEFAULT_PRECIP } from '../../config/precip-rules.ts';
import { SCENE_DEMOS } from '../../config/scene-demos.ts';
import { TUNING } from '../../config/tuning.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import type { DefinitionCollider, DefinitionPlatform } from '../../physics/definition-collision.ts';
import { tileDefinitionCollision } from '../../physics/tile-definition-collision.ts';
import { loadInteriorBackgroundTexture } from '../../render/stage/free-world-interior-textures.ts';
import { loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { caption } from '../../render/npc/npc-effects.ts';
import { computePrecipColumn } from '../../render/sky/precip-columns.ts';
import { LAB_CATALOG } from '../../render/resource/resource-catalog.ts';
import { createResourcePreview } from '../../render/resource/resource-preview.ts';
import { levelGroundColumns } from '../../render/decor/surface-decor-view.ts';
import { WIND_UNIFORM_NAMES, sharedWindUniforms, windUniformValues, writeWindUniforms } from '../../render/sky/wind.ts';
import { createWorldViews } from '../../render/stage/world-views.ts';
import { labCardText } from '../../ui/model/lab-card-text.ts';
import { createShowcaseModel } from '../../ui/model/showcase-model.ts';
import { TILE_AIR, TILE_GRASS, TILE_DIRT } from '../../world/tile-types.ts';
import { createResourceScenario } from '../showcase/resource-scenario.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { createSceneDemoStage } from '../workspace/scene-demo-stage.ts';
import { waitSceneResource, yieldScene, type SceneMountContext } from '../workspace/scene-mount.ts';
import { t } from '../../config/i18n.ts';

/** 原对照样本保持自己的种子与风场，沿同一条可行走路线排列。 */
export async function mountSceneDemo(context: SceneMountContext, demoId: string): Promise<void> {
  const demo = SCENE_DEMOS.find(item => item.id === demoId);
  if (!demo) throw new Error(`未知场景演示：${demoId}`);
  const model = createShowcaseModel(LAB_CATALOG);
  model.showDemo(demo);
  const runtime = createSceneDemoStage(context);
  const { stage } = runtime;
  context.progress(t('加载主角与场景贴图'), 0, 2);
  let completed = 0;
  const loaded = (): void => context.progress(t('加载主角与场景贴图'), ++completed, 2);
  const [, caveBackground] = await waitSceneResource(Promise.all([
    loadGrassyAsset('game').then(loaded),
    loadInteriorBackgroundTexture(stage.renderer, 'cave').then(texture => {
      if (context.signal.aborted) texture.dispose();
      else context.onDispose(() => texture.dispose());
      loaded(); return texture;
    }),
  ]), context.signal);
  context.signal.throwIfAborted();
  const solids: DefinitionCollider[] = [];
  const platforms: DefinitionPlatform[] = [];
  const sections: SceneSection[] = [];
  const samples: Array<{ update(time: number, dt: number, view: { x: number; y: number; w: number; h: number }): void }> = [];
  const columnReaders: Array<(columns: Float32Array) => void> = [];
  let nextX = 0;
  let top = 36;
  const commonGround = 14;
  for (const [index, card] of model.cards.entries()) {
    context.progress(t('装配真实场景样本'), index, model.cards.length);
    await yieldScene(context.signal);
    const scenario = createResourceScenario(card);
    context.onDispose(() => scenario.dispose());
    const { level } = scenario.world;
    const focus = scenario.focus();
    const left = Math.max(2, Math.floor(focus.x - Math.max(18, scenario.width) / 2 - 2));
    const right = Math.min(level.map.width - 2, Math.ceil(focus.x + Math.max(18, scenario.width) / 2 + 2));
    const width = right - left;
    const offsetX = nextX - left;
    const offsetY = commonGround - scenario.groundY;
    const floor = demoId === 'plants' ? scenario.groundY - 5 : scenario.groundY;
    // 清掉旧展示卡片外围与下方备用楼层，避免拼合后出现重叠地形。
    for (let y = 0; y < level.map.height; y++) for (let x = 0; x < level.map.width; x++) {
      if (x < left || x >= right || y < scenario.groundY - 9) {
        level.map.set(x, y, TILE_AIR);
        level.fluid.set(x, y, 0);
        level.caves.mask[y * level.map.width + x] = 0;
      }
    }
    // 附着植物悬于上方，下方步道能实际走到其底面检查根点。
    if (demoId === 'plants') for (let x = left; x < right; x++) for (let y = floor - 3; y < floor; y++) {
      level.map.set(x, y, y === floor - 1 ? TILE_GRASS : TILE_DIRT);
    }
    const local = new THREE.Scene();
    local.name = `sample-${demoId}-${index}`;
    local.position.set(offsetX, offsetY, 0);
    stage.scene.add(local);
    context.onDispose(() => local.removeFromParent());
    const views = createWorldViews({ scene: local, caveBackground, level, fish: scenario.world.fish,
      ground: scenario.groundColumns ?? levelGroundColumns(level), windMode: card.resource!.wind });
    views.weather.setEnabled(false);
    context.onDispose(() => views.dispose());
    const resource = createResourcePreview(local, level, scenario.groundY, card, views,
      { ...focus, width: scenario.width, height: scenario.height });
    context.onDispose(() => resource.dispose());
    const collision = tileDefinitionCollision(level.map, offsetX, offsetY);
    solids.push(...collision.solids);
    platforms.push(...collision.platforms);
    const text = labCardText(card, model);
    const label = caption(() => t(text.title), '#ebf8ed', Math.min(width - 2, 5), true, 'comic');
    label.position.set(focus.x, floor - 1.5, 1.1);
    local.add(label);
    context.onDispose(() => { label.material.map!.dispose(); label.material.dispose(); });
    sections.push({ id: `${demoId}-${index}`, title: t(text.title), description: t(text.detail),
      x: nextX + width / 2, y: commonGround + 5, width, height: scenario.height,
      playerX: nextX + 2, playerY: floor + offsetY + .1, items: [] });
    top = Math.max(top, scenario.groundY + offsetY + scenario.height + 10);
    const stepper = createFixedStepper(TUNING.sim);
    const patched = new WeakSet<THREE.Object3D>();
    const windUniforms = sharedWindUniforms();
    const wind = views.weather.wind;
    let windValues = windUniformValues(wind.rules, wind.time, wind.state, wind.cloudDrift);
    samples.push({
      update(time, dt, view) {
        const visible = view.x + view.w >= nextBoundary && view.x <= nextBoundary + width;
        local.visible = visible;
        if (!visible) return;
        const alpha = stepper.advance(dt, () => scenario.step());
        const settings = context.world.weatherConfig;
        const windMode = demoId === 'wind' ? card.resource!.wind : settings.wind;
        if (wind.mode !== windMode) wind.setMode(windMode);
        wind.setPower(settings.windPower);
        wind.setDirection(settings.windDirection);
        views.update({ x: view.x - offsetX, y: view.y - offsetY, w: view.w, h: view.h }, time, dt, alpha);
        resource.update(time);
        windValues = windUniformValues(wind.rules, wind.time, wind.state, wind.cloudDrift);
        windValues = { ...windValues, uCloudShadow: 0 };
        // 原画廊逐卡绘制；合为一个场景后须在每个样本绘制时恢复自己的风力。
        local.traverse(object => {
          if (patched.has(object)) return;
          patched.add(object);
          const saved = { ...windValues };
          const begin = (): void => {
            for (const key of WIND_UNIFORM_NAMES) saved[key] = windUniforms[key].value;
            writeWindUniforms(windUniforms, windValues);
          };
          const before = object.onBeforeRender;
          object.onBeforeRender = function (...args) { begin(); before.apply(this, args); };
          const after = object.onAfterRender;
          object.onAfterRender = function (...args) { after.apply(this, args); writeWindUniforms(windUniforms, saved); };
          const shadow = object.onBeforeShadow;
          object.onBeforeShadow = function (...args) { begin(); shadow.apply(this, args); };
          const shadowEnd = object.onAfterShadow;
          object.onAfterShadow = function (...args) { shadowEnd.apply(this, args); writeWindUniforms(windUniforms, saved); };
        });
      },
    });
    const nextBoundary = nextX;
    const precipSource = { map: level.map, fluid: level.fluid, deserts: level.deserts, desertFactor: DEFAULT_PRECIP.snow.desertFactor };
    columnReaders.push(columns => {
      for (let x = left; x < right; x++) {
        const column = computePrecipColumn(precipSource, x);
        columns.set([column.roof + offsetY, column.stop + offsetY, column.snow, column.water ? 1 : 0], (nextBoundary + x - left) * 4);
      }
    });
    nextX += width;
  }
  // 两端采用真实实体边界，保持相机与人物都在样本世界内。
  solids.push({ points: [[-1, 0], [0, 0], [0, top], [-1, top]] },
    { points: [[nextX, 0], [nextX + 1, 0], [nextX + 1, top], [nextX, top]] });
  context.progress(t('装配真实场景样本'), model.cards.length, model.cards.length);
  await yieldScene(context.signal);
  await runtime.play({ solids, platforms }, new THREE.Box3(new THREE.Vector3(0, 0, -2), new THREE.Vector3(nextX, top, 2)), sections,
    (time, dt, view) => { for (const sample of samples) sample.update(time, dt, view); },
    columns => { for (const read of columnReaders) read(columns); });
}
