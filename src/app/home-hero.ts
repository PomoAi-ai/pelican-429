import { TUNING } from '../config/tuning.ts';
import { createStage } from '../render/stage.ts';
import { drawFinaleScore } from '../render/intro-finale.ts';
import { createHoleGravity } from './home-gravity.ts';
import { createFacilityPresentation, frameFacilityCamera } from './facility-presentation.ts';
import type { createFacilityEnvironment } from './facility-environment.ts';

/** 首页取景（世界坐标）：左侧被标题覆盖，镜头右移让黑洞（x≈36）和鹈鹕落在标题右侧。 */
const HERO_VIEW = { x: 46, y: 27, height: 38 };
/** 序章里谱线展开、模型谱系逐个上谱的一段（序章秒），首页来回慢放。 */
const SCORE_FROM = 12.6;
const SCORE_SPAN = 2.7;
/** 谱线在序章画面里占纵向 0.5–0.91 这一段，乐谱带只取这一段。 */
const SCORE_TOP = 0.5;
const SCORE_BAND = 0.41;
/** 指针附近的谱线高亮并被轻轻牵动（CSS 像素）：RADIUS 为影响半径，REACH 为指针离谱线中线多远仍算「抓住」，超出即弹回。 */
const HOVER_RADIUS = 180;
const HOVER_REACH = 70;
const HOVER_BEND = 26;
/** 谱线中线在乐谱带里的纵向位置。 */
const SCORE_MID = 0.38;
const SLICE = 3;
/** 指针横扫乐谱时按位置弹出 C 大调五声音阶，左低右高，共三个八度；音色用序章的木槌。 */
const PENTATONIC = [0, 2, 4, 7, 9];
const NOTE_COUNT = 15;
const NOTE_GAP = 0.06;

/**
 * 首页首屏：背景是机房预览「黑洞前哨」镜头的实时场景，底部乐谱带直接调用序章的谱线绘制；
 * 黑洞着色器、天气、鹈鹕和谱线都与游戏、序章共用同一份代码。离开首屏即停止渲染。
 */
export async function startHomeHero(hero: HTMLElement, onError: (error: unknown) => void): Promise<void> {
  const stage = createStage(hero.querySelector<HTMLElement>('.home-hero-art')!, TUNING, { quality: 'high', antialias: 'smaa' });
  // 背景画面只供观看，不进入 Tab 顺序。
  stage.canvas.tabIndex = -1;
  stage.canvas.setAttribute('aria-hidden', 'true');
  let environment: Awaited<ReturnType<typeof createFacilityEnvironment>> | null = null;
  const score = hero.querySelector<HTMLCanvasElement>('.home-hero-score')!;
  const ctx = score.getContext('2d')!;
  // 谱线先画到离屏画布，再按列错位贴回，才能让局部谱线随鼠标弯曲。
  const layer = document.createElement('canvas');
  const layerCtx = layer.getContext('2d')!;
  const pointer = { x: 0, y: 0, near: false };
  // 高亮跟着指针走；弯曲是一根阻尼弹簧，松开后带一点回弹。
  const hover = { x: 0, strength: 0, bend: 0, velocity: 0 };
  const chime = createScoreChime(onError);
  let lastNote = -1;
  hero.addEventListener('pointermove', (event) => {
    const rect = score.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.near = score.checkVisibility() && pointer.x >= 0 && pointer.x <= rect.width
      && Math.abs(pointer.y - rect.height * SCORE_MID) < HOVER_REACH;
    const note = pointer.near ? Math.min(NOTE_COUNT - 1, Math.floor(pointer.x / rect.width * NOTE_COUNT)) : -1;
    if (note >= 0 && note !== lastNote) chime(note, pointer.x / rect.width * 2 - 1);
    lastNote = note;
  });
  hero.addEventListener('pointerleave', () => { pointer.near = false; lastNote = -1; });
  const gravity = createHoleGravity(hero, stage);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frame = 0;
  let time = 0;
  let previous = performance.now();

  const drawScore = (dt: number): void => {
    // 手机布局隐藏乐谱带。
    if (!score.checkVisibility()) return;
    const ratio = Math.min(window.devicePixelRatio, TUNING.render.lighting.maxPixelRatio);
    const width = score.clientWidth;
    const height = score.clientHeight;
    if (score.width !== Math.round(width * ratio) || score.height !== Math.round(height * ratio)) {
      score.width = layer.width = Math.round(width * ratio);
      score.height = layer.height = Math.round(height * ratio);
    }
    layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    layerCtx.clearRect(0, 0, width, height);
    const full = height / SCORE_BAND;
    layerCtx.translate(0, -SCORE_TOP * full);
    const loop = (time * 0.5) % (2 * SCORE_SPAN);
    drawFinaleScore({ ctx: layerCtx, width, height: full, seconds: SCORE_FROM + (loop < SCORE_SPAN ? loop : 2 * SCORE_SPAN - loop) });

    const ease = 1 - Math.exp(-dt * 12);
    if (pointer.near) hover.x = hover.strength < 0.01 ? pointer.x : hover.x + (pointer.x - hover.x) * ease;
    hover.strength += ((pointer.near ? 1 : 0) - hover.strength) * ease;
    const target = pointer.near ? Math.max(-HOVER_BEND, Math.min(HOVER_BEND, (pointer.y - height * SCORE_MID) * 0.6)) : 0;
    // 欠阻尼弹簧：抓住时跟随，离开范围后越过原位再回落。
    hover.velocity += ((target - hover.bend) * 220 - hover.velocity * 9) * dt;
    hover.bend += hover.velocity * dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, score.width, score.height);
    if (hover.strength < 0.01 && Math.abs(hover.bend) < 0.1) {
      ctx.drawImage(layer, 0, 0);
      return;
    }
    const cx = hover.x * ratio;
    const radius = HOVER_RADIUS * ratio;
    const slice = Math.round(SLICE * ratio);
    const left = Math.max(0, Math.floor((cx - 2 * radius) / slice) * slice);
    const right = Math.min(layer.width, left + Math.ceil(4 * radius / slice) * slice);
    ctx.drawImage(layer, 0, 0, left, layer.height, 0, 0, left, layer.height);
    ctx.drawImage(layer, right, 0, layer.width - right, layer.height, right, 0, layer.width - right, layer.height);
    for (const mode of ['source-over', 'lighter', 'lighter'] as const) {
      // 弯曲按列错位；后两遍叠加同一段谱线和谱点，越靠近指针越亮。
      ctx.globalCompositeOperation = mode;
      for (let x = left; x < right; x += slice) {
        const falloff = Math.exp(-2.5 * ((x + slice / 2 - cx) / radius) ** 2);
        ctx.globalAlpha = mode === 'lighter' ? falloff * hover.strength : 1;
        ctx.drawImage(layer, x, 0, slice, layer.height, x, hover.bend * ratio * falloff, slice, layer.height);
      }
    }
    ctx.globalAlpha = 1;
    // 只给谱线本身染上浅色，不在空白处添光。
    ctx.globalCompositeOperation = 'source-atop';
    const tint = ctx.createRadialGradient(cx, height * SCORE_MID * ratio, 0, cx, height * SCORE_MID * ratio, radius);
    tint.addColorStop(0, `rgba(240, 255, 248, ${0.8 * hover.strength})`);
    tint.addColorStop(1, 'rgba(240, 255, 248, 0)');
    ctx.fillStyle = tint;
    ctx.fillRect(cx - radius, 0, 2 * radius, score.height);
    ctx.globalCompositeOperation = 'source-over';
  };

  // 乐谱不依赖 WebGL 场景，贴图下载与着色器编译前就能显示。
  drawScore(0);
  const facility = await createFacilityPresentation(stage, 'fortress', 'webp');
  frameFacilityCamera(stage, HERO_VIEW.x, HERO_VIEW.y, HERO_VIEW.height);
  facility.update(0);
  stage.render();
  hero.classList.add('home-hero-ready');

  const draw = (now: number): void => {
    try {
      // 重新进入视口时，排队中的 rAF 时间戳可能早于刚重置的时钟。
      const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
      previous = now;
      time += dt;
      const view = frameFacilityCamera(stage, HERO_VIEW.x, HERO_VIEW.y, HERO_VIEW.height);
      // 环境尚在加载时，黑洞和乐谱已经可以播放。
      if (environment !== null) environment.update(view, time, dt);
      facility.update(time);
      stage.render();
      gravity(dt, time);
      drawScore(dt);
      if (visible && !document.hidden && !still) frame = requestAnimationFrame(draw);
    } catch (error) {
      onError(error);
    }
  };

  const schedule = (): void => {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden) return;
    previous = performance.now();
    frame = requestAnimationFrame(draw);
  };
  document.addEventListener('visibilitychange', schedule);
  new IntersectionObserver(([entry]) => {
    visible = entry!.isIntersecting;
    schedule();
  }).observe(hero);
  const { createFacilityEnvironment } = await import('./facility-environment.ts');
  environment = await createFacilityEnvironment(stage, 'fortress', { enemies: false, grassyVariant: null });
  // 减少动态效果模式也需要在环境就绪后补画一帧。
  schedule();
}

/**
 * 乐谱的指尖音：沿用序章的木槌音色。浏览器要求用户先在页面上点过才能出声，
 * 所以只在页面已有用户激活时才建音频上下文；音色缓冲首次出声前才生成，不拖慢首屏。
 */
function createScoreChime(onError: (error: unknown) => void): (note: number, pan: number) => void {
  let audio: Promise<{ context: AudioContext; mallet: AudioBuffer }> | null = null;
  let last = 0;
  return (note, pan) => {
    if (!navigator.userActivation.hasBeenActive) return;
    audio ??= import('./intro-score.ts').then(({ createPreludeInstruments }) => {
      const context = new AudioContext();
      return { context, mallet: createPreludeInstruments(context).mallet };
    });
    void audio.then(({ context, mallet }) => {
      if (context.currentTime - last < NOTE_GAP) return;
      last = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = mallet;
      // 木槌缓冲按中央 C 生成，按五声音阶升调。
      source.playbackRate.value = 2 ** ((12 * Math.floor(note / 5) + PENTATONIC[note % 5]!) / 12);
      const gain = context.createGain();
      gain.gain.value = 0.16;
      const panner = new StereoPannerNode(context, { pan: pan * 0.7 });
      source.connect(gain).connect(panner).connect(context.destination);
      source.start();
    }).catch(onError);
  };
}
