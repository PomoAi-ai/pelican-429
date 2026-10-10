/**
 * 场景接线（从 main.ts 拆出，任务 019 收尾）：实体视图（鹈鹕 rig/光球/投射物/特效）、相机（边界 + 开场取景）、
 * 世界 → 页面坐标投影。只做组装，不含每帧逻辑。
 */
import * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import type { Tuning } from '../config/tuning.ts';
import type { GrassyAnimatedVariant } from '../config/grassy.ts';
import { DEFAULT_AURA } from '../config/aura-rules.ts';
import type { Entity } from '../entities/entity.ts';
import { hutIntroBox, introShot } from '../render/camera-intro.ts';
import { cameraFloorY, createCameraRig } from '../render/camera-rig.ts';
import type { CameraRig } from '../render/camera-rig.ts';
import { createDummyViewFactory, createPelicanViewFactory } from '../render/entity-views.ts';
import { createPlayerViewFactory } from '../render/player-view.ts';
import { createEnemyViewFactory } from '../render/enemy-view.ts';
import { createWandererView } from '../render/npc/wanderer-view.ts';
import { createBossView } from '../render/npc/boss-view.ts';
import { createHealthPackView } from '../render/health-pack-view.ts';
import { createOrbFx } from '../render/orb-fx.ts';
import { createOrbViews } from '../render/orb-view.ts';
import type { PelicanRig } from '../render/pelican/pelican-rig.ts';
import { createProjectileFx } from '../render/projectile-fx.ts';
import { createProjectileViews } from '../render/projectile-views.ts';
import { createGrassyProjectileViews } from '../render/grassy/grassy-projectile-view.ts';
import type { Stage } from '../render/stage.ts';
import type { TreeRideQuery } from '../render/tree-ride.ts';
import { createViewRegistry } from '../render/view-registry.ts';
import type { EntityView } from '../render/view-registry.ts';
import type { ScreenPoint } from '../ui/hud.ts';
import { CAVE_NONE } from '../world/level.ts';
import type { LevelData } from '../world/level.ts';
import { pickHomeHut } from '../world/spawn-home.ts';
import type { WindController } from '../world/wind.ts';
import { skyExposed } from '../world/sky-exposure.ts';
import type { CharacterAppearance } from '../config/character-appearance.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';

/** 实体视图：鹈鹕 rig、光球、视图注册表、光球特效；鹈鹕/假人按地形做斜坡脚底偏移。 */
export function createEntityViews(stage: { scene: THREE.Object3D }, level: LevelData, disposers: Array<() => void>, actors: () => readonly Entity[], treeRide: TreeRideQuery, wind: WindController, rig: PelicanRig, grassyVariant?: GrassyAnimatedVariant | null, grassyGait?: 'run' | 'sprint', appearance: () => CharacterAppearance = createCharacterAppearanceStore(window.localStorage).current, modelView?: () => { yaw: number; pitch: number }) {
  rig.root.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    // 021：鹈鹕自身材质保留最低可见度（全黑洞内也能看到轮廓；光照图挂接时读取）。
    const mats = (node as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : [mats]) m.userData.lightFloor = DEFAULT_AURA.bodyFloor;
  });
  const orbs = createOrbViews({ tuning: TUNING, scene: stage.scene });
  disposers.push(() => orbs.dispose());
  // 任务 018：水弹/鱼/敌弹视图（共享几何材质）。
  const projectiles = createProjectileViews();
  disposers.push(() => projectiles.dispose());
  const grassyProjectiles = createGrassyProjectileViews();
  disposers.push(() => grassyProjectiles.dispose());
  // 预建的 Boss 视图隐藏挂在场景里，参与加载期预热；登场时直接取用，免得当帧克隆模型、绘制字幕。
  const windAt = (x: number, y: number): number => skyExposed(level.map, x, y) ? wind.sway(x) : 0;
  const prebuiltBosses = new Map<Entity['kind'], EntityView>();
  disposers.push(() => { for (const view of prebuiltBosses.values()) view.dispose(); });
  const takeBossView = (entity: Entity): EntityView => {
    const view = prebuiltBosses.get(entity.kind);
    if (view === undefined) return createBossView(entity, windAt);
    prebuiltBosses.delete(entity.kind);
    view.object.visible = true;
    return view;
  };
  const prebuildBoss = (entity: Entity): THREE.Object3D => {
    const view = createBossView(entity, windAt);
    view.object.visible = false;
    stage.scene.add(view.object);
    prebuiltBosses.set(entity.kind, view);
    return view.object;
  };
  const views = createViewRegistry(stage.scene, {
    pelican: grassyVariant === null
      ? createPelicanViewFactory({ rig, tuning: TUNING, terrain: level.map, actors, fishRelay: projectiles.fishRelay, treeRide, windAt })
      : createPlayerViewFactory({ rig, tuning: TUNING, terrain: level.map, actors, fishRelay: projectiles.fishRelay, treeRide, grassyVariant, grassyGait,
        windAt, appearance, modelView }),
    trainingDummy: createDummyViewFactory({ tuning: TUNING, terrain: level.map, treeRide }),
    gatekeeper: createEnemyViewFactory(level.map), lineHound: createEnemyViewFactory(level.map),
    watchWasp: createEnemyViewFactory(level.map), loadmaster: createEnemyViewFactory(level.map),
    sam: entity => entity.npc ? createWandererView(entity) : takeBossView(entity),
    tibo: entity => entity.npc ? createWandererView(entity) : takeBossView(entity),
    healthPack: createHealthPackView,
    orb: orbs.factory,
    ...projectiles.factories,
    codexShot: grassyProjectiles.factory, bugShot: grassyProjectiles.factory,
  });
  disposers.push(() => views.dispose());
  const orbFx = createOrbFx(stage.scene);
  disposers.push(() => orbFx.dispose());
  // 任务 018：水花/拖尾/滴水/蓄力吸入粒子与落地蹦跳的鱼。
  const projectileFx = createProjectileFx({ scene: stage.scene, tuning: TUNING, terrain: level.map, fluid: level.fluid, makeFish: () => projectiles.makeFish(), fishVariant: (id) => projectiles.fishVariant(id) });
  disposers.push(() => projectileFx.dispose());
  return { views, orbs, orbFx, projectileFx, prebuildBoss };
}

export type EntityViewSet = ReturnType<typeof createEntityViews>;

/**
 * 世界坐标 (x,y,0) → 画布所在页面坐标；在相机后方返回 null。
 * 画布矩形只在尺寸变化时重读：HUD 每帧交替投影与写 transform，逐次 getBoundingClientRect 会反复强制重排。
 */
export function createProjector(camera: THREE.Camera, canvas: HTMLCanvasElement, disposers: Array<() => void>): (x: number, y: number) => ScreenPoint | null {
  const projected = new THREE.Vector3();
  let rect = canvas.getBoundingClientRect();
  // 画布固定铺满 #app，位置只随导航高度变化，而那同时改变尺寸。
  const observer = new ResizeObserver(() => { rect = canvas.getBoundingClientRect(); });
  observer.observe(canvas);
  disposers.push(() => observer.disconnect());
  return (x, y) => {
    projected.set(x, y, 0).project(camera);
    if (projected.z > 1) return null;
    return { x: (projected.x * 0.5 + 0.5) * rect.width + rect.left, y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top };
  };
}

/** 最深洞穴格之下 depth 格（无洞穴 = +∞，不影响相机下边界）。 */
function caveFloorY(level: LevelData, depth: number): number {
  const { mask } = level.caves;
  const W = level.map.width;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== CAVE_NONE) return Math.max(0, Math.floor(i / W) - depth);
  return Infinity;
}

/**
 * 跟随相机：对准玩家出生点；出生在渔屋门外（生成世界有渔屋）时先让整座渔屋与鹈鹕同框，
 * 停留后（或玩家一有输入）平滑过渡到跟随。
 */
export function createGameCamera(stage: Stage, level: LevelData, player: Entity, tuning: Tuning = TUNING, minY?: number): CameraRig {
  const canvas = stage.canvas;
  const cameraRig = createCameraRig({
    camera: stage.camera,
    tuning,
    // 相机下边界：最低地表下 floorDepth 格；021 有洞穴时放宽到最深洞穴格下 floorDepth 格（不展示更深的地下）。
    bounds: { width: level.map.width, height: level.map.height, minY: minY ?? Math.min(cameraFloorY(level.surface, tuning.camera.floorDepth), caveFloorY(level, tuning.camera.floorDepth)) },
    viewport: () => canvas.getBoundingClientRect(),
  });
  cameraRig.snapTo(player.body.x, player.body.y, player.facing);
  if (level.spawnFacing !== undefined && level.structures.length > 0) {
    const home = pickHomeHut(level.structures, level.map.width);
    const c = tuning.camera;
    cameraRig.startIntro(introShot(hutIntroBox(home, level.spawn), c.fov, stage.camera.aspect, c.distance, c.intro.margin));
  }
  return cameraRig;
}
