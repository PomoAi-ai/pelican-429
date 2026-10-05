/**
 * 小鱼视图：每种鱼独立实例批次，共享尾摆材质（卡通低多边形，平直着色）。
 * - 每帧按品种紧凑排列实例；平滑状态按 id 保存，捕获或移除鱼不会改变其他鱼的外观和动作。
 * - 位置：lerp(prev, cur, alpha) 的身体中心；z 为按 seed 固定的"车道"，整条鱼（含尾摆）落在水前面 WATER_FRONT_Z 与方块背面 BLOCK_BACK_Z 之间。
 * - 朝向：yaw 在 0（朝 +x）与 −π（朝 −x）之间指数平滑，转身时鼻尖经过镜头一侧；按竖直速度轻微俯仰。
 * - 尾摆：顶点着色器按顶点 aBody（0 鼻尖…1 尾尖）与实例 aSwim=(相位, 幅度) 做行波摆动；相位在 CPU 按状态频率累加（flee 更快），避免频率突变时跳相。
 * - stranded：侧翻（绕身体长轴滚转）+ 上下蹦跳与扭动。
 * - 品种由 seed 确定；原小鱼保留橙/蓝/银配色，新鱼使用模型自带的体色与花纹。
 * 数量超过容量即抛（不静默截断）。
 */
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.ts';
import { hash01 } from '../core/rng.ts';
import { FISH_COLORS, FISH_SPECIES, fishColorIndex, fishSpeciesIndex } from '../config/fish-appearance.ts';
import { FISH_MODELS } from './fish-model.ts';
import type { Fish, FishSchool } from '../entities/fish.ts';
import { injectAfter } from './tile-material.ts';
import { BLOCK_BACK_Z } from './tile-geometry.ts';
import { WATER_FRONT_Z } from './water-view.ts';

/** 尾摆在 z / y 方向的幅度（格，乘 aBody² 与实例幅度）。 */
const TAIL_WAG_Z = 0.08;
const TAIL_WAG_Y = 0.025;
/** 实例幅度：swim / flee / stranded。 */
const AMP_SWIM = 1;
const AMP_FLEE = 1.3;
const AMP_STRANDED = 1.5;
const AMP_MAX = Math.max(AMP_SWIM, AMP_FLEE, AMP_STRANDED);
/** 尾摆角频率（rad/s）：swim = 基础 + 速度项；flee / stranded 固定更快。 */
const TAIL_FREQ_SWIM = 9;
const TAIL_FREQ_PER_SPEED = 3;
const TAIL_FREQ_FLEE = 26;
const TAIL_FREQ_STRANDED = 34;
/** 平滑系数（1/s）。 */
const TURN_LAMBDA = 10;
const PITCH_LAMBDA = 8;
const ROLL_LAMBDA = 6;
const PITCH_MAX = 0.45;
/** 搁浅侧翻角、扭动幅度与蹦跳高度。 */
const ROLL_STRANDED = 1.2;
const FLOP_WOBBLE = 0.35;
const FLOP_HOP = 0.05;
/** 单帧 dt 上限（切后台回来不瞬移相位）。 */
const MAX_DT = 0.1;
/** 车道两端额外留白（格）。 */
const Z_MARGIN = 0.05;
const DEFAULT_CAPACITY = 64;
const LANE_SALT = 0x6a09e667;
/** yaw：朝 +x 为 0，朝 −x 为 −π（Ry(−π/2) 把鼻尖转向 +z，即镜头一侧）。 */
const YAW_LEFT = -Math.PI;
const PHASE_WRAP = Math.PI * 8;

/** 模型绕原点的最大半径（含最大尾摆位移），旋转不变，用于 z 车道留白。 */
export const FISH_MODEL_RADIUS = (() => {
  let r = 0;
  for (const model of FISH_MODELS) {
    for (let i = 0; i < model.body.length; i++) {
      const k = model.body[i]! ** 2 * AMP_MAX;
      const x = model.position[i * 3]!;
      const y = Math.abs(model.position[i * 3 + 1]!) + k * TAIL_WAG_Y;
      const z = Math.abs(model.position[i * 3 + 2]!) + k * TAIL_WAG_Z;
      r = Math.max(r, Math.sqrt(x * x + y * y + z * z));
    }
  }
  return r;
})();
/** 鱼身中心 z 的可用区间：整条鱼在水体内（水前面之后、方块背面之前）。 */
export const FISH_Z_MIN = BLOCK_BACK_Z + FISH_MODEL_RADIUS + Z_MARGIN;
export const FISH_Z_MAX = WATER_FRONT_Z - FISH_MODEL_RADIUS - Z_MARGIN;
if (!(FISH_Z_MIN < FISH_Z_MAX)) throw new Error(`fish-view: water slab too thin for fish (z ${FISH_Z_MIN}..${FISH_Z_MAX})`);

/** 按 seed 固定的 z 车道。 */
export function fishLaneZ(seed: number): number {
  return lerp(FISH_Z_MIN, FISH_Z_MAX, hash01(seed, 0, LANE_SALT));
}

/** 按 seed 的初始尾摆相位（让鱼群不同步）。 */
export function fishTailPhase0(seed: number): number {
  return ((seed % 1000) / 1000) * Math.PI * 2;
}

export interface FishViewOptions {
  /** 实例上限（默认 64）；鱼数超过即抛。 */
  readonly capacity?: number;
}

export interface FishView {
  readonly root: THREE.Group;
  /** alpha：tick 插值系数 [0,1]；time：渲染时间（秒，单调）。 */
  update(alpha: number, time: number): void;
  dispose(): void;
}

interface FishVisual {
  yaw: number;
  pitch: number;
  roll: number;
  phase: number;
  frame: number;
}

function createFishMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.1, flatShading: true });
  material.name = 'fish';
  material.onBeforeCompile = (shader) => {
    let vs = injectAfter(shader.vertexShader, 'common', 'attribute float aBody;\nattribute vec2 aSwim;', 'fish-view');
    vs = injectAfter(
      vs,
      'begin_vertex',
      [
        'float fishK = aBody * aBody * aSwim.y;',
        'float fishA = aSwim.x - 4.0 * aBody;',
        `transformed.z += fishK * ${TAIL_WAG_Z.toFixed(4)} * sin( fishA );`,
        `transformed.y += fishK * ${TAIL_WAG_Y.toFixed(4)} * cos( fishA );`,
      ].join('\n'),
      'fish-view',
    );
    shader.vertexShader = vs;
  };
  material.customProgramCacheKey = () => 'fish-tail-v1';
  return material;
}

function tailFrequency(f: Fish): number {
  switch (f.state) {
    case 'flee':
      return TAIL_FREQ_FLEE;
    case 'stranded':
      return TAIL_FREQ_STRANDED;
    case 'dead':
      return 0;
    default:
      return TAIL_FREQ_SWIM + TAIL_FREQ_PER_SPEED * Math.sqrt(f.body.vx * f.body.vx + f.body.vy * f.body.vy);
  }
}

function tailAmplitude(f: Fish): number {
  return f.state === 'flee' ? AMP_FLEE : f.state === 'swim' ? AMP_SWIM : AMP_STRANDED;
}

export function createFishView(school: FishSchool, options: FishViewOptions = {}): FishView {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  if (!(Number.isInteger(capacity) && capacity >= 1)) throw new Error(`fish-view: capacity must be a positive integer, got ${capacity}`);

  const material = createFishMaterial();
  const white = new THREE.Color(1, 1, 1);
  const batches = FISH_MODELS.map((model, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(model.position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(model.color, 3));
    geometry.setAttribute('aBody', new THREE.BufferAttribute(model.body, 1));
    geometry.computeVertexNormals();
    const swim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    swim.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aSwim', swim);

    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `fish-instances-${FISH_SPECIES[index]!.id}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 所有批次在首次编译前都分配颜色，才能安全共用同一材质程序。
    for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return { mesh, swim };
  });

  const root = new THREE.Group();
  root.name = 'fish';
  root.add(...batches.map(({ mesh }) => mesh));

  const palette = FISH_COLORS.map((c) => new THREE.Color(c));
  const visuals = new Map<number, FishVisual>();
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const one = new THREE.Vector3(1, 1, 1);
  let lastTime: number | null = null;
  let frame = 0;

  function update(alpha: number, time: number): void {
    const fish = school.fish;
    if (fish.length > capacity) throw new Error(`fish-view: ${fish.length} fish exceed capacity ${capacity}`);
    const a = clamp(alpha, 0, 1);
    const dt = lastTime === null ? 0 : clamp(time - lastTime, 0, MAX_DT);
    lastTime = time;
    frame++;
    for (const { mesh } of batches) mesh.count = 0;

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i] as Fish;
      const b = f.body;
      const yawTarget = f.facing === 1 ? 0 : YAW_LEFT;
      let v = visuals.get(f.id);
      if (!v) {
        v = { yaw: yawTarget, pitch: 0, roll: 0, phase: fishTailPhase0(f.seed), frame };
        visuals.set(f.id, v);
      }
      v.frame = frame;
      // 以 8π 取模（覆盖尾摆 2π、扭动 4π、蹦跳 8π 的周期），避免长时间运行后精度下降。
      v.phase = (v.phase + tailFrequency(f) * dt) % PHASE_WRAP;
      const grounded = f.state === 'stranded' || f.state === 'dead';
      const dx = b.x - b.prevX;
      const dy = b.y - b.prevY;
      const pitchTarget = grounded ? FLOP_WOBBLE * Math.sin(v.phase * 0.5) : clamp(Math.atan2(dy, Math.abs(dx) + 0.01) * 0.8, -PITCH_MAX, PITCH_MAX);
      v.yaw = damp(v.yaw, yawTarget, TURN_LAMBDA, dt);
      v.pitch = grounded ? pitchTarget : damp(v.pitch, pitchTarget, PITCH_LAMBDA, dt);
      v.roll = damp(v.roll, grounded ? ROLL_STRANDED : 0, ROLL_LAMBDA, dt);

      const hop = grounded && f.state !== 'dead' ? FLOP_HOP * Math.abs(Math.sin(v.phase * 0.25)) : 0;
      pos.set(lerp(b.prevX, b.x, a), lerp(b.prevY, b.y, a) + b.height / 2 + hop, fishLaneZ(f.seed));
      euler.set(v.roll, v.yaw, v.pitch);
      quat.setFromEuler(euler);
      matrix.compose(pos, quat, one);
      const species = fishSpeciesIndex(f.seed);
      const { mesh, swim } = batches[species]!;
      const slot = mesh.count++;
      mesh.setMatrixAt(slot, matrix);
      mesh.setColorAt(slot, FISH_SPECIES[species]!.id === 'minnow' ? palette[fishColorIndex(f.seed)]! : white);
      swim.setXY(slot, v.phase, tailAmplitude(f));
    }
    for (const [id, v] of visuals) if (v.frame !== frame) visuals.delete(id);

    for (const { mesh, swim } of batches) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      swim.needsUpdate = true;
    }
  }

  return {
    root,
    update,
    dispose() {
      root.removeFromParent();
      for (const { mesh } of batches) {
        mesh.dispose();
        mesh.geometry.dispose();
      }
      material.dispose();
      visuals.clear();
    },
  };
}
