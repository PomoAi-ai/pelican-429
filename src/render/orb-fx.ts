/**
 * 光球爆闪特效：固定 16 个加性 sprite 的对象池。
 * 光球（kind 'orb'）的 projectileFired → 嘴边小爆闪（蓄力档越高越大）；projectileImpact → 命中/撞墙的较大爆闪（被吞不闪）；池满时复用最旧的一个。
 * 每个 sprite 独立材质（各自淡出），共享一张程序生成的光晕贴图。
 */
import * as THREE from 'three';
import type { SimEvent } from '../core/game-events.ts';
import { createGlowTexture } from './orb-view.ts';

export const ORB_FX_POOL_SIZE = 16;
/** 爆闪 z：在地形方块前表面（z=0.5）之前，撞墙时不被方块遮住。 */
const FLASH_Z = 0.8;

interface FlashStyle {
  readonly color: string;
  readonly duration: number;
  readonly startScale: number;
  readonly endScale: number;
}

const FIRED: FlashStyle = { color: '#ffd27a', duration: 0.16, startScale: 1.0, endScale: 2.4 };
const IMPACT: FlashStyle = { color: '#ffa13a', duration: 0.32, startScale: 2.2, endScale: 5.5 };

interface Flash {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  style: FlashStyle;
  age: number;
  /** 取用序号，池满时复用序号最小（最早取用）的一个。 */
  seq: number;
  active: boolean;
}

export interface OrbFx {
  handleEvents(events: readonly SimEvent[]): void;
  /** dt：本帧时长（秒）。 */
  update(dt: number): void;
  /** 当前活跃爆闪数量（调试/测试用）。 */
  readonly activeCount: number;
  dispose(): void;
}

export function createOrbFx(scene: THREE.Object3D): OrbFx {
  const texture = createGlowTexture();
  const root = new THREE.Group();
  root.name = 'orb-fx';
  scene.add(root);
  const pool: Flash[] = [];
  for (let i = 0; i < ORB_FX_POOL_SIZE; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `orb-flash-${i}`;
    sprite.visible = false;
    root.add(sprite);
    pool.push({ sprite, material, style: IMPACT, age: 0, seq: 0, active: false });
  }

  const apply = (f: Flash): void => {
    const t = Math.min(1, f.age / f.style.duration);
    f.sprite.scale.setScalar(f.style.startScale + (f.style.endScale - f.style.startScale) * t);
    f.material.opacity = (1 - t) * (1 - t);
  };

  let seq = 0;
  const spawn = (x: number, y: number, style: FlashStyle, level: number): void => {
    let slot: Flash | undefined = pool.find((f) => !f.active);
    if (!slot) {
      // 池满：复用最早取用的一个。
      slot = pool[0] as Flash;
      for (const f of pool) if (f.seq < slot.seq) slot = f;
    }
    slot.active = true;
    slot.age = 0;
    slot.seq = ++seq;
    // 蓄力档（1..3）放大爆闪：每档 +45%。
    const k = 1 + 0.45 * (Math.min(3, Math.max(1, level)) - 1);
    slot.style = k === 1 ? style : { ...style, startScale: style.startScale * k, endScale: style.endScale * k, duration: style.duration * (1 + 0.25 * (k - 1)) };
    slot.material.color.set(style.color);
    slot.sprite.position.set(x, y, FLASH_Z);
    slot.sprite.visible = true;
    apply(slot);
  };

  return {
    handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'projectileFired' && ev.kind === 'orb') spawn(ev.x, ev.y, FIRED, ev.level);
        else if (ev.type === 'projectileImpact' && ev.kind === 'orb' && ev.reason !== 'swallowed') spawn(ev.x, ev.y, IMPACT, ev.level);
      }
    },
    update(dt) {
      if (!(dt >= 0)) throw new Error(`orb fx: invalid dt ${dt}`);
      for (const f of pool) {
        if (!f.active) continue;
        f.age += dt;
        if (f.age >= f.style.duration) {
          f.active = false;
          f.sprite.visible = false;
          continue;
        }
        apply(f);
      }
    },
    get activeCount() {
      let n = 0;
      for (const f of pool) if (f.active) n++;
      return n;
    },
    dispose() {
      root.removeFromParent();
      root.clear();
      for (const f of pool) f.material.dispose();
      pool.length = 0;
      texture.dispose();
    },
  };
}
