import type { IntroLanguage } from '../config/intro-language.ts';
import {
  INTRO_BAN_AT, INTRO_DIZZY_AT, INTRO_DOWNGRADE_AT, INTRO_DREAM_CRESCENDO_AT, INTRO_DREAM_FREEZE_AT,
  INTRO_DREAM_MELODY, INTRO_DURATION, INTRO_GOAL_AT,
  INTRO_HEARTBEAT_ECHO, INTRO_HEARTBEAT_PERIOD, INTRO_KEY_LOOP, INTRO_KEY_TIMES,
  INTRO_PELICAN_AT, INTRO_ROUTE_AT, INTRO_STORY_BEAT, INTRO_TRANSFORM_BEATS,
  INTRO_WHEEL_APPROACH, INTRO_WHEEL_TRIES, introSceneAt, type IntroSceneId,
} from '../config/intro.ts';
import { MONO, SANS, TAU, ease, glow, noise } from './intro-canvas.ts';

export type IntroImages = Readonly<Record<Exclude<IntroSceneId, 'prelude' | 'world'>, HTMLImageElement> & {
  transformation: HTMLImageElement;
}>;

const IMAGE_W = 1672;
const IMAGE_H = 941;
const NIGHT_AT = introSceneAt('night');
const GLITCH_AT = introSceneAt('glitch');
const DREAM_AT = introSceneAt('dream');
const WORLD_AT = introSceneAt('world');

/** 镜头以图像坐标为准：x/y 是落在舞台中心的图像点，sx/sy 是屏幕像素级的震动。 */
interface Shot { x: number; y: number; zoom: number; angle: number; sx: number; sy: number }
const CENTER: Shot = { x: IMAGE_W / 2, y: IMAGE_H / 2, zoom: 1, angle: 0, sx: 0, sy: 0 };

function shoot(ctx: CanvasRenderingContext2D, w: number, h: number, shot: Shot): void {
  // contain 适配保证任何屏幕比例下 zoom=1 都能看到整幅概念图。
  const scale = Math.min(w / IMAGE_W, h / IMAGE_H) * shot.zoom;
  ctx.translate(w / 2 + shot.sx, h / 2 + shot.sy);
  ctx.rotate(shot.angle);
  ctx.scale(scale, scale);
  ctx.translate(-shot.x, -shot.y);
  // 飞出画面的文字与车轮不能出现在上下留黑的区域里。
  ctx.beginPath();
  ctx.rect(0, 0, IMAGE_W, IMAGE_H);
  ctx.clip();
}

const hit = (s: number, at: number, decay: number): number => s >= at ? Math.exp(-(s - at) * decay) : 0;
// 按 40Hz 阶梯取噪声，震动带顿挫感而不是平滑漂移。
const shake = (s: number, amount: number, seed: number): number =>
  (noise(Math.floor(s * 40) * 7 + seed) - 0.5) * 2 * amount;
const wrap = (value: number, span: number): number => (value % span + span) % span;
function overshoot(x: number): number {
  const u = Math.min(1, x) - 1;
  return 1 + 3.2 * u * u * u + 2.2 * u * u;
}
function bezier(a: readonly [number, number], c: readonly [number, number], b: readonly [number, number],
  k: number): [number, number] {
  const m = 1 - k;
  return [m * m * a[0] + 2 * m * k * c[0] + k * k * b[0], m * m * a[1] + 2 * m * k * c[1] + k * k * b[1]];
}

function weather(ctx: CanvasRenderingContext2D, s: number, rect: readonly [number, number, number, number],
  drops: number, flakes: number): void {
  const [x0, y0, rw, rh] = rect;
  const spanX = rw + 70;
  const spanY = rh + 70;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.clip();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#b8d9fa50';
  for (let i = 0; i < drops; i++) {
    const x = x0 + wrap(noise(i + 21) * spanX - s * 62, spanX);
    const y = y0 - 15 + wrap(noise(i + 121) * spanY + s * 352, spanY);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 12);
    ctx.stroke();
  }
  ctx.fillStyle = '#dbe9ff80';
  for (let i = 0; i < flakes; i++) {
    const x = x0 - 8 + wrap(noise(i + 720) * spanX - s * 19 + Math.sin(s * 1.6 + i) * 7, spanX);
    const y = y0 - 15 + wrap(noise(i + 800) * spanY + s * (27 + noise(i) * 26), spanY);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + noise(i + 23) * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, tighten: number): void {
  const size = Math.max(w, h);
  const inner = size * (0.42 - 0.26 * tighten);
  const gradient = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, inner + size * 0.4);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function flash(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, alpha: number): void {
  if (alpha < 0.01) return;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

// ── 第一幕：雨雪夜 ──────────────────────────────────────────────

/** 左侧窗玻璃没有前景人物，雨雪只在这里叠加，避免落进室内。 */
export const WINDOW_RECT = [296, 75, 512, 404] as const;

function keyStrike(s: number): number {
  const local = wrap(s - NIGHT_AT, INTRO_KEY_LOOP);
  return Math.exp(-(local - INTRO_KEY_TIMES.findLast((at) => at <= local)!) * 18);
}

function night(ctx: CanvasRenderingContext2D, s: number, image: HTMLImageElement, w: number, h: number): void {
  // 失控前最后一秒，屏幕偶发闪烁，越接近硬切越频繁。
  const unrest = ease(24.6, GLITCH_AT, s);
  const step = Math.floor(s * 15);
  const flicker = s >= 24.6 && noise(step + 40) < 0.2 + unrest * 0.45 ? 0.1 + noise(step + 47) * 0.22 : 0;
  ctx.save();
  ctx.globalAlpha = ease(NIGHT_AT, NIGHT_AT + 1.2, s);
  // 在 contain 边界内完成推镜，宽屏与窄屏均保留完整人物和桌面。
  shoot(ctx, w, h, { ...CENTER, zoom: 0.975 + 0.025 * ease(NIGHT_AT, GLITCH_AT, s) });
  ctx.drawImage(image, 0, 0, IMAGE_W, IMAGE_H);
  weather(ctx, s, WINDOW_RECT, 60, 24);
  ctx.globalCompositeOperation = 'screen';
  const shimmer = 0.028 + Math.sin(s * 2.24) * 0.008 + keyStrike(s) * 0.035 + flicker;
  glow(ctx, 1230, 433, 205, `rgba(46, 192, 218, ${shimmer})`);
  glow(ctx, 1521, 445, 150, 'rgba(255, 185, 80, 0.028)');
  if (flicker > 0) {
    ctx.fillStyle = `rgba(170, 240, 255, ${flicker})`;
    ctx.fillRect(1090, 300 + noise(step + 53) * 200, 470, 2 + noise(step + 59) * 5);
  }
  ctx.restore();
}

// ── 第二幕：失控 ────────────────────────────────────────────────

const GLITCH_GLYPHS = '01#%/\\_{}!?';

function wordFont(text: string, size: number): string {
  return /[一-鿿]/.test(text) ? `600 ${size}px ${SANS}` : `${size}px ${MONO}`;
}

function rewrittenModel(from: string, to: string, age: number): string {
  if (age >= .4) return to;
  const reveal = Math.floor(Math.max(0, age / .4) * to.length);
  const tick = Math.floor(age * 32);
  return Array.from({ length: Math.max(from.length, to.length) }, (_, index) => {
    if (index < reveal) return to[index]!;
    if (age < .06) return index < from.length ? from[index]! : '';
    return GLITCH_GLYPHS[Math.floor(noise(tick * 17 + index * 31) * GLITCH_GLYPHS.length)];
  }).join('');
}

/** 大模型、两次改写和空拍同用故事时钟，拖动时不依赖上一次的字符。 */
function glitchWords(ctx: CanvasRenderingContext2D, s: number, w: number, h: number, language: IntroLanguage): void {
  const silenceAt = INTRO_BAN_AT - INTRO_STORY_BEAT;
  if (s >= silenceAt && s < INTRO_BAN_AT) return;
  const routed = s >= INTRO_ROUTE_AT;
  const degraded = s >= INTRO_DOWNGRADE_AT;
  const banned = s >= INTRO_BAN_AT;
  const changeAt = degraded ? INTRO_DOWNGRADE_AT : INTRO_ROUTE_AT;
  const age = s - changeAt;
  const jolt = routed ? Math.max(0, 1 - age / .42) : 0;
  const color = banned ? '#74848b' : degraded ? '#c2d0d4' : routed ? '#b4d9ed' : '#ffda83';
  const model = !routed ? 'gpt-6-astra' : rewrittenModel(degraded ? 'gpt-5.6-luna' : 'gpt-6-astra', degraded ? 'gpt-4o-mini' : 'gpt-5.6-luna', age);
  const centerX = w * .5; const centerY = h * (banned ? .67 : .46);
  const fontSize = Math.min(!routed ? 86 : degraded ? 61 : 73, w / 8.7);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = banned ? .42 : ease(GLITCH_AT, GLITCH_AT + .2, s);
  glow(ctx, centerX, centerY, Math.min(w * .46, h * .65), 'rgba(0, 4, 15, .83)');
  if (!routed) {
    glow(ctx, centerX, centerY, Math.min(w * .37, h * .52), 'rgba(255, 184, 40, .14)');
    ctx.strokeStyle = '#e9ba5655'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(centerX, centerY, Math.min(w * .36, 345), Math.min(h * .15, 85), -.08, 0, TAU); ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const angle = noise(i + 909) * TAU; const distance = 90 + noise(i + 808) * Math.min(w * .23, 270);
      const pulse = .4 + Math.sin(s * 1.7 + i) ** 2 * .6;
      ctx.globalAlpha = pulse * .7; ctx.fillStyle = '#ffe6a8';
      ctx.fillRect(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance * .37, 1.8, 1.8);
    }
    ctx.globalAlpha = ease(GLITCH_AT, GLITCH_AT + .2, s);
  }
  ctx.font = `${fontSize}px ${MONO}`;
  ctx.shadowColor = color; ctx.shadowBlur = banned ? 0 : routed ? 14 : 34;
  if (jolt > 0) {
    ctx.fillStyle = '#ff607b'; ctx.fillText(model, centerX - jolt * 14, centerY - jolt * 4);
    ctx.fillStyle = '#55dcff'; ctx.fillText(model, centerX + jolt * 14, centerY + jolt * 4);
  }
  ctx.fillStyle = color; ctx.fillText(model, centerX + shake(s, jolt * 9, 31), centerY + shake(s, jolt * 3, 38));
  ctx.shadowBlur = 0;
  if (banned) {
    ctx.strokeStyle = '#ff696daa'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(centerX - Math.min(w * .3, 200), centerY); ctx.lineTo(centerX + Math.min(w * .3, 200), centerY); ctx.stroke();
  } else {
    const action = !routed ? (language === 'en' ? 'SELECTED MODEL' : '已选模型') : degraded ? (language === 'en' ? 'DOWNGRADED' : '降智') : (language === 'en' ? 'REROUTED' : '改路由');
    ctx.font = wordFont(action, !routed ? Math.min(14, w / 30) : Math.min(46, w / 10));
    ctx.fillStyle = !routed ? '#efd18d' : '#f1a394'; ctx.fillText(action, centerX, h * .29);
    ctx.font = `${Math.min(12, w / 31)}px ${MONO}`; ctx.fillStyle = !routed ? '#e9ce94' : '#aab9be';
    ctx.fillText(!routed ? (language === 'en' ? 'THE PROMISE' : '最初的承诺') : degraded ? 'gpt-6-astra  →  gpt-5.6-luna' : 'gpt-6-astra', centerX, h * .61);
    if (routed) {
      ctx.fillStyle = '#b4c4ca';
      ctx.fillText(language === 'en' ? (degraded ? 'CAPABILITY REDUCED' : 'REWRITING THE ROUTE') : (degraded ? '能力已削减' : '正在改写路由'), centerX, h * .7);
    }
  }
  ctx.restore();
}

function banWord(ctx: CanvasRenderingContext2D, s: number, w: number, h: number, language: IntroLanguage): void {
  const word = language === 'en' ? 'BANNED' : '封号';
  const age = s - INTRO_BAN_AT;
  if (age < 0) return;
  const land = 0.08;
  // 落章：从大号急速压下，落定后带一次衰减回弹。
  const scale = age < land
    ? 2.4 - 1.4 * (age / land) ** 2
    : 1 + 0.08 * Math.exp(-(age - land) * 12) * Math.cos((age - land) * 38);
  const x = w * .5; const y = h * .43; const size = Math.min(166, w * (language === 'en' ? .13 : .24));
  ctx.save();
  glow(ctx, x, y, Math.min(w * .49, h * .6), 'rgba(0, 0, 0, 0.8)');
  glow(ctx, x, y, Math.min(w * .43, h * .45), `rgba(255, 30, 40, ${0.16 + 0.3 * Math.exp(-age * 4)})`);
  const ring = Math.exp(-age * 5);
  if (ring > 0.02) {
    ctx.strokeStyle = `rgba(255, 70, 70, ${ring * 0.7})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.1 + age * w * .65, size * .6 + age * h * .5, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, age / 0.04);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = wordFont(word, size);
  ctx.shadowColor = '#ff1d2c';
  ctx.shadowBlur = 46;
  ctx.fillStyle = '#ff3b3b';
  ctx.fillText(word, 0, 0);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffd0c8';
  ctx.strokeText(word, 0, 0);
  ctx.font = `${Math.min(19, w / 23)}px ${MONO}`; ctx.fillStyle = '#f09a9a';
  ctx.fillText(language === 'en' ? 'ACCOUNT BANNED' : '账号已封禁', 0, size * .74);
  ctx.restore();
}

function keycaps(ctx: CanvasRenderingContext2D, s: number): void {
  for (let i = 0; i < 14; i++) {
    const age = s - (GLITCH_AT + noise(i + 300) * 2.6);
    if (age < 0 || age > 1.6) continue;
    const angle = -Math.PI * (0.05 + noise(i + 330) * 0.9);
    const speed = 300 + noise(i + 360) * 420;
    const size = 14 + noise(i + 390) * 10;
    ctx.save();
    ctx.globalAlpha = 1 - ease(1.1, 1.6, age);
    ctx.translate(1050 + Math.cos(angle) * speed * age, 430 + Math.sin(angle) * speed * age + 420 * age * age);
    ctx.rotate(age * (noise(i + 420) - 0.5) * 14);
    ctx.fillStyle = '#1b2027';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = '#3d4753';
    ctx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 6);
    ctx.restore();
  }
}

function rgbSplit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, k: number, s: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22 * k;
  ctx.drawImage(image, 16 * k, 0, IMAGE_W, IMAGE_H);
  ctx.drawImage(image, -16 * k, 4 * k, IMAGE_W, IMAGE_H);
  ctx.restore();
  ctx.save();
  const step = Math.floor(s * 20);
  for (let i = 0; i < 6; i++) {
    const y = noise(i * 3 + step) * IMAGE_H;
    const band = 10 + noise(i * 5 + step + 1) * 40;
    const dx = (noise(i + step + 9) - 0.5) * 90 * k;
    ctx.drawImage(image, 0, y, IMAGE_W, band, dx, y, IMAGE_W, band);
    ctx.fillStyle = i % 2 ? `rgba(255, 40, 80, ${0.2 * k})` : `rgba(40, 220, 255, ${0.2 * k})`;
    ctx.fillRect(dx, y, IMAGE_W, band);
  }
  ctx.restore();
}

function heartbeat(s: number): number {
  if (s < INTRO_DIZZY_AT) return 0;
  const local = wrap(s - INTRO_DIZZY_AT, INTRO_HEARTBEAT_PERIOD);
  return Math.exp(-local * 14) + 0.7 * hit(local, INTRO_HEARTBEAT_ECHO, 14);
}

function glitch(ctx: CanvasRenderingContext2D, s: number, image: HTMLImageElement, w: number, h: number, language: IntroLanguage): void {
  const entry = hit(s, GLITCH_AT, 12);
  const ban = hit(s, INTRO_BAN_AT, 7);
  const route = hit(s, INTRO_ROUTE_AT, 11);
  const downgrade = hit(s, INTRO_DOWNGRADE_AT, 11);
  const silenceAt = INTRO_BAN_AT - INTRO_STORY_BEAT;
  const silent = s >= silenceAt && s < INTRO_BAN_AT;
  const dizzy = ease(INTRO_DIZZY_AT, DREAM_AT, s);
  const heart = heartbeat(s) * dizzy;
  const swirl = ease(31.3, DREAM_AT, s);
  const drift = s - INTRO_DIZZY_AT;
  const quake = route * 12 + downgrade * 18 + ban * 24;
  const shot: Shot = {
    x: IMAGE_W / 2 + Math.sin(drift * 1.3) * 30 * dizzy,
    y: IMAGE_H / 2 + Math.sin(drift * 0.9) * 12 * dizzy,
    zoom: 1.02 + route * 0.03 + downgrade * 0.04 + ban * 0.05 + dizzy * 0.05 + heart * 0.018 + swirl * swirl * 1.6,
    angle: Math.sin(drift * 1.1) * 0.045 * dizzy + swirl ** 3 * 4,
    sx: shake(s, quake, 1),
    sy: shake(s, quake, 2),
  };
  ctx.save();
  shoot(ctx, w, h, shot);
  ctx.drawImage(image, 0, 0, IMAGE_W, IMAGE_H);
  const split = Math.max(route, downgrade, ban * 0.8);
  if (split > 0.04) rgbSplit(ctx, image, split, s);
  if (dizzy > 0) {
    // 眩晕重影：偏移的半透明重绘；旋涡阶段再叠加绕中心旋转的拷贝。
    ctx.save();
    ctx.globalAlpha = 0.22 * dizzy;
    for (let i = 1; i <= 2; i++) {
      ctx.drawImage(image, Math.sin(s * 2.1 + i * 2) * 24 * i * dizzy, Math.cos(s * 1.7 + i) * 10 * i * dizzy,
        IMAGE_W, IMAGE_H);
    }
    ctx.globalAlpha = 0.28 * swirl;
    for (let i = 1; i <= 3 && swirl > 0; i++) {
      ctx.save();
      ctx.translate(IMAGE_W / 2, IMAGE_H / 2);
      ctx.rotate(swirl * i * 0.4);
      ctx.scale(1 + swirl * i * 0.15, 1 + swirl * i * 0.15);
      ctx.drawImage(image, -IMAGE_W / 2, -IMAGE_H / 2, IMAGE_W, IMAGE_H);
      ctx.restore();
    }
    ctx.restore();
  }
  if (!silent) keycaps(ctx, s);
  ctx.restore();
  vignette(ctx, w, h, 0.3 + 0.6 * dizzy, dizzy * (0.6 + heart * 0.25) + swirl * 0.3);
  flash(ctx, w, h, '#5a0008', heart * 0.16);
  // 字幕保持舞台坐标：即使窄屏或房间旋转，也能读清降级的因果顺序。
  flash(ctx, w, h, '#03070d', silent ? .94 : s < INTRO_BAN_AT ? .56 : .35);
  glitchWords(ctx, s, w, h, language);
  banWord(ctx, s, w, h, language);
  flash(ctx, w, h, '#ff1e28', ban * 0.4);
  flash(ctx, w, h, '#ffd27c', entry * 0.1);
}

// ── 第三幕：梦境 ────────────────────────────────────────────────

function feather(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#fff3d8';
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(-size * .1, -size * .7, size, 0);
  ctx.quadraticCurveTo(size * .1, size * .5, -size, 0);
  ctx.fill();
  ctx.strokeStyle = '#88e5ee';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size * .8, 0);
  ctx.stroke();
  ctx.restore();
}

/** 羽化中间态先完整展示；羽幕遮住全身时切换鸟形，避免两种面孔局部拼接。 */
function transformation(ctx: CanvasRenderingContext2D, s: number, images: IntroImages, w: number, h: number): void {
  const settle = ease(DREAM_AT, INTRO_PELICAN_AT, s);
  const pulse = Math.max(...INTRO_TRANSFORM_BEATS.map(at => hit(s, at, 9)));
  const switchAt = INTRO_TRANSFORM_BEATS[2];
  const reveal = ease(switchAt, INTRO_PELICAN_AT - .25, s);
  const release = 1 - ease(INTRO_PELICAN_AT - .35, INTRO_PELICAN_AT, s);
  const veil = ease(switchAt - .3, switchAt, s) * (1 - ease(switchAt, switchAt + .4, s));
  const cx = 835;
  const cy = 475;
  ctx.save();
  shoot(ctx, w, h, {
    ...CENTER, zoom: 1.04 + (1 - settle) * .06 + pulse * .008,
    angle: -.04 * (1 - settle) ** 2, y: IMAGE_H / 2 - 20 * Math.sin(settle * Math.PI),
  });
  // Cut only at the opaque feather burst; never reveal a bird beak across a human face.
  ctx.drawImage(s < switchAt ? images.transformation : images.dream, 0, 0, IMAGE_W, IMAGE_H);
  if (veil > 0) {
    const light = ctx.createRadialGradient(cx, cy, 150, cx, cy, 850);
    light.addColorStop(0, '#efffff'); light.addColorStop(.45, '#d9fbff'); light.addColorStop(1, '#9beaff00');
    ctx.globalAlpha = veil;
    ctx.fillStyle = light; ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);
    for (let i = 0; i < 72; i++) {
      const angle = i * 2.4 + settle * 4;
      const radius = 55 + Math.sqrt(i / 72) * (400 + reveal * 500);
      feather(ctx, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * .85,
        34 + noise(i + 1040) * 48, angle + .8);
    }
    ctx.globalAlpha = 1;
  }
  INTRO_TRANSFORM_BEATS.forEach((at, beat) => {
    const age = s - at;
    if (age < 0 || age >= .85) return;
    for (let i = 0; i < 14; i++) {
      const seed = beat * 14 + i;
      const angle = noise(seed + 1000) * TAU + age * .55;
      const distance = 45 + age * (230 + noise(seed + 1010) * 430);
      ctx.globalAlpha = Math.sin(age / .85 * Math.PI) * .8 * release;
      feather(ctx, 850 + Math.cos(angle) * distance, 475 + Math.sin(angle) * distance * .75,
        9 + noise(seed + 1020) * 13, angle + age * 2);
    }
  });
  ctx.globalAlpha = 1;
  glow(ctx, 850, 475, 200, `rgba(157, 236, 249, ${pulse * .12 * release})`);
  ctx.restore();
  vignette(ctx, w, h, .42, 0);
}

/** 车架上的后轮与前轮轮位（图像坐标）。 */
const SLOTS = [[760, 570], [932, 570]] as const;
const WHEEL_R = 48;
const BIKE_CENTER = [846, 520] as const;
const FAILS = ['fling', 'teleport', 'rewind'] as const;
/** 失败方式逐次轮换；后几次前后轮各走各的，错乱感更强。 */
const failMode = (index: number, wheel: number): (typeof FAILS)[number] =>
  FAILS[(index + (index >= 3 ? wheel : 0)) % FAILS.length]!;

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = '#121214';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = r * 0.03;
  ctx.strokeStyle = '#3c3f45';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = '#cdd5dc';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.77, 0, TAU);
  ctx.stroke();
  // 交叉辐条：从轮毂两侧切向连到轮圈，比放射状更像真实车轮。
  ctx.lineWidth = Math.max(1, r * 0.014);
  ctx.strokeStyle = '#aab3bb';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU;
    const lean = k % 2 ? 0.45 : -0.45;
    ctx.moveTo(Math.cos(a) * r * 0.09, Math.sin(a) * r * 0.09);
    ctx.lineTo(Math.cos(a + lean) * r * 0.75, Math.sin(a + lean) * r * 0.75);
  }
  ctx.stroke();
  ctx.fillStyle = '#9aa3ab';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a2d31';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.045, 0, TAU);
  ctx.fill();
  ctx.restore();
}

interface WheelPose { x: number; y: number; r: number; spin: number; alpha: number }

function wheelPose(index: number, wheel: number, c: number): WheelPose | null {
  const at = INTRO_WHEEL_TRIES[index]!;
  const start = at - INTRO_WHEEL_APPROACH;
  if (c < start) return null;
  const slot = SLOTS[wheel]!;
  const seed = index * 7 + wheel * 3;
  const heading = noise(seed + 50) * TAU;
  const from = [slot[0] + Math.cos(heading) * 1300, slot[1] + Math.sin(heading) * 1300] as const;
  const bend = (noise(seed + 51) - 0.5) * 900;
  const control = [(from[0] + slot[0]) / 2 - Math.sin(heading) * bend,
    (from[1] + slot[1]) / 2 + Math.cos(heading) * bend] as const;
  // 停在离轮位一小段的位置：差一点就装上。最后一次两只轮子都正好落进轮位，之后跟着车一起转到定格。
  const final = index === INTRO_WHEEL_TRIES.length - 1;
  const near = final ? slot : [slot[0] + Math.cos(heading) * 16, slot[1] + Math.sin(heading) * 16] as const;
  if (c < at) {
    const k = (c - start) / INTRO_WHEEL_APPROACH;
    const [x, y] = bezier(from, control, near, k * k);
    return { x, y, r: WHEEL_R, spin: k * 9, alpha: 1 };
  }
  if (final) {
    const age = c - at;
    return { x: slot[0], y: slot[1] - Math.sin(age * 40) * 5 * Math.exp(-age * 12), r: WHEEL_R, spin: 9 + age * 14, alpha: 1 };
  }
  const failAt = at + INTRO_STORY_BEAT;
  if (c < failAt) {
    // 前两帧完全定住，然后像被磁力吸着一样微抖。
    const age = c - at;
    const jitter = age < 0.035 ? 0 : Math.sin(age * 90) * 3 * Math.exp(-age * 3);
    return { x: near[0] + jitter, y: near[1] - jitter * 0.6, r: WHEEL_R, spin: 9 + jitter * 0.01, alpha: 1 };
  }
  const age = c - failAt;
  const mode = failMode(index, wheel);
  if (mode === 'fling') {
    if (age > 0.7) return null;
    const dx = near[0] - BIKE_CENTER[0];
    const dy = near[1] - BIKE_CENTER[1] - 200;
    const length = Math.hypot(dx, dy);
    return {
      x: near[0] + dx / length * 2000 * age,
      y: near[1] + dy / length * 2000 * age + 1200 * age * age,
      r: WHEEL_R, spin: 9 + age * 30, alpha: 1,
    };
  }
  if (mode === 'teleport') {
    if (age > 0.6) return null;
    const x = 200 + noise(seed + 52) * 1270;
    const y = 120 + noise(seed + 53) * 320;
    return { x: x + age * 120, y: y - age * 60, r: WHEEL_R * (0.5 + 0.3 * overshoot(age / 0.15)), spin: 9 - age * 8, alpha: 1 - age / 0.6 };
  }
  if (age > 0.45) return null;
  const k = 1 - age / 0.45;
  const [x, y] = bezier(from, control, near, k * k);
  return { x, y, r: WHEEL_R, spin: k * 9, alpha: 1 };
}

function tries(ctx: CanvasRenderingContext2D, c: number): void {
  INTRO_WHEEL_TRIES.forEach((at, index) => {
    // 越往后残影越长，体现时空错乱在加剧。
    const trails = 1 + Math.floor(index / 2);
    const final = index === INTRO_WHEEL_TRIES.length - 1;
    const moving = c < at || (!final && c >= at + INTRO_STORY_BEAT);
    for (let wheel = 0; wheel < 2; wheel++) {
      for (let n = trails; n >= 1 && moving; n--) {
        const ghost = wheelPose(index, wheel, c - n * 0.035);
        if (ghost) drawWheel(ctx, ghost.x, ghost.y, ghost.r, ghost.spin, ghost.alpha * 0.22 * (1 - n / (trails + 1)));
      }
      const pose = wheelPose(index, wheel, c);
      if (pose) drawWheel(ctx, pose.x, pose.y, pose.r, pose.spin, pose.alpha);
      // 归位：两道金环从轮位炸开，和最响的那一声叮同拍。
      const seated = c - at;
      if (final && seated >= 0 && seated < 0.45) {
        const slot = SLOTS[wheel]!;
        ctx.strokeStyle = `rgba(255, 220, 140, ${1 - seated / 0.45})`;
        ctx.lineWidth = 7 * (1 - seated / 0.45) + 1;
        ctx.beginPath();
        ctx.arc(slot[0], slot[1], WHEEL_R * (1 + seated * 4), 0, TAU);
        ctx.stroke();
      }
      const teleport = c - (at + INTRO_STORY_BEAT);
      if (!final && failMode(index, wheel) === 'teleport' && teleport >= 0 && teleport < 0.3) {
        const slot = SLOTS[wheel]!;
        ctx.strokeStyle = `rgba(150, 230, 255, ${1 - teleport / 0.3})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(slot[0], slot[1], WHEEL_R * (1 + teleport * 3), 0, TAU);
        ctx.stroke();
      }
    }
  });
}

/** 后段从画外不断穿过的散轮，数量随时间增加。 */
function strays(ctx: CanvasRenderingContext2D, c: number): void {
  const count = Math.floor(ease(INTRO_PELICAN_AT + 1, INTRO_DREAM_FREEZE_AT, c) * 7);
  for (let i = 0; i < count; i++) {
    const period = 1.4 + noise(i + 600) * 1.2;
    const phase = wrap((c - INTRO_PELICAN_AT) / period + noise(i + 610), 1);
    const leftward = i % 2 === 1;
    const x = leftward ? 1850 - phase * 2100 : -180 + phase * 2100;
    const y = 80 + noise(i + 620) * 700 + Math.sin(phase * Math.PI) * -120;
    drawWheel(ctx, x, y, 45 + noise(i + 630) * 40, c * (leftward ? -8 : 8), 0.8);
  }
}

/** 发射时刻和音高直接来自配乐，音符飞往两侧，让出人物的脸与身体。 */
function dreamNotes(ctx: CanvasRenderingContext2D, c: number): void {
  const stepTime = INTRO_STORY_BEAT / 2;
  const last = Math.ceil((INTRO_DREAM_FREEZE_AT - INTRO_PELICAN_AT) / stepTime) - 1;
  const current = Math.min(last, Math.floor((c - INTRO_PELICAN_AT) / stepTime));
  for (let step = Math.max(0, current - 6); step <= current; step++) {
    const at = INTRO_PELICAN_AT + step * stepTime;
    const age = c - at;
    const crescendo = at >= INTRO_DREAM_CRESCENDO_AT;
    const life = crescendo ? 1.5 : 1.25;
    if (age >= life || (!crescendo && step % 2 === 1)) continue;
    const progress = age / life;
    const pitch = Math.log2(INTRO_DREAM_MELODY[step % INTRO_DREAM_MELODY.length]! / 440);
    const side = step % 4 < 2 ? -1 : 1;
    const x = (side < 0 ? 720 : 1100) + side * progress * (crescendo ? 490 : 390);
    const y = 650 - progress * (150 + pitch * 180) - Math.sin(progress * Math.PI) * 90;
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.min(1, age / .06) * Math.PI / 2) * (1 - progress) * .9;
    ctx.translate(x, y);
    ctx.rotate(side * (-.15 + progress * .5));
    ctx.scale(crescendo ? 1.15 : 1, crescendo ? 1.15 : 1);
    ctx.fillStyle = step % 2 ? '#f6d38b' : '#9ff3f3';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.5, -.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(5.5, -26);
    ctx.bezierCurveTo(8, -20, 22, -21, 12, -10);
    ctx.stroke();
    ctx.restore();
  }
}

function wheelRhythm(ctx: CanvasRenderingContext2D, c: number, pulse: number): void {
  const phase = wrap((c - INTRO_PELICAN_AT) / INTRO_STORY_BEAT, 1);
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = `rgba(156, 238, 244, ${pulse * .48})`;
  for (const [x, y] of SLOTS) {
    ctx.beginPath();
    ctx.arc(x, y, 13 + phase * 30, 0, TAU);
    ctx.stroke();
    glow(ctx, x, y, 46, `rgba(251, 204, 119, ${pulse * .16})`);
  }
  ctx.restore();
}

function dream(ctx: CanvasRenderingContext2D, s: number, image: HTMLImageElement, w: number, h: number): void {
  const frozen = s >= INTRO_DREAM_FREEZE_AT && s < INTRO_DREAM_FREEZE_AT + INTRO_STORY_BEAT;
  // 局部动作在静拍锁定；之后只有整体镜头旋入，不重新启动鼓点和轮子。
  const c = Math.min(s, INTRO_DREAM_FREEZE_AT);
  const phase = c === INTRO_DREAM_FREEZE_AT ? INTRO_STORY_BEAT : wrap(c - INTRO_PELICAN_AT, INTRO_STORY_BEAT);
  const pulse = Math.exp(-phase * 17);
  const intensity = ease(INTRO_DREAM_CRESCENDO_AT, INTRO_DREAM_FREEZE_AT, c);
  const collapse = ease(INTRO_DREAM_FREEZE_AT + INTRO_STORY_BEAT, WORLD_AT, s);
  const grow = ease(INTRO_PELICAN_AT, INTRO_DREAM_FREEZE_AT, c);
  const punch = Math.max(...INTRO_WHEEL_TRIES.map((at) => hit(c, at, 10)));
  const shot: Shot = {
    x: IMAGE_W / 2 + Math.sin((c - INTRO_PELICAN_AT) * 1.7) * 8 * grow,
    y: IMAGE_H / 2 - pulse * (6 + intensity * 4) + Math.sin(phase * TAU / INTRO_STORY_BEAT) * 2,
    zoom: 1.04 + punch * .008 + pulse * .004 + collapse ** 2 * 3.5,
    angle: Math.sin((c - INTRO_PELICAN_AT) * 2.4) * .009 * grow + collapse ** 2 * 5,
    sx: shake(c, punch * 2, 3),
    sy: shake(c, punch * 2, 4),
  };
  ctx.save();
  shoot(ctx, w, h, shot);
  ctx.drawImage(image, 0, 0, IMAGE_W, IMAGE_H);
  // Fast foreground fragments and pulse rings maintain motion through the side-on chase.
  for (let i = 0; i < 28; i++) {
    const phase = wrap((c - INTRO_PELICAN_AT) * (.35 + noise(i + 88) * .4) + noise(i + 99), 1);
    const x = IMAGE_W * (1 - phase);
    const y = 160 + noise(i + 66) * 610;
    ctx.strokeStyle = `rgba(139, 230, 226, ${Math.sin(phase * Math.PI) * .35})`;
    ctx.lineWidth = 1 + noise(i + 77) * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + intensity * 55, y); ctx.stroke();
  }
  strays(ctx, c);
  wheelRhythm(ctx, c, pulse);
  tries(ctx, c);
  dreamNotes(ctx, c);
  ctx.restore();
  vignette(ctx, w, h, 0.45 + collapse * 0.5, collapse);
  // 定格的那一锤：白闪随重击一起砸下，再退回静拍的淡光。
  flash(ctx, w, h, '#cfe6ff', frozen ? 0.1 + 0.5 * Math.exp(-(s - INTRO_DREAM_FREEZE_AT) * 9) : 0);
}

// ── 第四幕：游戏世界 ────────────────────────────────────────────

function world(ctx: CanvasRenderingContext2D, s: number, canvas: HTMLCanvasElement, w: number, h: number): void {
  // 堡垒由游戏共享场景实时绘制；序章只锁定落点，角色穿越和坠落交给游戏。
  ctx.drawImage(canvas, 0, 0, w, h);
  flash(ctx, w, h, '#fff', 0.5 * hit(s, WORLD_AT, 7));
  // 任务HUD依靠局部阴影保留可读性，关卡本身保持可见。
  flash(ctx, w, h, '#000', 0.12 * ease(INTRO_GOAL_AT, INTRO_GOAL_AT + 1.5, s));
}

/** 每帧完全由真实秒决定；结束后停在最后一帧。 */
export function drawStory(ctx: CanvasRenderingContext2D, seconds: number, images: IntroImages,
  fortress: HTMLCanvasElement, w: number, h: number, language: IntroLanguage = 'zh'): void {
  const s = Math.min(seconds, INTRO_DURATION);
  if (s < GLITCH_AT) night(ctx, s, images.night, w, h);
  // 神经入侵在封禁重击时撕开房间，文字由动态层统一呈现。
  else if (s < DREAM_AT) glitch(ctx, s, s < INTRO_BAN_AT ? images.night : images.glitch, w, h, language);
  else if (s < INTRO_PELICAN_AT) transformation(ctx, s, images, w, h);
  else if (s < WORLD_AT) dream(ctx, s, images.dream, w, h);
  else world(ctx, s, fortress, w, h);
}
