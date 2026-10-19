/**
 * 渲染基准（?mode=game&free=1&bench=<场景>）：固定区域，按帧号驱动输入与镜头路径（帧循环此时按固定步长推进模拟），
 * 同一种子重复运行走同一条路径。预热 WARMUP 帧 → 采样 SAMPLES 帧 → 等 GPU 查询全部读回 → 输出 JSON
 * （console.info + window.__pelicanBench + 下载 pelican-bench-<场景>.json）。
 */
import * as THREE from 'three';
import type { FreeWorldSize } from '../../config/free-world.ts';
import type { GameSettings } from '../../config/game-settings.ts';
import type { GameTime } from '../../core/calendar.ts';
import { frameTimeStats } from '../../core/frame-profiler.ts';
import type { FrameProfiler } from '../../core/frame-profiler.ts';
import type { Vec2 } from '../../core/math.ts';
import { hash01 } from '../../core/rng.ts';
import type { ActionTracker } from '../../input/action-map.ts';
import type { GpuTimer } from '../../render/stage/gpu-timer.ts';
import type { ParticlePool } from '../../render/fx/particle-pool.ts';
import type { ProjectileFx } from '../../render/fx/projectile-fx.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import { placePlayer } from '../../sim/player-teleport.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import type { LevelData } from '../../world/level.ts';
import { pourAtWorld } from './debug-tools.ts';

export const BENCH_SCENES = ['forest', 'cave', 'water', 'flight', 'particles'] as const;
export type BenchScene = (typeof BENCH_SCENES)[number];

/** 森林、洞穴密集区、湖面、原野入口（飞行与粒子从这里出发）；区域 id 见 world/free-world-regions。 */
const REGIONS: Readonly<Record<BenchScene, string>> = { forest: 'forest', cave: 'cave-0', water: 'lake-0', flight: 'wilds', particles: 'wilds' };

const WARMUP = 120;
export const BENCH_SAMPLES = 600;
/** 洞穴里往返走动的半程帧数。 */
const CAVE_TURN_FRAMES = 120;
/** 飞行速度（格/帧）与离地高度（格）。 */
const FLIGHT_SPEED = 0.5;
const FLIGHT_ALTITUDE = 12;
/** 往返折返点离地图右边的距离（格）。 */
const EDGE_MARGIN = 16;
/** 森林里贴地奔跑的速度（格/帧，约等于跑速）。 */
const RUN_SPEED = 0.15;

/** 网址边界：bench 只在原野运行，区域由场景决定，不接受其他定位参数。 */
export function parseBench(params: URLSearchParams): BenchScene | null {
  const raw = params.get('bench');
  if (raw === null) return null;
  if (!(BENCH_SCENES as readonly string[]).includes(raw)) throw new Error(`未知基准场景：${raw}（支持 ${BENCH_SCENES.join('、')}）`);
  if (params.get('mode') !== 'game' || params.get('free') !== '1' || params.has('level')) throw new Error('基准只能在原野运行：?mode=game&free=1&bench=…');
  for (const key of ['region', 'scene', 'inspect']) if (params.has(key)) throw new Error(`基准场景自带区域，不能同时指定 ${key}`);
  return raw as BenchScene;
}

export const benchRegion = (scene: BenchScene): string => REGIONS[scene];

export interface BenchDeps {
  readonly scene: BenchScene;
  readonly seed: number;
  readonly size: FreeWorldSize;
  readonly region: string;
  /** 区域起点（freeWorldRegions 的 position）。 */
  readonly origin: Vec2;
  readonly world: SimWorld;
  readonly level: LevelData;
  readonly ground: Int16Array;
  readonly tracker: ActionTracker;
  readonly stage: Stage<StageRenderer>;
  readonly projectileFx: ProjectileFx;
  readonly gpu: GpuTimer;
  readonly prof: FrameProfiler;
  readonly settings: () => GameSettings;
  readonly time: Readonly<GameTime>;
}

export interface Bench {
  /** 预热与采样阶段为 true：帧循环此时无论性能面板是否展开都计时。 */
  readonly timing: boolean;
  /** 每帧模拟前调用：按帧号驱动输入、倒水、飞行位置或粒子。 */
  drive(): void;
  /** 每帧收尾（渲染与计时结束后）调用：推进阶段、记录帧间隔、排空 GPU 查询并输出结果。 */
  afterFrame(now: number): void;
}

/** 补满粒子池；位置与速度按帧号和序号哈希，重复运行一致。 */
function fillPool(pool: ParticlePool, frame: number, at: Vec2, salt: number, color: string, gravity: number): void {
  for (let i = 0, n = pool.capacity - pool.active; i < n; i++) {
    const h = (k: number): number => hash01(frame * pool.capacity + i, k, salt);
    pool.emit({
      x: at.x + (h(0) * 2 - 1) * 12, y: at.y + h(1) * 8, z: 0.2, vx: (h(2) * 2 - 1) * 3, vy: h(3) * 4, vz: 0,
      life: 0.6 + h(4) * 0.6, size0: 0.06, size1: 0.01, gravity, drag: 1, color,
    });
  }
}

export function createBench(d: BenchDeps): Bench {
  const { scene, world, level, tracker, origin, gpu } = d;
  // game-app 已在网址边界拒绝 bench + renderer=webgpu；这里收窄类型，基准要读 WebGL 程序数与 GPU 名。
  const renderer = d.stage.renderer;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error('基准只支持 WebGL 渲染器');
  let frame = 0;
  let last = 0;
  /** 采样开始时的着色器程序数：采样中新编译的程序会造成卡顿。 */
  let programsAtStart = 0;
  let done = false;
  const intervals: number[] = [];

  /** 从区域起点向右走 distance 格、到地图边往返，离地 altitude 格。 */
  const travel = (distance: number, altitude: number): void => {
    const span = level.map.width - EDGE_MARGIN - origin.x;
    const travelled = distance % (2 * span);
    const x = origin.x + (travelled < span ? travelled : 2 * span - travelled);
    if (placePlayer(world, { x, y: d.ground[Math.floor(x)]! + altitude }) === null) throw new Error(`基准 ${scene}：x=${x.toFixed(1)} 处无法安置玩家，种子 ${d.seed}`);
  };

  const drive = (f: number): void => {
    // 森林与飞行直接按帧号安置玩家：沿途敌人的击退与硬直不会让路径分岔。
    if (scene === 'forest') travel(f * RUN_SPEED, 0);
    else if (scene === 'cave') {
      // 每帧重按：窗口失焦等会 releaseAll。
      const right = Math.floor(f / CAVE_TURN_FRAMES) % 2 === 0;
      tracker.release(right ? 'moveLeft' : 'moveRight', 'bench');
      tracker.press(right ? 'moveRight' : 'moveLeft', 'keyboard', 'bench');
    } else if (scene === 'water') pourAtWorld(world, level, { x: origin.x + Math.sin(f * 0.03) * 10, y: origin.y + 6 });
    else if (scene === 'flight') travel(f * FLIGHT_SPEED, FLIGHT_ALTITUDE);
    else {
      const b = getPlayer(world).body;
      fillPool(d.projectileFx.sparks, f, b, 1, '#ffc45c', -1);
      fillPool(d.projectileFx.drops, f, b, 2, '#a9defa', 20);
    }
  };

  const finish = (): void => {
    done = true;
    tracker.releaseAll();
    const snap = d.prof.snapshot();
    let nodes = 0;
    let pointLights = 0;
    let visiblePointLights = 0;
    d.stage.scene.traverse(o => {
      nodes++;
      if ((o as THREE.PointLight).isPointLight) pointLights++;
    });
    d.stage.scene.traverseVisible(o => {
      if ((o as THREE.PointLight).isPointLight) visiblePointLights++;
    });
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    const gl = renderer.getContext();
    // Chrome 的 gl.RENDERER 恒为 “WebKit WebGL”，跨机器对比要真实 GPU 名。
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const result = {
      version: import.meta.env.VITE_APP_VERSION,
      scene, seed: d.seed, size: d.size, region: d.region,
      frames: { warmup: WARMUP, samples: BENCH_SAMPLES },
      frameMs: frameTimeStats(intervals),
      cpuMs: { total: snap.cpu, ...snap.segments },
      gpuMs: gpu.averages(),
      calls: snap.calls,
      triangles: snap.triangles,
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs!.length,
      programsCompiledDuringSampling: renderer.info.programs!.length - programsAtStart,
      sceneNodes: nodes,
      pointLights: { total: pointLights, visible: visiblePointLights },
      quality: d.stage.quality,
      antialias: d.stage.antialias,
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: { width: buffer.x, height: buffer.y },
      glRenderer: gl.getParameter(rendererInfo === null ? gl.RENDERER : rendererInfo.UNMASKED_RENDERER_WEBGL) as string,
      worldTime: { ...d.time },
      settings: d.settings(),
    };
    console.info(`[bench] ${scene}`, result);
    Object.assign(window, { __pelicanBench: result });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    link.download = `pelican-bench-${scene}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return {
    get timing() {
      return frame < WARMUP + BENCH_SAMPLES;
    },
    drive() {
      if (!done) drive(frame);
    },
    afterFrame(now) {
      if (done) return;
      const f = frame++;
      if (f === WARMUP - 1) {
        // 丢掉预热帧的在途查询，GPU 均值只含采样帧。
        gpu.reset();
        programsAtStart = renderer.info.programs!.length;
        last = now;
      } else if (f >= WARMUP && f < WARMUP + BENCH_SAMPLES) {
        intervals.push(now - last);
        last = now;
      } else if (f >= WARMUP + BENCH_SAMPLES) {
        gpu.poll();
        if (gpu.pending === 0) finish();
      }
    },
  };
}
