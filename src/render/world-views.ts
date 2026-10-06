/**
 * 世界视图装配（组合根的渲染部分，可脱离浏览器测试）：
 * 地面轮廓（groundSurface + 形状/圆角/有机顶边）→ 流式瓦片（花草按湖/树环境规划）、树（根贴视觉地面）、水面、
 * 水草、渔屋、小鱼、樱花花瓣。全部挂到 scene，dispose 逆序释放。
 * 每帧 update(view, time, dt, alpha)：view 为相机可视矩形（已外扩），time 为单调渲染时间（秒）。
 * 风吹天气：全局风控制器（world/wind）由模拟或展示场推进，视图写共享 uniform（花草/水草/树材质读同一份）→ 花瓣随风飘；
 * 天气特效（风线、飘叶草籽、云层）随视野更新；云影挂接到地表/树/渔屋/水面材质（每 CLOUD_PATCH_FRAMES 帧补挂新材质）。
 */
import type * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import { DEFAULT_WEATHER } from '../config/weather-rules.ts';
import type { WeatherTuning, WindMode } from '../config/weather-rules.ts';
import type { Rect, Vec2 } from '../core/math.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Entity } from '../entities/entity.ts';
import type { FishSchool } from '../entities/fish.ts';
import { caveCovered } from '../world/level.ts';
import type { LevelData } from '../world/level.ts';
import { createCaveDecorView } from './cave-decor-view.ts';
import type { CaveDecorView } from './cave-decor-view.ts';
import { createCaveFx } from './cave-fx.ts';
import type { CaveFx } from './cave-fx.ts';
import { createCaveWallView } from './cave-wall-view.ts';
import type { CaveWallView } from './cave-wall-view.ts';
import { createSkyIslandBackdrop } from './sky-island-backdrop.ts';
import { createSkyIslandView, islandGroundProfile } from './sky-island-view.ts';
import type { SkyIslandView } from './sky-island-view.ts';
import { createFishView } from './fish-view.ts';
import type { FishView } from './fish-view.ts';
import { createFloraEnv } from './flora.ts';
import { createGrassInteraction } from './grass-interaction.ts';
import type { GrassInteraction } from './grass-interaction.ts';
import { createGroundProfile } from './ground-profile.ts';
import type { GroundProfile } from './ground-profile.ts';
import { createPetalFx } from './petal-fx.ts';
import type { PetalFx } from './petal-fx.ts';
import { createStructureView } from './structure-view.ts';
import type { StructureView } from './structure-view.ts';
import { createTileView } from './tile-view.ts';
import type { TileView } from './tile-view.ts';
import { createTreeView } from './tree-view.ts';
import type { TreeView } from './tree-view.ts';
import type { WaterPaletteName } from '../config/water-palettes.ts';
import { createWaterView } from './water-view.ts';
import { createWaterRipples } from './water-ripples.ts';
import { createPlayerBreathFx } from './player-breath-fx.ts';
import type { WaterRipples } from './water-ripples.ts';
import { createWaterFloraView } from './water-flora-view.ts';
import type { WaterFloraView } from './water-flora-view.ts';
import { createWaterWeedView } from './water-weeds.ts';
import type { WaterWeedView } from './water-weeds.ts';
import { createCloudShadowPatcher } from './cloud-shadow.ts';
import { createDecorEnv, createSurfaceDecorView, levelGroundColumns } from './surface-decor-view.ts';
import { rockGrassClearance } from './surface-decor.ts';
import type { SurfaceDecorStats, SurfaceDecorView } from './surface-decor-view.ts';
import { createSandDustFx } from './sand-dust-fx.ts';
import type { SandDustFx } from './sand-dust-fx.ts';
import { createTumbleweedFx } from './tumbleweed-fx.ts';
import type { TumbleweedFx } from './tumbleweed-fx.ts';
import { createWeatherFx } from './weather-fx.ts';
import type { WeatherFx } from './weather-fx.ts';
import { createWindController } from '../world/wind.ts';
import type { WindController } from '../world/wind.ts';
import type { TornadoState } from '../world/tornado.ts';
import { createTornadoFx } from './tornado-fx.ts';
import { sharedWindUniforms, uniformSwayAt, windUniformValues, writeWindUniforms } from './wind.ts';
import { createTreeRideQuery } from './tree-ride.ts';
import type { TreeRideQuery, TreeRideWind } from './tree-ride.ts';
import type { WindUniformName, WindUniformValues } from './wind.ts';

type WaterView = ReturnType<typeof createWaterView>;

export interface WorldViewsInput {
  readonly caveBackground: THREE.Texture | null;
  /** 图片背景自带远岛时关闭程序剪影。 */
  readonly islandBackdrop?: boolean;
  readonly terrainTextureSize?: 256 | 512;
  readonly scene: THREE.Object3D;
  readonly level: LevelData;
  /** 模拟世界的小鱼（SimWorld.fish）。 */
  readonly fish: FishSchool;
  /** 每列“厚实心”地表高度（缺省 levelGroundColumns(level)：groundSurface 且有顶洞穴格 caveCovered = CAVE_CELL | CAVE_ENTRANCE 算实心）。 */
  readonly ground?: Int16Array;
  /** 风吹天气调参（缺省 DEFAULT_WEATHER）与初始模式（缺省 weather.mode；main 由 ?wind= 解析）。 */
  readonly weather?: WeatherTuning;
  readonly windMode?: WindMode;
  /** 模拟拥有的风场；传入时视图只读，展示场未传入时自行推进。 */
  readonly wind?: WindController;
  /** 与降水独立的模拟龙卷风；展示场缺省不显示。 */
  readonly tornadoes?: () => readonly TornadoState[];
  /** 相机到 z=0 平面距离（云层按深度换算可视宽度；缺省 TUNING.camera.distance）。 */
  readonly cameraDistance?: number;
  /** 鹈鹕脚底位置（水面漂浮植物被推开 / 回流；缺省 = 无鹈鹕）。 */
  readonly pelican?: () => Readonly<Vec2> | null;
  /** 模拟实体（草地交互：啄击判定框、光球、落地、骑车；缺省 = 无）。 */
  readonly actors?: () => readonly Entity[];
  /** 水体色板（main 由 ?water= 解析；缺省 DEFAULT_WATER_PALETTE）。 */
  readonly waterPalette?: WaterPaletteName;
}

/** 风吹天气句柄（main 的调试键 V 与 ?debug 暴露）。 */
export interface WeatherHandle {
  readonly wind: WindController;
  readonly fx: WeatherFx;
  readonly enabled: boolean;
  /** 开/关天气特效（风线、飘叶、云层、云影）；风摆始终生效。 */
  setEnabled(on: boolean): void;
}

export interface FloraStats {
  /** 已加载区块内的花草实例总数与按物种计数。 */
  readonly instances: number;
  readonly species: Readonly<Record<string, number>>;
}

export interface WorldViewStats {
  readonly fish: { readonly total: number; readonly swim: number; readonly flee: number; readonly stranded: number };
  readonly structures: number;
  readonly weeds: number;
  /** 地被层（已加载区块）与水生小植物（全图规划）按种类计数。 */
  readonly cover: FloraStats;
  readonly aquatic: ReturnType<WaterFloraView['counts']>;
  readonly petals: number;
  readonly flora: FloraStats;
  readonly weather: { readonly mode: WindMode; readonly level: number; readonly lines: number; readonly debris: number };
  /** 地表岩石与沙漠装饰（020，已加载列带）与活动风滚草数。 */
  readonly decor: SurfaceDecorStats;
  readonly tumbleweeds: number;
  /** 沙漠飞沙（020 细化）：飘沙流粒子数与尘卷风是否出现。 */
  readonly dust: { readonly streams: number; readonly devil: boolean };
  /** 洞穴（021）：背景墙已加载带/格数、装饰（已加载带）按种类计数、特效粒子/涟漪数。 */
  readonly caves: { readonly wallBands: number; readonly wallCells: number; readonly decor: Readonly<Record<string, number>>; readonly points: number; readonly ripples: number };
  /** 浮空岛（021）：静态部件、根须实例、远景剪影数。 */
  readonly islands: { readonly parts: number; readonly roots: number; readonly backdrop: number };
}

export interface WorldViews {
  readonly ground: GroundProfile;
  readonly tiles: TileView;
  readonly trees: TreeView;
  readonly water: WaterView;
  readonly weeds: WaterWeedView;
  readonly waterFlora: WaterFloraView;
  /** 水面涟漪与水花。 */
  readonly ripples: WaterRipples;
  readonly structures: StructureView;
  readonly fish: FishView;
  readonly petals: PetalFx;
  readonly weather: WeatherHandle;
  /** 草地交互（扰动场、割断再生、草屑）。 */
  readonly grass: GrassInteraction;
  /** 地表岩石与沙漠装饰（020）。 */
  readonly decor: SurfaceDecorView;
  /** 风滚草（020，大风时在沙漠里滚动）。 */
  readonly tumbleweeds: TumbleweedFx;
  /** 沙漠飞沙（020 细化：大风沙丘顶飘沙、尘卷风）。 */
  readonly dust: SandDustFx;
  /** 洞穴背景墙/装饰/特效与浮空岛装饰/远景剪影（021）。 */
  readonly caveWall: CaveWallView;
  readonly caveDecor: CaveDecorView;
  readonly caveFx: CaveFx;
  readonly skyIslands: SkyIslandView;
  /** 树平台随动查询（实体视图用；风取本帧写入 GPU 的同一组 uniform —— 实体视图须在 update 之后 sync）。 */
  readonly treeRide: TreeRideQuery;
  /** 本帧模拟事件（光球爆点压草）。 */
  handleEvents(events: readonly SimEvent[]): void;
  update(view: Readonly<Rect>, time: number, dt: number, alpha: number): void;
  stats(): WorldViewStats;
  dispose(): void;
}

const FLORA_MESH_PREFIX = 'tiles-flora-';
const COVER_MESH_PREFIX = 'tiles-cover-';
/** 云影补挂新材质的间隔（帧；首帧即挂）。 */
const CLOUD_PATCH_FRAMES = 30;

/** 已加载瓦片区块里的花草实例统计（网格名 tiles-flora-<物种>-<cx>-<cy>）。 */
export function floraStats(tilesRoot: THREE.Object3D): FloraStats {
  const species: Record<string, number> = {};
  let instances = 0;
  tilesRoot.traverse((node) => {
    if (!node.name.startsWith(FLORA_MESH_PREFIX)) return;
    const count = (node as THREE.InstancedMesh).count ?? 0;
    const name = node.name.slice(FLORA_MESH_PREFIX.length).split('-')[0] as string;
    species[name] = (species[name] ?? 0) + count;
    instances += count;
  });
  return { instances, species };
}

/** 已加载瓦片区块里的地被实例统计（网格名 tiles-cover-<cx>-<cy>，userData.coverCounts 按种类）。 */
export function coverStats(tilesRoot: THREE.Object3D): FloraStats {
  const species: Record<string, number> = {};
  let instances = 0;
  tilesRoot.traverse((node) => {
    if (!node.name.startsWith(COVER_MESH_PREFIX)) return;
    const counts = node.userData.coverCounts as Record<string, number> | undefined;
    if (!counts) throw new Error(`world-views: cover mesh ${node.name} lacks userData.coverCounts`);
    for (const [k, n] of Object.entries(counts)) {
      species[k] = (species[k] ?? 0) + n;
      instances += n;
    }
  });
  return { instances, species };
}

export function createWorldViews(input: WorldViewsInput): WorldViews {
  const { scene, level, fish: school } = input;
  if (!scene || !level || !level.map) throw new Error('world-views: scene and level with map are required');
  if (!school) throw new Error('world-views: fish school is required (SimWorld.fish)');
  // 020：缺省地表列高把有顶洞穴格当实心（levelGroundColumns），洞穴不会让地面轮廓掉到洞底。
  const groundColumns = input.ground ?? levelGroundColumns(level);
  const ground = createGroundProfile(level.map, groundColumns, { lakes: level.lakes });
  const disposers: Array<() => void> = [];
  const add = <T extends { readonly root: THREE.Object3D; dispose(): void }>(v: T): T => {
    scene.add(v.root);
    disposers.push(() => v.dispose());
    return v;
  };
  const covered = caveCovered(level.caves, level.map.width);
  // 020 第三轮：地表装饰环境先建好，花草据它给主石周围的草丛退让（rockGrassClearance）。
  const decorEnv = createDecorEnv(level, ground, groundColumns);
  // 浮空岛正面的攀附由空岛视图画（向上爬的岛体版本），瓦片视图跳过岛体列。
  const onIsland = (tx: number, ty: number): boolean => level.islands.some((s) => tx >= s.x0 && tx <= s.x1 && ty >= (s.bottoms[tx - s.x0] as number) && ty < (s.tops[tx - s.x0] as number));
  const tiles = add(createTileView(level.map, { textureSize: input.terrainTextureSize, floraEnv: createFloraEnv({ lakes: level.lakes, trees: level.trees, deserts: level.deserts, rockClear: rockGrassClearance(decorEnv) }), lakes: level.lakes, bareAir: covered, noClimbers: onIsland }));
  // 021：岛上树的根盘贴岛顶（树视图用岛感知轮廓；其余视图仍用真实地表）。
  const trees = add(createTreeView(level.trees, { ground: islandGroundProfile(level.map, level.islands, groundColumns, ground, level.lakes) }));
  const water = add(createWaterView(level.fluid, input.waterPalette ? { palette: input.waterPalette } : {}));
  const weeds = add(createWaterWeedView(level, { ground }));
  const waterFlora = add(createWaterFloraView(level, { ground, leeward: (input.wind?.rules ?? input.weather ?? DEFAULT_WEATHER).direction }));
  const ripples = add(createWaterRipples({ fluid: level.fluid }));
  const breath = add(createPlayerBreathFx(level.fluid));
  const structures = add(createStructureView(level.structures, { map: level.map }));
  const decor = add(createSurfaceDecorView(level, { ground, columns: groundColumns, env: decorEnv }));
  const tumbleweeds = createTumbleweedFx({ deserts: level.deserts });
  scene.add(tumbleweeds.mesh);
  disposers.push(() => tumbleweeds.dispose());
  const dust = createSandDustFx({ deserts: level.deserts, ground });
  scene.add(dust.mesh);
  disposers.push(() => dust.dispose());
  const caveWall = add(createCaveWallView(level.map, level.caves, input.caveBackground));
  const caveDecor = add(createCaveDecorView(level.map, level.caves, level.fluid.cells));
  const caveFx = add(createCaveFx(level.map, level.caves, level.fluid.cells, level.seed ?? 0));
  const skyIslands = add(createSkyIslandView(level.islands));
  const islandBackdrop = input.islandBackdrop !== false && level.islands.length > 0
    ? createSkyIslandBackdrop({ width: level.map.width, surface: groundColumns, seed: (level.seed ?? 0) ^ 0xb4c, haze: '#cfe3ea' }) : null;
  if (islandBackdrop) {
    scene.add(islandBackdrop.mesh);
    disposers.push(() => islandBackdrop.dispose());
  }
  const fish = add(createFishView(school));
  const petals = createPetalFx({ scene });
  disposers.push(() => petals.dispose());
  const weatherTuning = input.wind?.rules ?? input.weather ?? DEFAULT_WEATHER;
  const wind = input.wind ?? createWindController(weatherTuning, input.windMode ?? weatherTuning.mode);
  const weatherFx = createWeatherFx({ scene, weather: weatherTuning, wind, cameraDistance: input.cameraDistance ?? TUNING.camera.distance });
  disposers.push(() => weatherFx.dispose());
  const tornadoes = Array.from({ length: 6 }, () => add(createTornadoFx()));
  const updateTornadoes = (enabled: boolean): void => {
    const states = enabled ? input.tornadoes?.() ?? [] : [];
    tornadoes.forEach((fx, i) => fx.update(states[i] ?? null));
  };
  const grass = createGrassInteraction({ scene, tilesRoot: tiles.root, ground });
  disposers.push(() => grass.dispose());
  let lastTime = 0;
  const cloudShadow = createCloudShadowPatcher();
  const windUniforms = sharedWindUniforms();
  const windSway = (x: number): number => wind.sway(x);
  // 树上随动的风：一个对象每帧原地更新（sway 读最新的 uniform 值，不每帧新建闭包）；首帧之前为 null。
  let rideValues: WindUniformValues | null = null;
  const rideWindState: { t: number; readonly sway: (x: number, t: number) => number } = { t: 0, sway: (x, t) => (rideValues ? uniformSwayAt(rideValues, x, t) : 0) };
  const rideWind: TreeRideWind = rideWindState;
  const treeRide = createTreeRideQuery((tx, ty) => trees.rideAt(tx, ty), () => (rideValues ? rideWind : null));
  /** 天气特效关闭时写入的 uniform（无云影），复用同一对象。 */
  let noShadow: Record<WindUniformName, number> | null = null;
  let frame = 0;
  const weather: WeatherHandle = {
    wind,
    fx: weatherFx,
    get enabled() {
      return weatherFx.enabled;
    },
    setEnabled(on) {
      weatherFx.setEnabled(on);
      updateTornadoes(on);
    },
  };

  return {
    ground,
    tiles,
    trees,
    water,
    weeds,
    waterFlora,
    ripples,
    structures,
    fish,
    petals,
    weather,
    grass,
    decor,
    tumbleweeds,
    dust,
    caveWall,
    caveDecor,
    caveFx,
    skyIslands,
    treeRide,
    handleEvents(events) {
      grass.handleEvents(events, lastTime);
      ripples.handleEvents(events);
    },
    update(view, time, dt, alpha) {
      lastTime = time;
      if (!input.wind) wind.update(time);
      const values = windUniformValues(wind.rules, wind.time, wind.state, wind.cloudDrift);
      if (weatherFx.enabled) writeWindUniforms(windUniforms, values);
      else {
        noShadow = Object.assign(noShadow ?? { ...values }, values);
        noShadow.uCloudShadow = 0;
        writeWindUniforms(windUniforms, noShadow);
      }
      rideValues = values;
      rideWindState.t = values.uWeatherTime;
      tiles.update(view);
      tiles.setTime(time);
      trees.update(view, time);
      decor.update(view, time);
      water.update(view, time);
      weeds.update(view, time, level.fluid);
      const pelican = input.pelican?.() ?? null;
      waterFlora.update(view, time, dt, { fluid: level.fluid, windAt: windSway, pelican });
      ripples.update(time, dt, { pelican, windAt: windSway });
      const actors = input.actors?.() ?? [];
      breath.update(actors.find((actor) => actor.pelican !== undefined), dt, alpha);
      grass.update(actors, time, dt, windSway);
      fish.update(alpha, time);
      petals.update(dt, trees.blossomEmitters(), ground, windSway);
      weatherFx.update(view, dt, ground);
      updateTornadoes(weatherFx.enabled);
      tumbleweeds.update(dt, { view, windAt: windSway, ground });
      dust.update(dt, { view, windAt: windSway, ground });
      caveWall.update(view);
      caveDecor.update(view, time);
      caveFx.update(view, time, dt);
      skyIslands.update(time);
      if (frame++ % CLOUD_PATCH_FRAMES === 0) for (const r of [tiles.root, trees.root, structures.root, water.root, weeds.root, waterFlora.root, decor.root, tumbleweeds.mesh, skyIslands.root]) cloudShadow.patchTree(r);
    },
    stats() {
      const by = { swim: 0, flee: 0, stranded: 0 };
      for (const f of school.fish) if (f.state !== 'dead') by[f.state]++;
      return {
        fish: { total: by.swim + by.flee + by.stranded, ...by },
        structures: level.structures.length,
        weeds: weeds.instances.length,
        cover: coverStats(tiles.root),
        aquatic: waterFlora.counts(),
        petals: petals.active,
        flora: floraStats(tiles.root),
        weather: { mode: wind.mode, level: wind.state.level, lines: weatherFx.lines, debris: weatherFx.debris },
        decor: decor.stats(),
        tumbleweeds: tumbleweeds.active,
        dust: { streams: dust.streams, devil: dust.devil.active },
        caves: { wallBands: caveWall.loaded, wallCells: caveWall.instances, decor: caveDecor.counts(), points: caveFx.points, ripples: caveFx.ripples },
        islands: { parts: skyIslands.parts, roots: skyIslands.roots, backdrop: islandBackdrop?.count ?? 0 },
      };
    },
    dispose() {
      for (const d of disposers.reverse()) d();
      disposers.length = 0;
    },
  };
}
