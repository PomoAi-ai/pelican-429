import * as THREE from 'three';
import { FORTRESS_BLACKHOLE } from '../config/facility-structure.ts';
import type { Stage } from '../render/stage.ts';

/** 黑洞事件视界的世界半径，用来把屏幕上的吸附范围对齐到黑盘大小。 */
const HORIZON = 4.2;
/** 以下距离都以视界屏幕半径为单位：指针进入 WAKE 后黑洞「苏醒」，进入 CAPTURE 后光标被吸住。 */
const WAKE = 4.5;
const CAPTURE = 2.2;
/** 文字最大位移（CSS 像素）：平时只有微弱引力，黑洞苏醒后明显被拉向它。 */
const IDLE_PULL = 6;
const WAKE_PULL = 26;
/** 欠阻尼弹簧：被拉过去时略冲过头，引力减弱后带着回弹归位。 */
const SPRING = 60;
const DAMPING = 6;

interface Pulled {
  readonly element: HTMLElement;
  /** 越靠近黑洞的元素受力越大；「429」再额外被拉长。 */
  readonly weight: number;
  readonly stretch: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * 首页黑洞的「引力」：标题文字和联系卡片被轻轻拉向黑洞，指针靠近时引力增强；
 * 指针进入吸附圈后隐藏系统光标，换成一个绕着黑洞旋入的光点。按钮和链接不受影响。
 */
export function createHoleGravity(hero: HTMLElement, stage: Stage): (dt: number, time: number) => void {
  const copy = hero.querySelector<HTMLElement>('.home-hero-copy')!;
  const pull = (element: HTMLElement, weight: number, stretch = false): Pulled => ({ element, weight, stretch, x: 0, y: 0, vx: 0, vy: 0 });
  const pulled = [
    pull(copy.querySelector<HTMLElement>('.home-pill')!, 0.5),
    pull(copy.querySelector<HTMLElement>('h1')!, 0.8),
    pull(copy.querySelector<HTMLElement>('h1 span')!, 0.7, true),
    pull(copy.querySelector<HTMLElement>('.home-hero-tagline')!, 0.6),
    pull(copy.querySelector<HTMLElement>('.home-hero-description')!, 0.4),
    // 右侧联系卡片也被吸向左边的黑洞，幅度小一些，按钮仍然好点。
    pull(hero.querySelector<HTMLElement>('.home-hero-contact')!, 0.5),
  ];
  const cursor = document.createElement('div');
  cursor.className = 'home-hole-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  hero.append(cursor);
  const mouse = { x: 0, y: 0, active: false };
  hero.addEventListener('pointermove', (event) => {
    // 触屏没有悬停光标；停在按钮或链接上时保留系统光标，保证可点。
    mouse.active = event.pointerType === 'mouse' && !(event.target as Element).closest('a, button');
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  hero.addEventListener('pointerleave', () => { mouse.active = false; });
  const center = new THREE.Vector3();
  const rim = new THREE.Vector3();
  let wake = 0;

  return (dt, time) => {
    const rect = stage.canvas.getBoundingClientRect();
    const { x, y, z } = FORTRESS_BLACKHOLE.position;
    center.set(x, y, z).project(stage.camera);
    rim.set(x + HORIZON, y, z).project(stage.camera);
    const holeX = rect.left + (center.x + 1) / 2 * rect.width;
    const holeY = rect.top + (1 - center.y) / 2 * rect.height;
    const horizon = (rim.x - center.x) / 2 * rect.width;
    const toHoleX = holeX - mouse.x;
    const toHoleY = holeY - mouse.y;
    const distance = Math.hypot(toHoleX, toHoleY) / horizon;
    const ease = 1 - Math.exp(-dt * 4);
    wake += ((mouse.active && distance < WAKE ? 1 : 0) - wake) * ease;

    // 文字：沿指向黑洞的方向位移，距离越近、黑洞越醒，被拉得越多；微弱的呼吸让平时也有一点引力感。
    for (const item of pulled) {
      const box = item.element.getBoundingClientRect();
      const dx = holeX - (box.left + box.width / 2 - item.x);
      const dy = holeY - (box.top + box.height / 2 - item.y);
      const length = Math.hypot(dx, dy);
      const strength = item.weight * (IDLE_PULL * (1 + 0.3 * Math.sin(time * 1.3)) + WAKE_PULL * wake);
      item.vx += ((dx / length * strength - item.x) * SPRING - item.vx * DAMPING) * dt;
      item.vy += ((dy / length * strength - item.y) * SPRING - item.vy * DAMPING) * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      const stretch = item.stretch ? `scaleX(${1 + 0.08 * wake})` : '';
      item.element.style.transform = `translate(${item.x.toFixed(2)}px, ${item.y.toFixed(2)}px) ${stretch}`;
    }

    // 光标：吸附圈内越靠近越被拉向中心，同时绕黑洞旋转；到视界附近缩小淡出，像被吞掉。
    const capture = mouse.active ? Math.max(0, 1 - distance / CAPTURE) : 0;
    hero.classList.toggle('home-hero-captured', capture > 0);
    if (capture === 0) return;
    const pull = 0.9 * capture ** 1.4;
    const swirl = 1.6 * capture ** 2;
    const offsetX = -toHoleX * (1 - pull);
    const offsetY = -toHoleY * (1 - pull);
    const cos = Math.cos(swirl);
    const sin = Math.sin(swirl);
    const frame = hero.getBoundingClientRect();
    const left = holeX + offsetX * cos - offsetY * sin - frame.left;
    const top = holeY + offsetX * sin + offsetY * cos - frame.top;
    cursor.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${(1 - 0.75 * capture).toFixed(3)})`;
    cursor.style.opacity = (1 - capture ** 3).toFixed(3);
  };
}
