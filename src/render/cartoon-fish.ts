/**
 * 卡通鱼模型：吐出的鱼、落地蹦跳的鱼、鹈鹕嘴里露出的鱼共用。
 * - 模型空间：鼻尖朝 +X、身长 1（鼻尖 x≈+0.5，尾尖 x≈−0.5），原点为身体中心；调用方按需整体缩放。
 * - 部件：前半身（头）+ 后半身（mid 枢轴）+ 尾柄/分叉尾鳍（tail 枢轴，挂在 mid 下）——两级枢轴绕 Z 反相摆动 = 身体 S 形扭动；
 *   浅色肚皮、背鳍、腹鳍、两侧胸鳍（扑动）、大眼睛（白眼球 + 黑瞳 + 高光）、上下唇与下颌枢轴（嘴一张一合）、鳞片纹理（DataTexture）。
 * - 配色：FISH_VARIANTS（橙/蓝沿用共享 FISH_COLORS 身体色，另加金色）；同一套几何共享，材质按配色共享。
 * - 全部为 MeshStandard 材质（由 light-texture 自动挂接瓦片光照/云影）；无每帧分配。
 * 纯函数 fishWiggle / fishTumbleRate 给出扭动与翻滚参数，便于测试。
 */
import * as THREE from 'three';
import { FISH_COLORS } from '../config/fish-appearance.ts';

export interface FishVariant {
  readonly name: string;
  readonly body: string;
  readonly belly: string;
  readonly fin: string;
  readonly lip: string;
}

/** 配色：橙、蓝（身体色 = 湖里小鱼的 FISH_COLORS[0/1]）、金。鳍统一偏暖，嘴里露出的尾巴与随后飞出的鱼不会显得突兀。 */
export const FISH_VARIANTS: readonly FishVariant[] = Object.freeze([
  Object.freeze({ name: 'orange', body: FISH_COLORS[0] as string, belly: '#ffe4c4', fin: '#ff5d3a', lip: '#e0532e' }),
  Object.freeze({ name: 'blue', body: FISH_COLORS[1] as string, belly: '#e4f1ff', fin: '#ffb433', lip: '#2c66c9' }),
  Object.freeze({ name: 'gold', body: '#ffc22e', belly: '#fff4cc', fin: '#ff7a2e', lip: '#e0901a' }),
]);

/** 外观与动作参数（集中、冻结；validateCartoonFish 在建 kit 时校验）。 */
export const CARTOON_FISH = Object.freeze({
  /** 模型身长（模型单位，鼻尖到尾尖）。 */
  length: 1,
  /** 前半身椭球半径（x 长、y 高、z 厚）与中心 x。 */
  frontRadii: Object.freeze([0.3, 0.2, 0.135] as const),
  frontX: 0.14,
  /** 后半身椭球半径与相对 mid 枢轴的中心 x；mid 枢轴 x。 */
  rearRadii: Object.freeze([0.25, 0.165, 0.11] as const),
  rearX: -0.13,
  midPivotX: 0,
  /** 尾枢轴（相对 mid）x；尾鳍长、半高。 */
  tailPivotX: -0.3,
  tailLength: 0.24,
  tailHalfHeight: 0.21,
  /** 眼：中心 (x,y)、白眼球半径、瞳孔半径。 */
  eye: Object.freeze({ x: 0.27, y: 0.06, white: 0.085, pupil: 0.045 }),
  /** 下颌最大张角（rad）。 */
  jawOpen: 0.75,
  /** 鳞片纹理：横/纵重复次数。 */
  scaleRepeat: Object.freeze([7, 3] as const),
});

/** 飞行/扭动参数：S 形扭动（mid、tail 振幅 rad，角频率 rad/s，尾相位滞后）、嘴开合、胸鳍、翻滚。 */
export const FISH_MOTION = Object.freeze({
  bendAmp: 0.32,
  tailAmp: 0.62,
  wiggleFreq: 15,
  tailLag: 1.25,
  mouthFreq: 9,
  finFreq: 21,
  finAmp: 0.6,
  /** 翻滚基础角速度（rad/s）、速度加成（每格/秒）、头朝前时的减速比例（0..1，越大越“停留”在头朝前）。 */
  tumbleRate: 7,
  tumblePerSpeed: 0.25,
  alignSlow: 0.78,
});

export function validateCartoonFish(c = CARTOON_FISH, m = FISH_MOTION): void {
  const pos = (k: string, v: number): void => {
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`cartoon-fish: ${k} must be a positive finite number, got ${v}`);
  };
  pos('length', c.length);
  for (const [i, r] of [...c.frontRadii, ...c.rearRadii].entries()) pos(`radii[${i}]`, r);
  pos('tailLength', c.tailLength);
  pos('tailHalfHeight', c.tailHalfHeight);
  pos('eye.white', c.eye.white);
  pos('eye.pupil', c.eye.pupil);
  if (!(c.eye.pupil < c.eye.white)) throw new RangeError('cartoon-fish: pupil must be smaller than the eye white');
  pos('jawOpen', c.jawOpen);
  for (const [k, v] of Object.entries(m)) pos(`motion.${k}`, v);
  if (!(m.alignSlow < 1)) throw new RangeError(`cartoon-fish: motion.alignSlow must be < 1, got ${m.alignSlow}`);
  if (FISH_VARIANTS.length === 0) throw new RangeError('cartoon-fish: FISH_VARIANTS is empty');
}

/** 一帧的扭动姿态：mid/tail 枢轴绕 Z 的角、嘴开合 0..1、胸鳍扑动角。 */
export interface FishPose {
  bend: number;
  tail: number;
  mouth: number;
  fin: number;
}

/** 扭动：k 为强度（0 静止 … 1 飞行 … >1 拍打）；两级枢轴反相 → S 形，尾巴滞后。 */
export function fishWiggle(time: number, k: number, out: FishPose = { bend: 0, tail: 0, mouth: 0, fin: 0 }): FishPose {
  if (!Number.isFinite(time) || !(Number.isFinite(k) && k >= 0)) throw new RangeError(`fishWiggle: invalid time ${time} / k ${k}`);
  const m = FISH_MOTION;
  const w = m.wiggleFreq * time;
  out.bend = m.bendAmp * k * Math.sin(w);
  out.tail = m.tailAmp * k * Math.sin(w - m.tailLag);
  out.mouth = Math.min(1, k) * (0.5 + 0.5 * Math.sin(m.mouthFreq * time));
  out.fin = m.finAmp * Math.min(1, k) * Math.sin(m.finFreq * time);
  return out;
}

/**
 * 翻滚角速度（rad/s，带符号）：鱼不对准速度方向，而是绕视线轴翻跟头；鼻尖接近速度方向时减速（偶尔“头朝前”停留一下）。
 * roll = 鼻尖朝向角（rotation.z），velAngle = 速度方向角；向右飞顺时针（负）、向左飞逆时针。
 */
export function fishTumbleRate(roll: number, velAngle: number, speed: number, vx: number): number {
  if (![roll, velAngle, speed, vx].every(Number.isFinite)) throw new RangeError(`fishTumbleRate: non-finite input ${roll}/${velAngle}/${speed}/${vx}`);
  const m = FISH_MOTION;
  const align = Math.max(0, Math.cos(roll - velAngle));
  const slow = 1 - m.alignSlow * align ** 4;
  return (m.tumbleRate + m.tumblePerSpeed * speed) * slow * (vx < 0 ? 1 : -1);
}

/** 按任意整数（实体 id 等）确定配色下标。 */
export function fishVariantOf(n: number): number {
  if (!Number.isInteger(n)) throw new RangeError(`fishVariantOf: expected an integer, got ${n}`);
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % FISH_VARIANTS.length;
}

/**
 * 配色接力：鹈鹕嘴里露出的鱼（peek）与随后飞出的鱼（take）用同一配色。渲染层共享一个实例
 * （projectile-views 持有，pelican 视图读取）；只在渲染层，与逻辑确定性无关。
 */
export interface FishVariantRelay {
  /** 下一条要飞出的鱼的配色。 */
  peek(): number;
  /** 取走下一条的配色（飞出的鱼视图创建时调用）。 */
  take(): number;
}

export function createFishVariantRelay(seed = 1): FishVariantRelay {
  if (!Number.isInteger(seed)) throw new RangeError(`createFishVariantRelay: seed must be an integer, got ${seed}`);
  let n = seed;
  return {
    peek: () => fishVariantOf(n),
    take: () => fishVariantOf(n++),
  };
}

export interface CartoonFish {
  /** 根（调用方设置位置/旋转/缩放）。 */
  readonly object: THREE.Group;
  /** 前半身（头）组：缩放压扁时作用于 object 即可，此处供测试检查部件。 */
  readonly front: THREE.Group;
  readonly mid: THREE.Group;
  readonly tail: THREE.Group;
  readonly jaw: THREE.Group;
  readonly pectorals: readonly THREE.Group[];
  readonly variant: number;
  setVariant(v: number): void;
  /** 应用扭动姿态。 */
  pose(p: FishPose): void;
}

export interface CartoonFishKit {
  create(variant?: number): CartoonFish;
  dispose(): void;
}

/** 鳞片纹理（白底上的浅色鱼鳞弧线 + 每片顶部一点高光；乘以材质颜色）。 */
function createScaleTexture(): THREE.DataTexture {
  const W = 32;
  const H = 32;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 两行交错的半圆鳞片：到鳞片中心的距离接近半径处画暗弧，内侧上部提亮。
      const row = y < H / 2 ? 0 : 1;
      const cx = (row === 0 ? W / 2 : 0) + 0.5;
      const cy = row === 0 ? H / 2 : H;
      const dx = Math.min(Math.abs(x - cx), W - Math.abs(x - cx));
      const d = Math.hypot(dx, (y - cy) * 1.1) / (W / 2);
      let v = 255;
      if (d > 0.82 && d < 1.0) v = 205;
      else if (d < 0.82 && y > cy - H * 0.42 && y < cy - H * 0.25) v = 255;
      else if (d < 0.82) v = 238;
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CARTOON_FISH.scaleRepeat[0], CARTOON_FISH.scaleRepeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function shapeGeometry(points: ReadonlyArray<readonly [number, number]>): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

interface VariantMaterials {
  readonly body: THREE.MeshStandardMaterial;
  readonly belly: THREE.MeshStandardMaterial;
  readonly fin: THREE.MeshStandardMaterial;
  readonly lip: THREE.MeshStandardMaterial;
}

export function createCartoonFishKit(): CartoonFishKit {
  validateCartoonFish();
  const C = CARTOON_FISH;
  const sphere = new THREE.SphereGeometry(1, 22, 14);
  const smallSphere = new THREE.SphereGeometry(1, 12, 8);
  const half = C.tailHalfHeight;
  const L = C.tailLength;
  // 分叉尾鳍（尾枢轴在原点，向 −x 伸出）。
  const tailGeo = shapeGeometry([[0.02, 0.05], [-L, half], [-L * 0.62, 0.02], [-L * 0.62, -0.02], [-L, -half], [0.02, -0.05]]);
  // 背鳍（前半身顶部，向后掠）、腹鳍、胸鳍（枢轴在根部）。
  const dorsalGeo = shapeGeometry([[0.2, 0.15], [0.1, 0.3], [-0.04, 0.31], [-0.16, 0.14]]);
  const ventralGeo = shapeGeometry([[0.0, -0.1], [-0.12, -0.21], [-0.2, -0.09]]);
  const pectoralGeo = shapeGeometry([[0, 0.02], [-0.16, 0.06], [-0.19, -0.02], [-0.12, -0.07], [0, -0.02]]);
  const scaleTex = createScaleTexture();

  const variants: VariantMaterials[] = FISH_VARIANTS.map((v) => {
    const body = new THREE.MeshStandardMaterial({ color: v.body, map: scaleTex, roughness: 0.38, metalness: 0.05, emissive: v.body, emissiveIntensity: 0.12 });
    body.name = `cartoon-fish-body-${v.name}`;
    const belly = new THREE.MeshStandardMaterial({ color: v.belly, roughness: 0.5, emissive: v.belly, emissiveIntensity: 0.1 });
    belly.name = `cartoon-fish-belly-${v.name}`;
    const fin = new THREE.MeshStandardMaterial({ color: v.fin, roughness: 0.55, side: THREE.DoubleSide, emissive: v.fin, emissiveIntensity: 0.1 });
    fin.name = `cartoon-fish-fin-${v.name}`;
    const lip = new THREE.MeshStandardMaterial({ color: v.lip, roughness: 0.45 });
    lip.name = `cartoon-fish-lip-${v.name}`;
    return { body, belly, fin, lip };
  });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.25 });
  eyeWhite.name = 'cartoon-fish-eye';
  const pupil = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.2 });
  pupil.name = 'cartoon-fish-pupil';
  const glint = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  glint.name = 'cartoon-fish-glint';
  const mouthIn = new THREE.MeshStandardMaterial({ color: '#7a1f2b', roughness: 0.7 });
  mouthIn.name = 'cartoon-fish-mouth';

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, s: readonly [number, number, number], p: readonly [number, number, number]): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.scale.set(s[0], s[1], s[2]);
    m.position.set(p[0], p[1], p[2]);
    return m;
  };

  const create = (variant = 0): CartoonFish => {
    if (!(Number.isInteger(variant) && variant >= 0 && variant < variants.length)) throw new RangeError(`cartoon-fish: variant ${variant} out of range`);
    let mats = variants[variant] as VariantMaterials;
    const object = new THREE.Group();
    object.name = 'cartoon-fish';
    const front = new THREE.Group();
    front.name = 'cartoon-fish-front';
    const mid = new THREE.Group();
    mid.name = 'cartoon-fish-mid';
    mid.position.x = C.midPivotX;
    const tail = new THREE.Group();
    tail.name = 'cartoon-fish-tail';
    tail.position.x = C.tailPivotX;
    const jaw = new THREE.Group();
    jaw.name = 'cartoon-fish-jaw';
    jaw.position.set(C.frontX + C.frontRadii[0] * 0.78, -0.045, 0);
    const [fx, fy, fz] = C.frontRadii;
    const [rx, ry, rz] = C.rearRadii;
    // 身体与肚皮（肚皮略宽、偏下 → 两侧和下方露出浅色）。
    const body = mesh(sphere, mats.body, 'cartoon-fish-body', [fx, fy, fz], [C.frontX, 0, 0]);
    const belly = mesh(sphere, mats.belly, 'cartoon-fish-belly', [fx * 0.86, fy * 0.62, fz * 1.06], [C.frontX - 0.01, -fy * 0.36, 0]);
    const dorsal = mesh(dorsalGeo, mats.fin, 'cartoon-fish-dorsal', [1, 1, 1], [0, 0, 0]);
    const upperLip = mesh(sphere, mats.lip, 'cartoon-fish-lip', [0.075, 0.042, 0.075], [C.frontX + fx * 0.93, -0.01, 0]);
    const mouth = mesh(smallSphere, mouthIn, 'cartoon-fish-mouth-in', [0.06, 0.05, 0.07], [C.frontX + fx * 0.9, -0.05, 0]);
    const lowerLip = mesh(sphere, mats.lip, 'cartoon-fish-lower-lip', [0.07, 0.036, 0.068], [0.05, -0.012, 0]);
    jaw.add(lowerLip);
    front.add(body, belly, dorsal, upperLip, mouth, jaw);
    // 两侧大眼睛：白眼球（略扁）+ 偏前的黑瞳 + 高光点。
    const E = C.eye;
    for (const side of [1, -1]) {
      const z = fz * 0.72 * side;
      front.add(
        mesh(smallSphere, eyeWhite, 'cartoon-fish-eye', [E.white, E.white, E.white * 0.6], [E.x, E.y, z]),
        mesh(smallSphere, pupil, 'cartoon-fish-pupil', [E.pupil, E.pupil * 1.15, E.pupil * 0.6], [E.x + E.white * 0.28, E.y - 0.004, z + side * E.white * 0.42]),
        mesh(smallSphere, glint, 'cartoon-fish-glint', [E.pupil * 0.36, E.pupil * 0.36, E.pupil * 0.3], [E.x + E.white * 0.4, E.y + E.pupil * 0.55, z + side * E.white * 0.6]),
      );
    }
    // 胸鳍（鳃后两侧，枢轴在根部，扑动）。
    const pectorals = [1, -1].map((side) => {
      const pivot = new THREE.Group();
      pivot.name = 'cartoon-fish-pectoral';
      pivot.position.set(0.1, -0.06, fz * 0.92 * side);
      pivot.add(mesh(pectoralGeo, mats.fin, 'cartoon-fish-pectoral-fin', [1, 1, 1], [0, 0, 0]));
      front.add(pivot);
      return pivot;
    });
    // 后半身 + 腹鳍；尾柄 + 尾鳍。
    const rear = mesh(sphere, mats.body, 'cartoon-fish-rear', [rx, ry, rz], [C.rearX, 0, 0]);
    const rearBelly = mesh(sphere, mats.belly, 'cartoon-fish-rear-belly', [rx * 0.82, ry * 0.58, rz * 1.06], [C.rearX + 0.02, -ry * 0.38, 0]);
    const ventral = mesh(ventralGeo, mats.fin, 'cartoon-fish-ventral', [1, 1, 1], [0, 0, 0]);
    mid.add(rear, rearBelly, ventral, tail);
    const peduncle = mesh(sphere, mats.body, 'cartoon-fish-peduncle', [0.1, 0.065, 0.05], [0.03, 0, 0]);
    const fin = mesh(tailGeo, mats.fin, 'cartoon-fish-tail-fin', [1, 1, 1], [0, 0, 0]);
    tail.add(peduncle, fin);
    object.add(front, mid);

    const byRole = (): void => {
      body.material = rear.material = peduncle.material = mats.body;
      belly.material = rearBelly.material = mats.belly;
      dorsal.material = ventral.material = fin.material = mats.fin;
      for (const p of pectorals) (p.children[0] as THREE.Mesh).material = mats.fin;
      upperLip.material = lowerLip.material = mats.lip;
    };
    const fish: CartoonFish = {
      object,
      front,
      mid,
      tail,
      jaw,
      pectorals,
      variant,
      setVariant(v) {
        if (!(Number.isInteger(v) && v >= 0 && v < variants.length)) throw new RangeError(`cartoon-fish: variant ${v} out of range`);
        if (v === fish.variant) return;
        mats = variants[v] as VariantMaterials;
        (fish as { variant: number }).variant = v;
        byRole();
      },
      pose(p) {
        mid.rotation.z = p.bend;
        tail.rotation.z = p.tail - p.bend * 0.4;
        front.rotation.z = -p.bend * 0.35;
        jaw.rotation.z = -C.jawOpen * Math.max(0, Math.min(1, p.mouth));
        pectorals[0]!.rotation.y = 0.5 + p.fin;
        pectorals[1]!.rotation.y = -0.5 - p.fin;
      },
    };
    return fish;
  };

  return {
    create,
    dispose() {
      for (const g of [sphere, smallSphere, tailGeo, dorsalGeo, ventralGeo, pectoralGeo]) g.dispose();
      for (const v of variants) for (const m of Object.values(v)) (m as THREE.Material).dispose();
      for (const m of [eyeWhite, pupil, glint, mouthIn]) m.dispose();
      scaleTex.dispose();
    },
  };
}
