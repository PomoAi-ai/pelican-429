// 场景加载画面（游戏启动、住宅启动与场景工作区共用）：序章的神经星核居中，五线谱带在底部。
// 交互：指针拨动星核与谱带，点击或敲键盘奏音（E、G、A、C 是序章四音，Shift 升八度），
// 悬停章节看详情、点章节重放该章旋律，右上角开关声音，失败时中央出现“重新加载”。
// 画面与音乐共用 120 BPM 拍网：每完成一份资源在拍点奏和声动机、落下音符并点亮星核神经元。
import { CORAL, CYAN, GOLD, IVORY, STORM, STORM_VIOLET, VIOLET, hit, label, mix, note, star, stroke, type Point } from '../../render/intro/intro-finale-geometry.ts';
import { clamp, glow, MONO, SANS, SERIF, seeded, smooth, TAU } from '../../render/intro/intro-edition-shared.ts';
import { tornLabel } from '../../render/intro/intro-finale-storm.ts';
import type { Instrument, PreludeInstruments } from '../intro/intro-score.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';
// 绘制函数里 t 是时间参数，文案经 i18n.t 取。
import * as i18n from '../../config/i18n.ts';
import '../../ui/hud/scene-loading.css';

const BEAT = .5, EIGHTH = BEAT / 2, SIXTEENTH = BEAT / 4;
const LAYERS = 8, PER_LAYER = 10, NODES = LAYERS * PER_LAYER;
// 乐谱只留一根主线，横穿星盘中心；星盘缩到原来的 1/4，主线保持原宽。
const ROOT = 261.625565, CORE_Y = .51, STAFF_Y = CORE_Y, DISC = .25;
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
/** 序章前四小节和声循环：C → Am → F → G，每小节带四音上升动机，使资源音永远与背景和声严丝合缝。 */
const HARMONY = [
  { bass: 36, notes: [60, 64, 67, 74], motif: [64, 67, 69, 72] },
  { bass: 33, notes: [60, 64, 69, 72], motif: [64, 67, 69, 72] },
  { bass: 29, notes: [60, 65, 69, 76], motif: [65, 69, 72, 76] },
  { bass: 31, notes: [59, 62, 67, 74], motif: [62, 67, 71, 74] },
] as const;
const PENTATONIC = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84] as const;
/** 节点激活顺序：由外环向星核内部渐进并混入随机扰动，既能看清信号向心汇聚，又不会死板地按圈填表。 */
const ORDER = Array.from({ length: NODES }, (_, i) => i).sort((a, b) =>
  (Math.floor(a / PER_LAYER) / LAYERS * .56 + seeded(a * 7 + 3) * .44) -
  (Math.floor(b / PER_LAYER) / LAYERS * .56 + seeded(b * 7 + 3) * .44));

interface Phase { name: string; total?: number; completed?: number; pulses: number; done: boolean; startAt: number; doneAt?: number }
interface Cue {
  at: number; kind: 'item' | 'phase' | 'fail' | 'ready' | 'tap';
  lit: number; progress: number; u: number; phaseIndex: number; nodeIndex: number; pitch: number; x?: number; y?: number;
}

export function createSceneLoading(parent: HTMLElement, retry: () => void) {
  const root = document.createElement('div');
  root.className = 'scene-loading';
  root.hidden = true;
  // 按钮是真按钮而不是画在画布上：键盘能聚焦，读屏能读到；阶段与失败原因另由 status 播报。
  root.innerHTML = '<canvas aria-hidden="true"></canvas><div class="scene-loading-ui"><button type="button" class="scene-loading-sound" aria-pressed="true"></button><button type="button" class="scene-loading-retry" hidden></button></div><p class="scene-loading-status" role="status" aria-live="polite"></p>';
  parent.append(root);
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const soundButton = root.querySelector<HTMLButtonElement>('.scene-loading-sound')!;
  const retryButton = root.querySelector<HTMLButtonElement>('.scene-loading-retry')!;
  const status = root.querySelector<HTMLElement>('.scene-loading-status')!;
  const now = (): number => performance.now() / 1000;
  const origin = now(), clock = (): number => now() - origin;

  let title = '', kicker = '', expectedPhases = 3;
  let phases: Phase[] = [], cur = -1;
  let failed = false, failAt = 0;
  let readyRequested = false, readyCue: Cue | null = null;
  let shownAt = 0, items = 0, cues: Cue[] = [], lit = 0;
  const litAt = new Float64Array(NODES).fill(-1);
  let ticks = 0, shownProgress = 0;
  const pointer = { x: .5, y: .5, tx: .5, ty: .5, vx: 0, vy: 0, inside: false };
  // 按住指针蓄力：按得越久星盘被拽得越远，松开后回落。
  let force = 0, pressing = false, releaseAt = -Infinity, releaseForce = 0;
  // 牵引力学：星盘挂一根阻尼弹簧，蓄力时被拽向光标，松手再弹回；乐谱随星盘像弦一样被拉动。
  type Spring = { x: number; y: number; vx: number; vy: number };
  const tug: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
  let stepDt = 0;
  const spring = (sp: Spring, tx: number, ty: number, k: number, c: number): void => {
    // 按 1/120 秒细分，掉帧时弹簧也不发散。
    const n = Math.ceil(stepDt * 120), dt = stepDt / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      sp.vx += (k * (tx - sp.x) - c * sp.vx) * dt; sp.vy += (k * (ty - sp.y) - c * sp.vy) * dt;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
    }
  };
  let strums: { x: number; y: number; at: number; strength: number }[] = [];
  let frame = 0, last = clock(), lastNodePingAt = 0, lastNoteHover = -1;
  /** 章节标签的命中框（每帧重算），以及悬停中的章节与被点击重放的音。 */
  let chapterBoxes: { m: number; x: number; y: number; w: number; h: number }[] = [];
  let hoverChapter = -1;
  let echoes: { cue: Cue; at: number }[] = [];
  const chapterFlash: number[] = [];

  /* ---------- 音乐 ---------- */
  // 首次手势时才建 AudioContext 并按需下载、合成序章音色，不碰加载页就不付这份开销；音色就绪前 voice() 不出声。
  let output: { context: AudioContext; master: GainNode } | null = null;
  let instruments: PreludeInstruments | null = null;
  let soundOn = true, scheduledTo = 0;
  const audioReady = (): boolean => Boolean(output && instruments && soundOn && output.context.state === 'running');
  const audioTime = (t: number): number => output!.context.currentTime + (t - clock());
  const chordAt = (t: number) => HARMONY[Math.floor(t / (BEAT * 4)) % HARMONY.length]!;

  function voice(t: number, instrument: Instrument, pitch: number, gain: number, length: number, pan = 0): void {
    if (!audioReady()) return;
    const { context, master } = output!;
    const at = Math.max(context.currentTime, audioTime(t));
    const source = context.createBufferSource();
    source.buffer = instruments![instrument];
    source.playbackRate.value = midi(pitch) / ROOT;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, at);
    amp.gain.setTargetAtTime(0.0001, at + length, length * .35);
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(amp).connect(panner).connect(master);
    source.onended = () => panner.disconnect();
    source.start(at); source.stop(at + length * 3 + .2);
  }

  /** 背景织体随进度逐层丰满：低音与玻璃长音垫底 → 槌击琶音 → 弦乐铺底与定音鼓脉搏 → 就绪后余韵。 */
  function scheduleBar(step: number, t: number): void {
    const done = readyCue !== null && t >= readyCue.at, doneAt = readyCue?.at ?? Infinity;
    if (failed || (done && t > doneAt + BEAT * 8)) return;
    const chord = HARMONY[Math.floor(step / 8) % HARMONY.length]!, k = step % 8;
    if (done) {
      if (k === 0) {
        chord.notes.forEach((n, i) => voice(t, 'glass', n + 12, .028, 2.2, (i - 1.5) * .32));
        voice(t, 'strings', chord.notes[0]!, .024, 2.4, -.25);
      }
      return;
    }
    const est = shownProgress;
    if (k === 0) {
      chord.notes.forEach((n, i) => voice(t, 'glass', n, .022, 2.2, (i - 1.5) * .35));
      voice(t, 'bass', chord.bass + 12, .15, 1.1);
      if (est > .32) {
        voice(t, 'strings', chord.notes[0]! - 12, .026, 2.1, -.35);
        voice(t, 'strings', chord.notes[2]! - 12, .022, 2.1, .35);
      }
    }
    if (k === 4) voice(t, 'bass', chord.bass + 12, .095, .8);
    if (est > .18) voice(t, 'mallet', chord.notes[[0, 2, 1, 3, 2, 1, 3, 2][k]!]! + 12, .032 + est * .028, .48, k % 2 ? .42 : -.42);
    if (est > .48 && k % 4 === 0) voice(t, 'timpani', chord.bass + 12, .055, .6);
    if (est > .65 && k % 2 === 1) voice(t, 'piano', chord.notes[(k >> 1) % 4]!, .028, .45, (k - 3.5) * .12);
  }

  /* ---------- 拍网与进度映射 ---------- */
  const nextGrid = (t: number, grid: number): number => Math.ceil((t + .018) / grid) * grid;
  const lastCueAt = (): number => cues.reduce((a, c) => c.kind === 'tap' ? a : Math.max(a, c.at), 0);
  const measureCount = (): number => Math.max(expectedPhases, phases.length, 1);
  const phaseFraction = (p: Phase): number => p.done ? 1 : p.total ? clamp((p.completed ?? 0) / p.total) * .92 : (1 - .66 ** p.pulses) * .88;
  const rawProgress = (): number => readyRequested ? 1 : clamp(phases.reduce((s, p) => s + phaseFraction(p), 0) / measureCount());

  function cue(kind: Cue['kind'], grid: number, pitch: number, extra: Partial<Cue> = {}): Cue {
    const nowT = clock(), lastAt = lastCueAt();
    // 排队积压超过一拍时自动加密为十六分音符跑动，避免完成音效拖后。
    const step = lastAt - nowT > BEAT ? SIXTEENTH : EIGHTH;
    const at = kind === 'tap' || kind === 'fail' ? nextGrid(nowT, grid) : Math.max(nextGrid(nowT, grid), lastAt + step);
    const prog = extra.progress ?? rawProgress();
    const targetLit = extra.lit ?? Math.min(NODES, Math.max(1, Math.round(prog * NODES)));
    const nodeIndex = ORDER[Math.min(NODES - 1, Math.max(0, targetLit - 1))]!;
    const c: Cue = {
      at, kind, lit: targetLit, progress: prog, u: extra.u ?? clamp(prog),
      phaseIndex: extra.phaseIndex ?? Math.max(0, cur), nodeIndex, pitch, ...extra,
    };
    cues.push(c);
    const pan = (c.u - .5) * 1.1;
    if (kind === 'item') {
      voice(at, 'mallet', pitch, .14, .85, pan);
      voice(at, 'piano', pitch, .065, .55, pan * .6);
      if (c.phaseIndex >= 1) voice(at, 'glass', pitch + 12, .022, 1.2, -pan * .5);
    }
    if (kind === 'phase') {
      const chord = chordAt(at);
      chord.notes.forEach((n, i) => {
        voice(at + i * .02, 'piano', n, .07, 1.25, (i - 1.5) * .28);
        voice(at + i * .02, 'glass', n + 12, .024, 1.6, (1.5 - i) * .25);
      });
      voice(at, 'timpani', chord.bass + 12, .09, .75);
    }
    if (kind === 'tap') {
      const tapPan = (extra.x ?? .5) * 1.5 - .75;
      voice(at, 'glass', pitch, .055, 1.4, tapPan);
      voice(at, 'mallet', pitch, .095, .6, tapPan);
      voice(at, 'piano', pitch - 12, .045, .8, tapPan * .5);
    }
    if (kind === 'fail') {
      voice(at, 'timpani', 29, .32, 1.5);
      voice(at, 'brass', 48, .1, 1.3, -.35); voice(at, 'brass', 51, .09, 1.3, .35); voice(at, 'brass', 54, .085, 1.3);
      voice(at, 'piano', 60, .1, .7, -.2); voice(at, 'piano', 66, .1, .7, .2);
      for (let r = 1; r <= 4; r++) voice(at + r * .085, 'mallet', 66 - r * 3, .11 / r, .22, r % 2 ? .55 : -.55);
    }
    if (kind === 'ready') {
      [64, 67, 69, 72, 76, 79, 81, 84].forEach((n, i) => {
        const tNote = at + i * (SIXTEENTH * .75);
        voice(tNote, 'mallet', n, .11, .85, (i - 3.5) * .16);
        voice(tNote, 'piano', n, .06, .7, (i - 3.5) * .12);
        voice(tNote, 'glass', n, .028, 1.6, (3.5 - i) * .14);
      });
      const resolveAt = at + BEAT;
      [48, 55, 60, 64, 67, 72].forEach((n, i) => {
        voice(resolveAt, 'brass', n, .06, 2.4, (i - 2.5) * .22);
        voice(resolveAt, 'strings', n, .04, 2.8, (2.5 - i) * .2);
      });
      voice(resolveAt, 'timpani', 36, .24, 1.4);
    }
    return c;
  }

  function nextMotifPitch(phaseIdx: number): number {
    const chord = chordAt(Math.max(clock(), lastCueAt()));
    const base = chord.motif[items % 4]!;
    const shift = (phaseIdx >= 2 && items % 2 === 1) ? 12 : (Math.floor(items / 4) % 2) * 12;
    return Math.min(84, base + shift);
  }

  /* ---------- 几何与绘制 ---------- */
  const beatPulse = (t: number): number => { const b = Math.floor(t / BEAT); return Math.exp(-(t - b * BEAT) * 9) * (b % 4 ? .55 : 1); };
  const eighthPulse = (t: number): number => Math.exp(-(t % EIGHTH) * 14);
  const past = (t: number): Cue[] => cues.filter(c => c.at <= t);
  const pitchRow = (pitch: number): number => 4 - clamp((pitch - 60) / 24) * 4;

  function staffPoint(u: number, row: number, v: number, voicesCount: number, w: number, h: number, t: number, f: number, beat: number, mx: number, my: number): Point {
    // 乐谱两端钉死、中间穿过星盘：星盘被拽走时整根线像被拉开的弦，折点跟着星盘，两侧线性摊开。
    const u0 = Math.min(.95, Math.max(.05, (.5 + tug.x / w - .06) / .88)), string = u < u0 ? u / u0 : (1 - u) / (1 - u0);
    const x = w * (.06 + .88 * u) + tug.x * string;
    const gap = Math.max(4.2, Math.min(6.2, h * .0068));
    const base = h * STAFF_Y, taper = Math.sin(u * Math.PI);
    let y = base + tug.y * string + Math.sin(u * TAU * 1.25 - t * 1.15 + v * 1.05) * h * .012 * taper + (v - (voicesCount - 1) / 2) * h * .011 + (row - 2) * gap;
    y += Math.sin(u * TAU * 6.5 - t * 3.8 + row * .8) * (.85 + beat * 1.3) * taper;
    const pluck = pointer.inside ? clamp(1 - Math.abs(my - base) / (h * .18)) : 0;
    const bend = Math.exp(-(((x - mx) / (w * .078)) ** 2)) * pluck;
    y = mix(y, my + (row - 2) * (gap * 1.15), bend * .74);
    for (const s of strums) {
      const age = t - s.at, spread = Math.exp(-(((x - s.x * w) / (w * .15)) ** 2));
      y += Math.sin((x - s.x * w) * .055 - age * 36) * Math.exp(-age * 3.2) * spread * h * .013 * s.strength;
    }
    if (failed) {
      const jolt = Math.floor(t * 20), piece = Math.floor(u * 10) * 31 + Math.round(row) * 13 + v * 7;
      const tear = f * (seeded(jolt * 7 + piece) - .5);
      y += tear * h * .05;
      return [x + tear * w * .02, y];
    }
    return [x, y];
  }

  /** 复刻序章宽幅星核透视（1 / (1 + z * .75)），同时在末层向球心平滑收束，消除折角。 */
  function projectNode(d: number, n: number, w: number, h: number, t: number): { pos: Point; depthSin: number } {
    const scale = Math.min(w, h);
    const cx = w * .5 + (pointer.x - .5) * w * .022 + tug.x;
    const drop = failed ? Math.max(0, t - failAt - .4) ** 2 * h * .4 : 0;
    const cy = h * CORE_Y + (pointer.y - .5) * h * .015 + drop + tug.y;
    const yaw = t * .12 + (pointer.x - .5) * 1.1;
    const tilt = .21 + (pointer.y - .5) * .15;
    const rx = Math.min(w * .44, scale * .94) * DISC;
    const z = d * .4, p = 1 / (1 + z * .75);
    const taper = 1 - (d / LAYERS) * .22;
    const zOffset = z * .045 * (1 - d / (LAYERS - 1) * .55);
    const a = n / PER_LAYER * TAU + yaw + d * .15;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    return {
      pos: [cx + cosA * rx * p * taper, cy + (sinA * tilt * taper - zOffset) * h * p * DISC],
      depthSin: sinA,
    };
  }

  function draw(): void {
    const t = clock(), dt = Math.min(VIEW_MAX_DT, t - last); last = t;
    const ratio = Math.min(devicePixelRatio, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) { frame = requestAnimationFrame(draw); return; }
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    force = clamp(force + (pressing ? dt / 2.5 : -dt * 1.2)); stepDt = dt;
    const follow = 1 - Math.exp(-dt * 5);
    const prevX = pointer.x, prevY = pointer.y;
    pointer.x += ((pointer.inside ? pointer.tx : .5) - pointer.x) * follow;
    pointer.y += ((pointer.inside ? pointer.ty : .5) - pointer.y) * follow;
    pointer.vx = (pointer.x - prevX) / Math.max(.001, dt);
    pointer.vy = (pointer.y - prevY) / Math.max(.001, dt);

    // 无计数阶段在等待期间按每拍自动发出谐波脉冲，使进度、谱带与星核持续演进。
    const activePhase = phases[cur];
    if (activePhase && !activePhase.done && !activePhase.total && !failed && !readyRequested) {
      if (t + .08 >= Math.max(activePhase.startAt + EIGHTH, lastCueAt() + BEAT) && activePhase.pulses < 6) {
        activePhase.pulses++;
        const m = measureCount(), frac = phaseFraction(activePhase), prog = clamp((cur + frac) / m);
        cue('item', BEAT, nextMotifPitch(cur), {
          phaseIndex: cur, u: clamp((cur + .1 + frac * .82) / m), progress: prog, lit: Math.max(lit + 1, Math.round(prog * NODES)),
        });
        items++;
      }
    }

    while (scheduledTo < t + .15) {
      if (scheduledTo >= t - .05) scheduleBar(Math.round(scheduledTo / EIGHTH), scheduledTo);
      scheduledTo += EIGHTH;
    }

    const heard = past(t);
    const doneNow = readyCue !== null && t >= readyCue.at, doneAt = readyCue?.at ?? Infinity;
    const heardProg = doneNow ? 1 : heard.reduce((a, c) => c.kind === 'tap' ? a : Math.max(a, c.progress), 0);
    shownProgress += (heardProg - shownProgress) * (1 - Math.exp(-dt * 8));

    const targetLit = doneNow ? NODES : heard.reduce((a, c) => c.kind === 'tap' ? a : Math.max(a, c.lit), 0);
    let stepIdx = 0;
    while (lit < targetLit) {
      litAt[ORDER[lit]!] = (doneNow ? doneAt : t) + stepIdx * .016;
      lit++; stepIdx++;
    }
    ticks += ((doneNow ? 1 : shownProgress) * 40 - ticks) * (1 - Math.exp(-dt * 6));

    const f = failed ? smooth(failAt, failAt + .25, t) : 0;
    const g = doneNow ? smooth(doneAt, doneAt + .55, t) : 0;
    const beat = beatPulse(t) * (failed ? .2 : 1);
    const struck = heard.reduce((a, c) => Math.max(a, hit(t, c.at, c.kind === 'phase' ? 6 : 10) * (c.kind === 'phase' ? 1 : .65)), 0);
    const readyHit = doneNow ? hit(t, doneAt, 3.2) : 0, failHit = failed ? hit(t, failAt, 5) : 0;
    const energy = Math.max(beat * .55, struck, readyHit) * (1 + g * .6);
    const mx = pointer.x * w, my = pointer.y * h;

    const px = pointer.tx * w, py = pointer.ty * h;
    hoverChapter = pointer.inside && !failed ? chapterBoxes.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)?.m ?? -1 : -1;
    chapterBoxes = [];
    echoes = echoes.filter(e => t - e.at < 2);
    backdrop(w, h, t, f, g, beat);
    ctx.save();
    const zoom = 1 + beat * .008 + struck * .014 + readyHit * .065 + failHit * .045;
    ctx.translate(w * .5, h * .5); ctx.scale(zoom, zoom); ctx.translate(-w * .5, -h * .5);
    const shakeAmp = (failed && t - failAt < 1.2 ? (1.8 + failHit * 12) : readyHit * 9) * Math.min(1, w / 900);
    if (shakeAmp > .05) {
      const j = Math.floor(t * 42);
      ctx.translate((seeded(j + 91) - .5) * shakeAmp * 2, (seeded(j + 191) - .5) * shakeAmp * 2);
    }
    filaments(w, h, t, f, g, beat, mx, my);
    core(w, h, t, g, energy, mx, my, doneNow, doneAt);
    staff(w, h, t, f, g, mx, my, doneNow);
    lensStreak(w, h, g, readyHit, struck);
    copy(w, h, t, f, doneNow, beat);
    storm(w, h, t, f);
    ctx.restore();

    if (failed && t >= failAt + .04 && t < failAt + .1) {
      ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    flash(w, h, t);
    if (hoverChapter >= 0) chapterCard(w, h, t);
    cursor(w, h, t, beat, f, g);
    frame = requestAnimationFrame(draw);
  }

  function backdrop(w: number, h: number, t: number, f: number, g: number, beat: number): void {
    ctx.globalAlpha = 1; ctx.fillStyle = '#040709'; ctx.fillRect(0, 0, w, h);
    const haze = (a: string, b: string, alpha: number): void => {
      if (alpha <= 0) return;
      const r = ctx.createRadialGradient(w * .5, h * CORE_Y, 0, w * .5, h * CORE_Y, Math.max(w, h) * .73);
      r.addColorStop(0, a); r.addColorStop(.43, b); r.addColorStop(1, '#030609');
      ctx.globalAlpha = alpha; ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
    };
    haze('#10252e', '#0c141e', .9 * (1 - f) * (1 - g));
    haze('#3d0b2e', '#18081b', .9 * f);
    haze('#5a3c19', '#1f1812', .9 * g);
    if (shownProgress > .05 && !failed) {
      ctx.globalAlpha = shownProgress * .55 * (1 - g);
      glow(ctx, w * .5, h * CORE_Y, Math.max(w, h) * .54, '#2fb8b422');
    }
    if (g > 0) { ctx.globalAlpha = g; glow(ctx, w * .5, h * .46, Math.max(w, h) * .65, '#f8c66a38'); }
    const px = pointer.x - .5, py = pointer.y - .5;
    for (let i = 0; i < 110; i++) {
      const depth = .5 + seeded(i + 410) * 1.5;
      const fall = failed ? Math.max(0, t - failAt - seeded(i + 29) * .8) ** 2 * .5 : 0;
      const x = w * .5 + (seeded(i + 17) - .5) * w * 1.1 / depth - px * w * .03 / depth;
      const y = h * .5 + (seeded(i + 817) - .5) * h * 1.1 / depth - py * h * .03 / depth + fall * h;
      const onBeat = seeded(i + 51) > .7 ? beat * .35 : 0;
      ctx.globalAlpha = (.12 + .2 * Math.sin(t * .7 + i) ** 2 + onBeat) * (1 + g);
      star(ctx, x, y, (.35 + .75 / depth) * (1 + g * .6), f > .5 ? '#d9c6ff' : i % 9 === 0 ? GOLD : IVORY);
    }
    ctx.globalAlpha = 1;
  }

  /** 谐波光丝：底部五线谱每落下一颗音符，就有一道贝塞尔光束跃向星核中被它激活的神经元。 */
  function filaments(w: number, h: number, t: number, f: number, g: number, beat: number, mx: number, my: number): void {
    if (failed) return;
    const voicesCount = 1;
    const palette = [CYAN, CORAL, VIOLET];
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const c of past(t)) {
      if (c.kind !== 'item' && c.kind !== 'phase' && c.kind !== 'ready') continue;
      const span = c.kind === 'item' ? .58 : .78, age = (t - c.at) / span;
      if (age < 0 || age > 1) continue;
      const row = c.kind === 'ready' ? 0 : c.kind === 'phase' ? 2 : pitchRow(c.pitch);
      const [sx, sy] = staffPoint(c.u, row, 0, voicesCount, w, h, t, f, beat, mx, my);
      const d = Math.floor(c.nodeIndex / PER_LAYER), n = c.nodeIndex % PER_LAYER;
      const { pos: [tx, ty] } = projectNode(d, n, w, h, t);
      const bx = mix(sx, tx, .5) + (tx - w * .5) * .28, by = mix(sy, ty, .55) - h * .06;
      const q = (p: number): Point => [(1 - p) ** 2 * sx + 2 * (1 - p) * p * bx + p * p * tx, (1 - p) ** 2 * sy + 2 * (1 - p) * p * by + p * p * ty];
      const head = clamp(age * 1.28), tail = clamp(age * 1.28 - .42);
      const color = g > .5 || c.kind === 'ready' ? GOLD : c.kind === 'phase' ? IVORY : palette[c.phaseIndex % 3]!;
      const pts = Array.from({ length: 15 }, (_, s) => q(mix(tail, head, s / 14)));
      ctx.globalAlpha = Math.sin(age * Math.PI) * (c.kind === 'item' ? .55 : .8);
      stroke(ctx, pts, color, c.kind === 'item' ? 1.05 : 1.5);
      const [hx, hy] = q(head);
      ctx.globalAlpha = 1 - age * .7;
      glow(ctx, hx, hy, c.kind === 'item' ? 12 : 18, `${color}55`);
      star(ctx, hx, hy, c.kind === 'item' ? 1.4 : 2.1, IVORY, c.kind !== 'item');
    }
    ctx.restore();
  }

  function core(w: number, h: number, t: number, g: number, energy: number, mx: number, my: number, doneNow: boolean, doneAt: number): void {
    const color = failed ? STORM : doneNow ? GOLD : CYAN;
    const flicker = failed ? .35 + .65 * seeded(Math.floor(t * 24) + 7) : 1;
    const scale = Math.min(w, h);
    const cx = w * .5 + (pointer.x - .5) * w * .022 + tug.x;
    const drop = failed ? Math.max(0, t - failAt - .4) ** 2 * h * .4 : 0;
    const cy = h * CORE_Y + (pointer.y - .5) * h * .015 + drop + tug.y;
    const tilt = .21 + (pointer.y - .5) * .15;
    const layers = Array.from({ length: LAYERS }, (_, d) => Array.from({ length: PER_LAYER }, (_, n) => projectNode(d, n, w, h, t)));
    // 指针离节点越近越亮：随距离平方衰减；节点不动不胀，免得挤成一团。
    const reach = scale * .9, pull = (p: Point): number => pointer.inside ? clamp(1 - Math.hypot(p[0] - mx, p[1] - my) / reach) ** 2 : 0;
    const wave = (d: number): number => doneNow
      ? Math.exp(-(((t - doneAt) * 2.2 - d * .09 + 4) % 1) * 4.5)
      : Math.exp(-(((t / BEAT) % 1 + (LAYERS - d) * .1) % 1) * 5);

    // 同屏最多 6 个节点亮成大点：新点亮的优先，其次离指针近的；其余一律小点，免得密密麻麻。
    const featured = new Set(layers.flatMap((nodes, d) => nodes.map(({ pos }, n) => {
      const i = d * PER_LAYER + n, at = litAt[i]!;
      return { i, s: (at >= 0 && at <= t ? hit(t, at, 4) : 0) + pull(pos) * .5 };
    })).filter(e => e.s > .02).sort((a, b) => b.s - a.s).slice(0, 6).map(e => e.i));

    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let d = LAYERS - 1; d >= 0; d--) {
      const nodes = layers[d]!, act = wave(d);
      const ringPts = nodes.map(item => item.pos);
      ctx.globalAlpha = flicker * (.1 + act * .14);
      stroke(ctx, [...ringPts, ringPts[0]!], d % 2 && !failed && !doneNow ? VIOLET : color, .6);
      nodes.forEach(({ pos: a, depthSin }, n) => {
        const index = d * PER_LAYER + n, on = litAt[index]! >= 0 && litAt[index]! <= t, born = on ? hit(t, litAt[index]!, 4) : 0;
        const depthBoost = .78 + .28 * (depthSin + 1) * .5;
        const b: Point = d === LAYERS - 1 ? [cx, cy] : layers[d + 1]![n]!.pos;
        const close = pull(a);
        if (Math.hypot(a[0] - mx, a[1] - my) < scale * .02 && t - lastNodePingAt > .11 && Math.hypot(pointer.vx, pointer.vy) > .08) {
          lastNodePingAt = t;
          voice(t, 'glass', PENTATONIC[(n + d) % PENTATONIC.length]! + 12, .022, .65, (a[0] / w - .5) * 1.2);
        }
        ctx.globalAlpha = flicker * ((on ? .2 + energy * .2 : .05) + close * .3) * depthBoost;
        stroke(ctx, [a, b], color, .65);
        if (d < LAYERS - 1) {
          const nextDiag = (n + 1) % PER_LAYER, diagIdx = (d + 1) * PER_LAYER + nextDiag;
          if (on && litAt[diagIdx]! >= 0 && litAt[diagIdx]! <= t) {
            ctx.globalAlpha = flicker * (.1 + act * .12) * depthBoost;
            stroke(ctx, [a, layers[d + 1]![nextDiag]!.pos], n % 2 ? color : CYAN, .48);
          }
        }
        if (on) {
          const travel = born > .05 ? 1 - born : (t / BEAT + n * .17 - d * .13 + 8) % 1, tail = Math.max(0, travel - .23);
          const hx = mix(a[0], b[0], travel), hy = mix(a[1], b[1], travel);
          ctx.globalAlpha = flicker * Math.sin(travel * Math.PI) * (.5 + born * .5 + energy * .3) * depthBoost;
          stroke(ctx, [[mix(a[0], b[0], tail), mix(a[1], b[1], tail)], [hx, hy]], n % 3 ? color : IVORY, 1.2 + born);
          star(ctx, hx, hy, (.85 + born * .85) * depthBoost, IVORY);
        }
        const big = featured.has(index), r = scale * .0042 * .55 * (big ? 1 + act : 1) / (1 + d * .16) * depthBoost;
        ctx.globalAlpha = flicker * (on ? .54 + act * .46 : .16 + close * .5) * depthBoost;
        star(ctx, a[0], a[1], big && on ? r * 1.45 : r * .6, on && n % 3 === 0 ? IVORY : color, big && on && d === 0 && n % 2 === 0);
        if (!big) return;
        if (born > .01) {
          ctx.globalAlpha = flicker * born; ctx.strokeStyle = IVORY; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(a[0], a[1], r * (2 + (1 - born) * 10), 0, TAU); ctx.stroke();
          glow(ctx, a[0], a[1], r * 10 * born, `${color}60`);
        } else if (on && d % 3 === 0) {
          ctx.globalAlpha = flicker * .48 * depthBoost;
          ctx.beginPath(); ctx.arc(a[0], a[1], r * 3, 0, TAU); ctx.lineWidth = .6; ctx.strokeStyle = color; ctx.stroke();
        }
      });
    }

    {
      const ox = pointer.tx * w - cx + tug.x, oy = pointer.ty * h - cy + tug.y, m = Math.hypot(ox, oy), cap = Math.min(w * .44, scale * .94) * DISC * .7;
      const k = pointer.inside ? Math.min(m * .2, cap) / Math.max(1, m) * force : 0;
      spring(tug, ox * k, oy * k, 70, 9);
    }

    for (let ring = 0; ring < 4; ring++) {
      const r = scale * (.075 + ring * .036) * DISC * (1 + energy * .1);
      const rot = (ring % 2 ? -1 : 1) * t * (.25 + ring * .07) + (pointer.x - .5) * (ring % 2 ? -.6 : .6);
      ctx.globalAlpha = flicker * (.6 - ring * .1);
      ctx.strokeStyle = ring % 2 ? (failed ? STORM_VIOLET : doneNow ? IVORY : CYAN) : color;
      ctx.lineWidth = ring ? .8 : 1.6;
      for (let a = 0; a < 3; a++) {
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * tilt * 2, (ring - 1.5) * .32, rot + a * TAU / 3, rot + a * TAU / 3 + 1.45); ctx.stroke();
      }
    }

    const dialR = scale * .22 * DISC, dialTilt = tilt * 1.85;
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * TAU - Math.PI / 2, on = k < Math.floor(ticks), edge = k === Math.floor(ticks), major = k % 5 === 0;
      const len = (major ? 4 : 2) * (on ? 1 + energy * .4 : 1);
      ctx.globalAlpha = flicker * (on ? .9 : edge ? .3 + energy * .6 : major ? .22 : .14);
      stroke(ctx, [[cx + Math.cos(a) * dialR, cy + Math.sin(a) * dialR * dialTilt], [cx + Math.cos(a) * (dialR + len), cy + Math.sin(a) * (dialR + len) * dialTilt]], on ? (major ? GOLD : IVORY) : color, on ? 1.25 : .7);
    }
    const mCount = measureCount();
    for (let pIdx = 0; pIdx < mCount; pIdx++) {
      const a = (pIdx / mCount) * TAU - Math.PI / 2;
      const reached = shownProgress >= pIdx / mCount - .01;
      ctx.globalAlpha = flicker * (reached ? .75 : .24);
      label(ctx, ROMAN[pIdx] ?? String(pIdx + 1), cx + Math.cos(a) * (dialR + 10), cy + Math.sin(a) * (dialR + 10) * dialTilt, 8, 30, reached ? IVORY : color, MONO, 600);
    }

    const sphere = scale * .07 * DISC * (1 + energy * .06);
    const hover = pointer.inside ? clamp(1 - Math.hypot(mx - cx, my - cy) / (scale * .12 * DISC * 2)) : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.28 + (pointer.x - .5) * .3); ctx.strokeStyle = color; ctx.lineWidth = .8;
    for (let k = 0; k < 6; k++) {
      const lon = k / 6 * Math.PI + t * (.35 + hover * 1.2);
      ctx.globalAlpha = flicker * (.28 + .35 * Math.abs(Math.cos(lon)) + hover * .2);
      ctx.beginPath(); ctx.ellipse(0, 0, sphere * Math.max(.025, Math.abs(Math.cos(lon))), sphere, 0, 0, TAU); ctx.stroke();
    }
    for (let l = -2; l <= 2; l++) {
      const y = l * sphere * .3; ctx.globalAlpha = flicker * .4;
      ctx.beginPath(); ctx.ellipse(0, y, Math.sqrt(sphere * sphere - y * y), sphere * .15, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();

    for (const c of past(t)) {
      if (c.kind !== 'tap' && c.kind !== 'phase' && c.kind !== 'ready') continue;
      const p = (t - c.at) / (c.kind === 'tap' ? .7 : c.kind === 'phase' ? 1.2 : 1.45);
      if (p < 0 || p >= 1) continue;
      const eased = 1 - (1 - p) ** 3;
      const ox = c.kind === 'tap' ? c.x! * w : cx, oy = c.kind === 'tap' ? c.y! * h : cy;
      const rx = scale * (.02 + eased * (c.kind === 'ready' ? .58 : c.kind === 'tap' ? .12 : .44)) * (c.kind === 'tap' ? 1 : DISC * 1.6), ry = rx * tilt * 2;
      const waveCol = c.kind === 'ready' ? GOLD : c.kind === 'tap' ? IVORY : color;
      ctx.beginPath(); ctx.ellipse(ox, oy, rx, ry, 0, 0, TAU); ctx.strokeStyle = waveCol;
      // 点按/键盘涟漪只做细圈，宽光带会在连续敲击时铺满星核。
      if (c.kind !== 'tap') { ctx.globalAlpha = (1 - p) * (c.kind === 'ready' ? .22 : .12); ctx.lineWidth = 2 + (1 - p) * (c.kind === 'ready' ? 40 : 16); ctx.stroke(); }
      ctx.globalAlpha = (1 - p) * (c.kind === 'tap' ? .65 : .85); ctx.lineWidth = 1.2 + (1 - p) * 2; ctx.stroke();
    }

    if (doneNow) {
      const burst = clamp((t - doneAt) / 1.25);
      if (burst < 1) {
        const reachRay = Math.hypot(w, h) * .52;
        for (let ray = 0; ray < 42; ray++) {
          const angle = seeded(ray + 1700) * TAU, length = reachRay * (.35 + seeded(ray + 1750) * .65);
          const head = length * (1 - (1 - burst) ** 2), tail = Math.max(0, head - length * .32);
          ctx.globalAlpha = (1 - burst) * (.28 + seeded(ray + 1800) * .48);
          stroke(ctx, [[cx + Math.cos(angle) * tail, cy + Math.sin(angle) * tail * .62], [cx + Math.cos(angle) * head, cy + Math.sin(angle) * head * .62]], ray % 4 ? GOLD : IVORY, 1.5);
        }
      }
    }

    ctx.globalAlpha = flicker;
    glow(ctx, cx, cy, scale * (.09 + energy * .03 + g * .08 + hover * .04) * DISC * 1.6, `${color}50`);
    glow(ctx, cx, cy, scale * .03 * DISC * 1.6, '#ffffffa0');
    star(ctx, cx, cy, scale * (.006 + energy * .006), IVORY, true);
    ctx.restore();
  }

  /** 底部五线谱带：划分阶段小节，音符按真实音高落位，指针掠过如拨动竖琴。 */
  function staff(w: number, h: number, t: number, f: number, g: number, mx: number, my: number, doneNow: boolean): void {
    const voices = [failed ? STORM : doneNow ? GOLD : CYAN];
    // 失败时谱带先被撕扯抖动，随后整体淡出（逐段坠落会在断口拉出竖线）。
    const fade = failed ? clamp(1 - (t - failAt - .35) * 1.6) : 1;
    if (!fade) return;
    const reach = doneNow ? 1 : clamp(shownProgress);
    const eight = eighthPulse(t), beat = beatPulse(t);
    strums = strums.filter(s => t - s.at < 1.6);
    ctx.save(); ctx.globalCompositeOperation = 'screen';

    voices.forEach((color, v) => {
      const alpha = (v ? .34 : .58) * (1 + g * .5) * fade;
      for (const row of [2]) {
        const pts = Array.from({ length: 121 }, (_, i) => staffPoint(i / 120, row, v, voices.length, w, h, t, f, beat, mx, my));
        const cut = Math.round(reach * 120), litPts = pts.slice(0, cut + 1);
        ctx.strokeStyle = color;
        if (cut < 120) {
          ctx.globalAlpha = alpha * .13; ctx.lineWidth = .6;
          ctx.beginPath(); pts.slice(cut).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        }
        if (row === 2 && v === 0) {
          ctx.globalAlpha = alpha * (.18 + beat * .14); ctx.lineWidth = 5 + beat * 4;
          ctx.beginPath(); litPts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        }
        ctx.globalAlpha = alpha * (row === 2 ? .75 + beat * .25 : .26); ctx.lineWidth = row === 2 ? 1.2 + beat * .45 : .62;
        ctx.beginPath(); litPts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      }

      if (!failed) {
        const count = v === 0 ? 34 : 14;
        for (let p = 0; p < count; p++) {
          const seed = p + v * 97, u = ((seeded(seed + 31) + t * (.05 + seeded(seed + 91) * .06)) % 1) * Math.max(.04, reach);
          const age = (t * .7 + seeded(seed + 301)) % 1;
          const [px, py] = staffPoint(u, 2, v, voices.length, w, h, t, f, beat, mx, my);
          const drift = (seeded(seed + 501) - .5) * Math.sin(age * Math.PI) * 14;
          ctx.globalAlpha = alpha * Math.sin(u * Math.PI) * (1 - age) * (.4 + beat * .4);
          star(ctx, px, py + drift, .55 + seeded(seed + 601) * 1.1, p % 6 === 0 ? IVORY : color);
        }
      }
      if (v) return;

      const mCount = measureCount();
      for (let m = 0; m <= mCount; m++) {
        const uBar = m / mCount;
        const [bxTop, byTop] = staffPoint(uBar, .6, 0, voices.length, w, h, t, f, beat, mx, my);
        const [bxBot, byBot] = staffPoint(uBar, 3.4, 0, voices.length, w, h, t, f, beat, mx, my);
        const barLit = reach >= uBar - .005;
        ctx.globalAlpha = (barLit ? .52 : .18) * fade;
        stroke(ctx, [[bxTop, byTop], [bxBot, byBot]], barLit ? IVORY : color, m === 0 || m === mCount ? 1.15 : .8);
      }

      for (const s of strums) {
        const age = t - s.at;
        for (let k = 0; k < 6; k++) {
          const seed = Math.floor(s.at * 100) + k * 19;
          const sx = (s.x + (seeded(seed) - .5) * .08) * w, sy = s.y * h - age * (18 + seeded(seed + 3) * 28) + (seeded(seed + 7) - .5) * 10;
          ctx.globalAlpha = Math.max(0, 1 - age * .9) * .7;
          star(ctx, sx, sy, 1 + seeded(seed + 11), k % 2 ? IVORY : color);
        }
      }

      const heard = past(t).filter(c => c.kind === 'item' || c.kind === 'phase' || c.kind === 'ready');
      let hovered = -1;
      heard.forEach((c, i) => {
        const row = c.kind === 'ready' ? 0 : c.kind === 'phase' ? 2 : pitchRow(c.pitch);
        const [x, y] = staffPoint(Math.min(c.u, reach), row, 0, voices.length, w, h, t, f, beat, mx, my);
        const pop = Math.max(hit(t, c.at, 5), ...echoes.filter(e => e.cue === c).map(e => hit(t, e.at, 5))), dist = pointer.inside ? Math.hypot(x - mx, y - my) : Infinity, near = clamp(1 - dist / 54);
        if (dist < 22) hovered = i;
        ctx.globalAlpha = Math.min(1, .6 + pop * .4 + near * .38) * fade;
        const size = Math.min(14, w * .02) * (1 + pop * .5 + near * .3 + (i % 2 ? eight : 0) * .06);
        const noteCol = c.kind === 'ready' ? GOLD : c.kind === 'phase' ? IVORY : doneNow ? GOLD : color;
        note(ctx, x, y - pop * 10 - near * 4, size, noteCol, Math.sin(i * 1.3) * .12);
        if (pop > .08 || near > .2) glow(ctx, x, y, size * 2.5 * Math.max(pop, near * .7), `${noteCol}50`);
      });
      if (hovered >= 0 && hovered !== lastNoteHover) {
        lastNoteHover = hovered;
        const hc = heard[hovered]!;
        if (hc.pitch > 0) voice(t, 'glass', hc.pitch + 12, .025, .7, (hc.u - .5) * 1.2);
      } else if (hovered < 0) lastNoteHover = -1;

      const [hx, hy] = staffPoint(reach, 2, 0, voices.length, w, h, t, f, beat, mx, my);
      if (reach < 1) { ctx.globalAlpha = .92; star(ctx, hx, hy, 1.5 + beat * 1.5, IVORY, true); glow(ctx, hx, hy, 15 + beat * 11, `${color}48`); }
    });
    ctx.restore();
  }

  /** 当前章节并到标题下方：一行“序号 状态 · 章名”，谱上只留音符。 */
  function chapterLine(w: number, h: number, t: number, x: number, y: number, color: string): void {
    const p = phases[cur];
    if (!p) return;
    const enter = smooth(p.startAt, p.startAt + .5, t), hovered = hoverChapter === cur;
    const flash = chapterFlash[cur] === undefined ? 0 : hit(t, chapterFlash[cur]!, 3);
    const status = failed ? i18n.t('中断') : p.done ? i18n.t('完成') : p.total ? `${p.completed ?? 0} / ${p.total}` : i18n.t('进行中');
    const size = Math.min(15, h * .026), lineY = y + size * .9, span = Math.min(180, w * .3);
    ctx.save();
    ctx.globalAlpha = Math.min(1, .82 + (hovered ? .18 : 0) + flash * .2) * enter;
    if (hovered || flash > .02) glow(ctx, x, y, 80, `${color}${hovered ? '26' : '1a'}`);
    label(ctx, `${ROMAN[cur] ?? cur + 1}  ${status}  ·  ${p.name}`, x, y - (1 - enter) * 6, size, w * .74, failed ? STORM : IVORY, SERIF, 600);
    if (!failed && !p.done) {
      // 章内进度：计数阶段按完成数填满；不计数阶段只有一道来回流动的光，不假装知道进度。
      const x0 = x - span / 2;
      ctx.globalAlpha = .22 * enter; stroke(ctx, [[x0, lineY], [x0 + span, lineY]], color, 1);
      ctx.globalAlpha = .95 * enter;
      if (p.total) stroke(ctx, [[x0, lineY], [x0 + span * clamp((p.completed ?? 0) / p.total), lineY]], IVORY, 1.4);
      else { const k = (Math.sin(t * 2.4) + 1) / 2; stroke(ctx, [[x0 + span * k * .7, lineY], [x0 + span * (k * .7 + .3), lineY]], IVORY, 1.4); }
    }
    ctx.restore();
    chapterBoxes.push({ m: cur, x: x - w * .2, y: y - size, w: w * .4, h: size * 2.2 });
  }

  /** 悬停章节时的小卡片：状态、计数、用时，以及“点击重放”。 */
  function chapterCard(w: number, h: number, t: number): void {
    const p = phases[hoverChapter];
    if (!p) return;
    const used = i18n.t('用时 {n}s').replace('{n}', ((p.doneAt ?? t) - p.startAt).toFixed(1));
    const state = p.done ? i18n.t('已完成') : failed && hoverChapter === cur ? i18n.t('已中断') : i18n.t('进行中');
    const count = p.total ? `${i18n.t('{n} / {total} 份资源').replace('{n}', String(p.completed ?? 0)).replace('{total}', String(p.total))} · ` : '';
    const lines = [`${ROMAN[hoverChapter] ?? hoverChapter + 1} · ${p.name}`, `${state} · ${count}${used}`, i18n.t('点击重放这一章')];
    const size = Math.min(12, h * .022), pad = 10, cw = Math.min(300, w * .5), ch = pad * 2 + size * 1.6 * lines.length;
    const x = Math.min(w - cw - 12, Math.max(12, pointer.tx * w + 14)), y = Math.max(12, pointer.ty * h - ch - 16);
    ctx.save();
    ctx.globalAlpha = .9; ctx.fillStyle = '#05090c'; ctx.fillRect(x, y, cw, ch);
    ctx.globalAlpha = .55; ctx.strokeStyle = failed ? STORM : CYAN; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
    lines.forEach((text, i) => {
      ctx.globalAlpha = i === 2 ? .6 : 1;
      label(ctx, text, x + pad, y + pad + size * (.8 + i * 1.6), size, cw - pad * 2, i === 0 ? IVORY : i === 1 ? '#b7cbc6' : CYAN, i === 0 ? SERIF : MONO, i === 0 ? 600 : 400, 'left');
    });
    ctx.restore();
  }

  /** 按原来的音高、以八分音为间隔把这一章的资源音再奏一遍，谱上对应的音符同步跳起。 */
  function replayChapter(m: number): void {
    const now = clock(), start = Math.ceil((now + .02) / SIXTEENTH) * SIXTEENTH;
    const notes = cues.filter(c => c.kind === 'item' && c.phaseIndex === m && c.at <= now);
    chapterFlash[m] = start;
    if (!notes.length) {
      chordAt(start).notes.forEach((n, i) => voice(start + i * .03, 'piano', n, .07, 1.2, (i - 1.5) * .28));
      return;
    }
    notes.forEach((c, i) => {
      const at = start + i * EIGHTH;
      voice(at, 'mallet', c.pitch, .13, .8, (c.u - .5) * 1.1);
      voice(at, 'glass', c.pitch + 12, .02, 1, (c.u - .5) * 1.1);
      echoes.push({ cue: c, at });
    });
  }

  function lensStreak(w: number, h: number, g: number, readyHit: number, struck: number): void {
    const power = Math.max(readyHit * .95, struck * .28, g * .18);
    if (power < .015) return;
    const y = h * CORE_Y, coreH = h * (.0025 + power * .005);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.save(); ctx.translate(w * .5, y); ctx.scale(1, .045);
    ctx.globalAlpha = power * .75; glow(ctx, 0, 0, w * (.42 + power * .35), g > .2 ? '#ffd98ad0' : '#8be6e2b0');
    ctx.restore();
    const band = ctx.createLinearGradient(0, 0, w, 0);
    band.addColorStop(0, '#fff6dd00'); band.addColorStop(.5, '#ffffff'); band.addColorStop(1, '#fff6dd00');
    ctx.globalAlpha = power * .85; ctx.fillStyle = band; ctx.fillRect(0, y - coreH / 2, w, coreH);
    ctx.restore();
  }

  function copy(w: number, h: number, t: number, f: number, doneNow: boolean, beat: number): void {
    const color = failed ? STORM : doneNow ? GOLD : CYAN, ox = (pointer.x - .5) * -10, oy = (pointer.y - .5) * -6;
    const enter = smooth(shownAt, shownAt + .6, t), titleSize = Math.min(h * .11, w * .078);
    const tx = w * .5 + ox, ty = h * .125 + oy;
    ctx.save(); ctx.globalAlpha = enter * (1 - f * .4);
    glow(ctx, tx, ty, titleSize * (1.8 + beat * .35), failed ? '#ff3d7f38' : doneNow ? '#f8d79140' : '#8be6e230');
    label(ctx, title, tx, ty, titleSize, w * .8, IVORY, SANS, 900);

    const value = doneNow ? 100 : Math.min(99, Math.floor(shownProgress * 100));
    const mCount = measureCount(), finished = doneNow ? mCount : phases.filter(p => p.done).length;
    const sub = failed ? `${kicker} · CONNECTION CUT` : doneNow ? `${kicker} · 100% · COMPLETE` : `${kicker} · ${value}% · ${finished} / ${mCount} PHASES`;
    label(ctx, sub, w * .5 + ox * .6, h * .2 + oy * .6, Math.min(11, h * .022), w * .74, color, MONO, 600);
    if (!doneNow) chapterLine(w, h, t, w * .5 + ox * .6, h * .2 + oy * .6 + Math.min(26, h * .048), color);


    if (doneNow) label(ctx, i18n.t('就绪，进入场景'), w * .5, h * .955, Math.min(15, h * .03), w * .9, GOLD, SERIF);
    else if (!failed) {
      ctx.globalAlpha = enter * .38;
      label(ctx, i18n.t('移动指针牵动星核与谱带 · 敲键盘奏响音符 · 点章节重放旋律'), w * .5, h * .962, Math.min(10.5, h * .02), w * .9, '#8caaa7', MONO, 400);
    }
    ctx.restore();
  }

  function storm(w: number, h: number, t: number, f: number): void {
    if (!f) return;
    const age = t - failAt, tick = Math.floor(t * 22), burst = hit(t, failAt, 3.5);
    ctx.save();
    ctx.strokeStyle = STORM_VIOLET; ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = (seeded(i + 5) * 1.3 - .15) * w + ((t * 1.1 + seeded(i)) % 1) * h * .25;
      const y0 = ((t * 1.6 + seeded(i + 9)) % 1) * h * 1.2 - h * .1;
      ctx.globalAlpha = f * (.15 + seeded(i + 300) * .35);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - h * .03, y0 + h * .09); ctx.stroke();
    }
    for (let i = 0; i < 3 + Math.floor(burst * 5); i++) {
      const y = seeded(tick * 37 + i * 3) * h, band = 2 + seeded(tick * 41 + i) * h * .025;
      ctx.globalAlpha = f * (.1 + burst * .28) * seeded(tick + i * 5);
      ctx.fillStyle = [STORM, STORM_VIOLET, '#000000'][i % 3]!;
      ctx.fillRect(0, y, w, band);
    }
    if (age >= 0 && age < .55) {
      const power = Math.exp(-age * 6.5) * (seeded(Math.floor(t * 30) + 7) > .22 ? 1 : .38);
      const from: Point = [w * .52, -10], to: Point = [w * .5, h * CORE_Y];
      const pts: Point[] = Array.from({ length: 15 }, (_, k) => [mix(from[0], to[0], k / 14) + (k === 0 || k === 14 ? 0 : (seeded(97 + k * 3) - .5) * w * .085), mix(from[1], to[1], k / 14)]);
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = power * .25; stroke(ctx, pts, STORM_VIOLET, 36 * power + 4);
      ctx.globalAlpha = power * .9; stroke(ctx, pts, '#d8c8ff', 10 * power + 1);
      ctx.globalAlpha = power; stroke(ctx, pts, '#ffffff', 2.8);
      ctx.restore();
      glow(ctx, to[0], to[1], Math.min(w, h) * .38 * power, '#ff3d7f66');
    }
    ctx.globalAlpha = f;
    const tear = .35 + .65 * hit(t, failAt, 2.5) + (seeded(Math.floor(t * 12)) > .8 ? .15 : 0);
    tornLabel(ctx, 'DISCONNECTED', w * .5, h * CORE_Y, Math.min(h * .14, w * .085), w * .86, IVORY, tear, tick, SANS, 900);
    label(ctx, i18n.t('场景加载被切断，点“重新加载”再来一次'), w * .5, h * (CORE_Y + .1), Math.min(h * .035, 16), w * .8, '#ffd0dc', SERIF);
    ctx.restore();
  }

  function flash(w: number, h: number, t: number): void {
    let a = 0, color = IVORY;
    for (const c of past(t)) {
      const k = c.kind === 'phase' ? hit(t, c.at, 12) * .05 : c.kind === 'fail' ? hit(t, c.at, 6) * .85 : c.kind === 'ready' ? hit(t, c.at, 3) * .75 : 0;
      if (k > a) { a = k; color = c.kind === 'fail' ? '#efe6ff' : c.kind === 'ready' ? '#fff2cf' : IVORY; }
    }
    if (a < .005) return;
    ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  }

  function cursor(w: number, h: number, t: number, beat: number, f: number, g: number): void {
    if (!pointer.inside) return;
    const x = pointer.tx * w, y = pointer.ty * h, col = f > .5 ? STORM : g > .5 ? GOLD : CYAN;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .35; glow(ctx, x, y, 18 + beat * 8, `${col}55`);
    ctx.globalAlpha = .9; star(ctx, x, y, 1.4 + beat, IVORY, true);
    ctx.globalAlpha = .25 + beat * .3; ctx.strokeStyle = col; ctx.lineWidth = .75;
    ctx.beginPath(); ctx.arc(x, y, (hoverChapter >= 0 ? 15 : 9) + beat * 4, 0, TAU); ctx.stroke();
    // 蓄力：外圈随力量收紧变亮；固定 6 颗光点从星核被吸出、越靠近光标越快地飞进来；松手放出一道扩散环。
    if (force > .01) {
      const ring = 46 - force * 26;
      ctx.globalAlpha = force * .7; ctx.lineWidth = .8 + force * 1.2;
      ctx.beginPath(); ctx.arc(x, y, ring, 0, TAU); ctx.stroke();
      const sx = w * .5 + (pointer.x - .5) * w * .022 + tug.x, sy = h * CORE_Y + (pointer.y - .5) * h * .015 + tug.y;
      const len = Math.max(1, Math.hypot(x - sx, y - sy)), nx = -(y - sy) / len, ny = (x - sx) / len;
      for (let i = 0; i < 6; i++) {
        const run = (t * (.35 + force * .9) + i / 6) % 1, k = run * run, side = Math.sin(run * Math.PI) * (i % 2 ? 1 : -1) * (8 + i * 3);
        ctx.globalAlpha = force * Math.min(1, run * 4) * (1 - k * .5);
        star(ctx, mix(sx, x, k) + nx * side, mix(sy, y, k) + ny * side, .8 + force, IVORY);
      }
    }
    const burst = hit(t, releaseAt, 3);
    if (burst > .02) {
      ctx.globalAlpha = burst * releaseForce; ctx.strokeStyle = IVORY; ctx.lineWidth = 1 + burst * 2;
      ctx.beginPath(); ctx.arc(x, y, 20 + (1 - burst) * 70 * (.5 + releaseForce), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 指针与音频解锁 ---------- */
  const place = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = clamp((e.clientX - r.left) / r.width);
    pointer.ty = clamp((e.clientY - r.top) / r.height);
    pointer.inside = true;
  };
  let strummed = 0, lastZone = -1;
  const onMove = (e: PointerEvent): void => {
    const before = pointer.ty, was = pointer.inside;
    place(e);
    const t = clock();
    const crossed = was && (before - STAFF_Y) * (pointer.ty - STAFF_Y) <= 0 && Math.abs(pointer.ty - before) > .003;
    const inBand = Math.abs(pointer.ty - STAFF_Y) < .038 && pointer.tx > .06 && pointer.tx < .94;
    const zone = Math.min(PENTATONIC.length - 1, Math.floor(pointer.tx * PENTATONIC.length));
    const swept = was && inBand && zone !== lastZone && t - strummed > .085;
    if ((crossed && t - strummed > .065) || swept) {
      strummed = t; lastZone = zone;
      strums.push({ x: pointer.tx, y: pointer.ty, at: t, strength: crossed ? 1 : .65 });
      const pitch = PENTATONIC[zone]!, pan = pointer.tx * 1.6 - .8;
      voice(t, 'glass', pitch, .035, 1, pan);
      voice(t, 'mallet', pitch + 12, .05, .4, pan);
    }
    if (!inBand) lastZone = -1;
  };
  const release = (): void => {
    if (pressing && force > .1) { releaseAt = clock(); releaseForce = force; }
    pressing = false;
  };
  const onLeave = (): void => { pointer.inside = false; lastZone = -1; release(); };
  const onDown = (e: PointerEvent): void => {
    place(e); unlock();
    if (hoverChapter >= 0) { replayChapter(hoverChapter); return; }
    pressing = true;
  };
  /** 敲键盘也能演奏：E、G、A、C 是序章的四音，其他字母落在五声音阶上，Shift 升八度。 */
  const KEYS: Record<string, number> = { e: 64, g: 67, a: 69, c: 72 };
  const onKey = (e: KeyboardEvent): void => {
    unlock();
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.length !== 1) return;
    if ((e.target as HTMLElement | null)?.closest('input, select, textarea, button')) return;
    const key = e.key.toLowerCase();
    if (!/[a-z0-9]/.test(key)) return;
    const pitch = (KEYS[key] ?? PENTATONIC[key.charCodeAt(0) % PENTATONIC.length]!) + (e.shiftKey ? 12 : 0);
    cue('tap', SIXTEENTH, pitch, { x: .5 + ((pitch % 12) / 12 - .5) * .5, y: CORE_Y });
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function unlock(): void {
    if (!output) {
      // 在手势内同步创建上下文，浏览器才允许它直接进入 running。
      const context = new AudioContext();
      const master = context.createGain(); master.gain.value = soundOn ? .48 : 0;
      const comp = context.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      master.connect(comp).connect(context.destination);
      output = { context, master };
      void import('../intro/intro-score.ts').then(({ createPreludeInstruments }) => {
        instruments = createPreludeInstruments(context);
        scheduledTo = clock();
      }, (error: unknown) => {
        // 声音只是加载画面的点缀：分块下载失败就关掉声音并记录，不能让场景加载跟着失败。
        console.error('加载画面音色下载失败，已关闭声音', error);
        setSound(false); soundButton.disabled = true;
      });
    }
    if (output.context.state === 'suspended') {
      void output.context.resume().then(() => { scheduledTo = clock(); });
    }
  }

  function setSound(on: boolean): void {
    soundOn = on;
    if (on) unlock();
    // 读屏等辅助技术可能只派发 click 而没有先触发解锁手势，此时上下文还没建。
    if (output) output.master.gain.setTargetAtTime(on ? .48 : 0, output.context.currentTime, .05);
    syncSound();
  }
  const syncSound = (): void => {
    soundButton.textContent = soundOn ? i18n.t('♪ 声音 开') : i18n.t('♪ 声音 关');
    soundButton.setAttribute('aria-pressed', String(soundOn));
  };
  // 加载层跨场景保留，按钮文案随语言切换；阶段与标题由下一次 show 重新给出。
  const syncCopy = (): void => { syncSound(); retryButton.textContent = i18n.t('重新加载'); };
  soundButton.addEventListener('click', () => setSound(!soundOn));
  retryButton.addEventListener('click', retry);
  syncCopy();
  const unsubscribeLanguage = i18n.onLanguageChange(syncCopy);

  /** 把尚未完成的阶段记为完成并奏阶段和弦；m 为总小节数，最后一节让给就绪音。 */
  function finishPhases(m: number): void {
    phases.forEach((p, idx) => {
      if (p.done) return;
      p.done = true; p.doneAt = clock();
      if (idx < m - 1) {
        const prog = (idx + 1) / m;
        cue('phase', BEAT, 0, { phaseIndex: idx, u: prog, progress: prog, lit: Math.round(prog * NODES) });
      }
    });
  }

  let leaveTimer = 0;
  const stop = (): void => {
    cancelAnimationFrame(frame);
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', onKey);
    // 隐藏期间不占显存与音频线程：清空画布缓冲（下次绘制按尺寸重建），挂起上下文（下次手势恢复）。
    canvas.width = 0; canvas.height = 0;
    void output?.context.suspend();
  };

  return {
    show(name: string, kickerText: string, expected: number): void {
      clearTimeout(leaveTimer); root.classList.remove('is-leaving'); root.hidden = false;
      title = name; kicker = kickerText; expectedPhases = expected;
      phases = []; cur = -1; failed = false; readyRequested = false; readyCue = null;
      items = 0; cues = []; lit = 0; litAt.fill(-1); ticks = 0; shownProgress = 0; shownAt = clock();
      echoes = []; chapterFlash.length = 0; retryButton.hidden = true;
      status.textContent = i18n.t('正在加载{name}').replace('{name}', name);
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', onKey);
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
    },
    progress(phase: string, completed?: number, total?: number): void {
      let index = phases.findIndex(p => p.name === phase);
      // 并行资源可能在后一阶段开始后才回报；已收尾的小节不再改写，指示不往回跳。
      if (failed || phases[index]?.done) return;
      status.textContent = total === undefined ? phase : `${phase} · ${completed} / ${total}`;
      const m = Math.max(expectedPhases, phases.length + (index < 0 ? 1 : 0));
      if (index < 0) {
        finishPhases(m);
        index = phases.push({ name: phase, pulses: 0, done: false, startAt: clock() }) - 1;
      }
      const p = phases[index]!, before = p.completed ?? 0;
      p.total = total; cur = index;
      if (total && total > 0) {
        for (let k = before + 1; k <= (completed ?? 0); k++) {
          p.completed = k;
          const frac = k / total, prog = (index + frac * .92) / m, u = (index + .08 + ((k - .5) / total) * .84) / m;
          cue('item', EIGHTH, nextMotifPitch(index), { phaseIndex: index, u, progress: prog, lit: Math.max(1, Math.round(prog * NODES)) });
          items++;
        }
      }
      p.completed = completed;
    },
    error(error: unknown): void {
      cues = cues.filter(c => c.at <= clock());
      readyRequested = false; readyCue = null; failed = true;
      failAt = cue('fail', SIXTEENTH, 0).at;
      retryButton.hidden = false;
      status.textContent = i18n.t('加载失败：{error}').replace('{error}', error instanceof Error ? error.message : String(error));
    },
    /** 奏完就绪音、星核迸发后再淡出；淡出结束才停帧并解绑全局监听。开始淡出时兑现，开场动画可以等到画面露出再播。 */
    hide(): Promise<void> {
      if (failed || readyRequested) return Promise.resolve();
      finishPhases(measureCount());
      readyRequested = true;
      readyCue = cue('ready', BEAT, 84, { phaseIndex: Math.max(0, phases.length - 1), u: 1, progress: 1, lit: NODES });
      status.textContent = i18n.t('加载完成');
      const delay = (readyCue.at + .35 - clock()) * 1000;
      return new Promise(resolve => {
        leaveTimer = window.setTimeout(() => {
          root.classList.add('is-leaving');
          resolve();
          leaveTimer = window.setTimeout(() => { root.hidden = true; stop(); }, 600);
        }, delay);
      });
    },
    dispose(): void {
      clearTimeout(leaveTimer); stop(); root.remove(); unsubscribeLanguage();
      void output?.context.close();
    },
  };
}
