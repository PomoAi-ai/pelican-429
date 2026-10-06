import { INTRO_COPY, type IntroLanguage } from '../config/intro-language.ts';
import {
  INTRO_DURATION, INTRO_GOAL_AT, INTRO_HANDS_OFF_AT, INTRO_PELICAN_AT, INTRO_SCENES, INTRO_SCORE_RATE,
  introSceneAt, type IntroSceneId,
} from '../config/intro.ts';
import { drawEditionIntro } from '../render/intro-editions.ts';
import { introEdition, editionStoryTime, editionPlaybackTime, type IntroEdition } from '../config/intro-editions.ts';
import { showIntroGallery } from './intro-gallery.ts';
import { finaleChapterAt } from '../config/intro-finale.ts';
import type { IntroImages } from '../render/intro-story.ts';
import { IntroAudio } from './intro-audio.ts';
import { getLanguage, setLanguage, onLanguageChange } from '../ui/language.ts';

type PlayState = 'ready' | 'starting' | 'playing' | 'paused' | 'disposed';

const IMAGE_URLS: Record<keyof IntroImages, string> = {
  night: new URL('../../assets/chapter-one/01-grassy-coding-concept-v3-mac-studio.png', import.meta.url).href,
  glitch: new URL('../../assets/chapter-one/02-neural-breach-game-v3.png', import.meta.url).href,
  transformation: new URL('../../assets/chapter-one/03-feather-transformation-v2.png', import.meta.url).href,
  dream: new URL('../../assets/chapter-one/03-neural-rift-game-v3.png', import.meta.url).href,
  world: new URL('../../assets/chapter-one/04-lost-frontier-game-v2.png', import.meta.url).href,
};

const ACTS = ['', '第一幕', '第二幕', '第三幕', '第四幕'] as const;

const CAPTIONS: Record<Exclude<IntroSceneId, 'prelude'>, string> = {
  night: '窗外雨雪交加，Grassy 在 Mac Studio 前写代码。',
  glitch: '金色的 gpt-6-astra 被悄悄改路由成 gpt-5.6-luna，又被降智成 gpt-4o-mini；空一拍，「封号」重重砸下，Grassy 天旋地转。',
  dream: 'Grassy 彻底变成鹈鹕，骑着车随音乐起伏；车轮踩着节拍聚拢、悬停，又一次次被甩飞。',
  world: '鹈鹕坠入游戏世界，重重落地。',
};

const formatTime = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const sceneIndexAt = (seconds: number): number => INTRO_SCENES.findLastIndex((scene) => seconds >= scene.at);

function createStage(edition: IntroEdition): HTMLElement {
  const total = editionPlaybackTime(INTRO_DURATION, edition);
  const stage = document.createElement('section');
  stage.className = 'intro-stage';
  stage.dataset.edition = edition.id;
  stage.style.setProperty('--edition-bg', edition.background);
  stage.style.setProperty('--edition-fg', edition.foreground);
  stage.style.setProperty('--edition-accent', edition.accent);
  stage.setAttribute('aria-label', 'AI 的乐章 · 第一章开场');
  stage.innerHTML = `
    <canvas class="intro-canvas" role="img" aria-label="从代码与多模型协奏到雨雪夜编程、屏幕失控、鹈鹕梦境与坠入游戏世界的动画"></canvas>
    <div class="intro-ready">
      <a class="intro-choose" href="./?mode=intro">← 历史版本</a>
      <p class="intro-kicker">PELICAN 429 / OPENING ${edition.number}</p>
      <p class="intro-edition-genre">${edition.name}</p>
      <h1>${edition.title}</h1>
      <p class="intro-invitation">${edition.subtitle}</p>
      <button type="button" class="intro-begin">开始播放 <span aria-hidden="true">↗</span></button>
      <p class="intro-listening">${edition.duration} 秒序奏 · ${formatTime(total)} 完整开场 · 建议佩戴耳机</p>
    </div>
    ${edition.id === 'finale' ? `
    <div class="intro-chapter intro-mission-hud" hidden>
      <div class="intro-mission-objective">
        <p class="intro-kicker"><span>01 /</span> <span class="intro-mission-status"></span></p>
        <h2></h2>
        <p class="intro-human"></p>
      </div>
      <a class="intro-mission-enter" href="./?mode=game"></a>
      <p class="intro-rights"></p>
    </div>` : `
    <div class="intro-chapter" hidden>
      <p class="intro-kicker">CHAPTER 01</p>
      <h2>FIGHT THE ROGUE AI</h2>
      <p class="intro-human">Become human again.</p>
      <a href="./?mode=game">进入游戏 <span aria-hidden="true">→</span></a>
    </div>`}
    <div class="intro-languages" role="group" aria-label="语言 / Language"><button type="button" data-language="zh" aria-pressed="true">中文</button><button type="button" data-language="en" aria-pressed="false">English</button></div>
    <div class="intro-controls">
      <div class="intro-progress-row">
        <label class="intro-sr-only" for="intro-seek">播放进度</label>
        <input id="intro-seek" type="range" min="0" max="${total}" step="0.1" value="0" />
      </div>
      <div class="intro-control-row">
        <a class="intro-back" href="./?mode=intro" aria-label="查看历史版本">← <span>历史版本</span></a>
        <span class="intro-divider" aria-hidden="true"></span>
        <button type="button" class="intro-toggle">播放</button>
        <button type="button" class="intro-replay">重播</button>
        <button type="button" class="intro-mute" aria-pressed="false">声音：开</button>
        <nav class="intro-scenes" aria-label="场景跳转">
          ${INTRO_SCENES.map((scene, index) => `<button type="button" data-at="${editionPlaybackTime(scene.at, edition)}">${index ? `${index} ` : ''}${scene.label}</button>`).join('')}
        </nav>
        <span class="intro-phase" aria-live="polite">等待开始</span>
        <output class="intro-time" aria-label="播放时间">00:00 / ${formatTime(total)}</output>
        <button type="button" class="intro-skip">跳过 →</button>
      </div>
    </div>
    <button type="button" class="intro-resume" hidden><span aria-hidden="true">▶</span> <span>继续</span></button>
    <p class="intro-sr-only intro-caption" aria-live="polite"></p>`;
  return stage;
}

function phaseAt(seconds: number, edition: IntroEdition, language: IntroLanguage): string {
  if (language === 'en') {
    if (seconds >= INTRO_GOAL_AT) return 'The mission';
    if (seconds >= introSceneAt('dream') && seconds < INTRO_PELICAN_AT) return 'Act III · Transformation';
    if (seconds < introSceneAt('night')) return 'Afterglow';
    const index = sceneIndexAt(seconds);
    return `Act ${index} · ${INTRO_COPY.en.scenes[index]!}`;
  }
  const time = seconds * INTRO_SCORE_RATE;
  if (time < 10) return `${edition.name} · 展开`;
  if (time < 24) return `${edition.name} · 渐强`;
  if (time < INTRO_HANDS_OFF_AT) return '高潮 · GPT-6 ASTRA';
  if (time < 32) return '进入 Grassy 的房间';
  if (seconds >= INTRO_GOAL_AT) return '目标';
  if (seconds >= introSceneAt('dream') && seconds < INTRO_PELICAN_AT) return '第三幕 · 羽化变身';
  const index = sceneIndexAt(seconds);
  return `${ACTS[index]!} · ${INTRO_SCENES[index]!.label}`;
}

function captionAt(seconds: number, edition: IntroEdition, language: IntroLanguage): string {
  if (language === 'en') {
    if (seconds >= INTRO_GOAL_AT) return `Fight the rogue AI and become human again.${edition.id === 'finale' ? ` ${INTRO_COPY.en.rights}` : ''}`;
    if (seconds >= introSceneAt('dream') && seconds < INTRO_PELICAN_AT) return 'Over four beats, white feathers sweep across Grassy until the transformation into a pelican is complete.';
    const captions = {
      prelude: 'A beam of light becomes code, a score, a room, ocean waves and stars.',
      night: 'Rain and snow fall outside as Grassy writes code at a Mac Studio.',
      glitch: 'Golden gpt-6-astra is quietly rerouted to gpt-5.6-luna, then downgraded to gpt-4o-mini. After a silent beat, the account is banned and the room spins.',
      dream: 'Grassy is now a pelican, cycling with the music. The wheels gather, hover and fly apart on the beat.',
      world: 'The pelican falls into the game world and lands with a thud.',
    };
    return captions[INTRO_SCENES[sceneIndexAt(seconds)]!.id];
  }
  if (seconds >= INTRO_GOAL_AT) return `目标：对抗失控的 AI，重新变回人类。${edition.id === 'finale' ? INTRO_COPY.zh.rights : ''}`;
  if (seconds >= introSceneAt('dream') && seconds < INTRO_PELICAN_AT) {
    return '四拍羽化：白色羽毛卷过身体，人的形态逐渐消失，Grassy 完全变成鹈鹕。';
  }
  const scene = INTRO_SCENES[sceneIndexAt(seconds)]!;
  if (scene.id !== 'prelude') return CAPTIONS[scene.id];
  if (seconds * INTRO_SCORE_RATE >= INTRO_HANDS_OFF_AT) return `${edition.name}收束，进入雨雪夜的房间。`;
  if (seconds * INTRO_SCORE_RATE >= 24) return '金色 GPT-6 ASTRA 在乐章高潮中出现。';
  return edition.description;
}

class IntroPlayer {
  private readonly stage: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly ready: HTMLElement;
  private readonly chapter: HTMLElement;
  private readonly begin: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly resume: HTMLButtonElement;
  private readonly replay: HTMLButtonElement;
  private readonly mute: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly sceneButtons: HTMLButtonElement[];
  private readonly seek: HTMLInputElement;
  private readonly phase: HTMLElement;
  private readonly timeOutput: HTMLOutputElement;
  private readonly caption: HTMLElement;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private audio: IntroAudio | null = null;
  private pending: Promise<void> | null = null;
  private state: PlayState = 'ready';
  private time = 0;
  private muted = false;
  /** 播放中拖动进度条只预览画面；松手后从新位置接着播放。 */
  private resumeAfterScrub = false;
  private language: IntroLanguage = getLanguage();
  private width = 0;
  private height = 0;
  private raf = 0;
  private lastInteraction = performance.now();
  private currentScene = -1;
  private readonly images: IntroImages;
  private readonly edition: IntroEdition;
  private readonly onError: (error: unknown) => void;

  constructor(images: IntroImages, onError: (error: unknown) => void, edition: IntroEdition) {
    this.edition = edition;
    this.stage = createStage(edition);
    this.canvas = this.stage.querySelector('canvas')!;
    this.ready = this.stage.querySelector<HTMLElement>('.intro-ready')!;
    this.chapter = this.stage.querySelector<HTMLElement>('.intro-chapter')!;
    this.begin = this.stage.querySelector<HTMLButtonElement>('.intro-begin')!;
    this.toggle = this.stage.querySelector<HTMLButtonElement>('.intro-toggle')!;
    this.resume = this.stage.querySelector<HTMLButtonElement>('.intro-resume')!;
    this.replay = this.stage.querySelector<HTMLButtonElement>('.intro-replay')!;
    this.mute = this.stage.querySelector<HTMLButtonElement>('.intro-mute')!;
    this.skip = this.stage.querySelector<HTMLButtonElement>('.intro-skip')!;
    this.sceneButtons = [...this.stage.querySelectorAll<HTMLButtonElement>('.intro-scenes button')];
    this.seek = this.stage.querySelector<HTMLInputElement>('#intro-seek')!;
    this.phase = this.stage.querySelector<HTMLElement>('.intro-phase')!;
    this.timeOutput = this.stage.querySelector<HTMLOutputElement>('.intro-time')!;
    this.caption = this.stage.querySelector<HTMLElement>('.intro-caption')!;

    this.images = images;
    this.onError = onError;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('序章动画无法创建 Canvas 2D 绘图环境。');
    this.ctx = ctx;
    document.getElementById('app')!.append(this.stage);
    const options = { signal: this.events.signal };
    this.begin.addEventListener('click', () => this.requestPlay(0), options);
    this.toggle.addEventListener('click', () => this.togglePlayback(), options);
    this.resume.addEventListener('click', () => this.requestPlay(this.time), options);
    this.replay.addEventListener('click', () => this.requestPlay(0), options);
    this.skip.addEventListener('click', () => this.requestPlay(editionPlaybackTime(INTRO_GOAL_AT, this.edition)), options);
    this.sceneButtons.forEach((button, index) => {
      button.addEventListener('click', () => this.requestPlay(editionPlaybackTime(INTRO_SCENES[index]!.at, this.edition)), options);
    });
    this.stage.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
      button.addEventListener('click', () => {
        setLanguage(button.dataset.language as IntroLanguage);
        this.wakeControls();
      }, options);
    });
    const unsubscribeLanguage = onLanguageChange((language) => {
      this.language = language;
      this.syncLanguage();
      this.syncControls();
      this.updateProgress();
    });
    this.events.signal.addEventListener('abort', unsubscribeLanguage, { once: true });
    this.syncLanguage();
    this.mute.addEventListener('click', () => this.toggleMute(), options);
    this.seek.addEventListener('input', () => this.scrub(), options);
    this.seek.addEventListener('change', () => this.endScrub(), options);
    this.stage.addEventListener('pointermove', () => this.wakeControls(), options);
    this.stage.addEventListener('pointerdown', () => this.wakeControls(), options);
    this.stage.addEventListener('focusin', () => this.wakeControls(), options);
    window.addEventListener('keydown', (event) => this.keyDown(event), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    }, options);
    window.addEventListener('pagehide', () => { void this.dispose().catch(this.onError); }, options);
    // bfcache 恢复时旧音频已释放，重新启动页面以恢复可交互的序章。
    window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.resize();
    this.syncControls();
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private wakeControls(): void {
    this.lastInteraction = performance.now();
    this.stage.classList.remove('intro-controls-idle');
  }

  private resize(): void {
    this.width = this.stage.clientWidth;
    this.height = this.stage.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private requestPlay(time: number): void {
    if (this.state === 'starting' || this.state === 'disposed') return;
    this.pending = this.play(time);
    void this.pending.catch((error: unknown) => this.fail(error));
  }

  private async play(time: number): Promise<void> {
    // 拖回原值时浏览器可能不发 change，续播标记在这里一并清掉，免得之后暂停状态下拖动意外续播。
    this.resumeAfterScrub = false;
    this.state = 'starting';
    this.time = time;
    this.syncControls();
    this.audio ??= new IntroAudio(this.edition, (error) => this.fail(error));
    this.audio.setMuted(this.muted);
    await this.audio.start(time);
    // 音频恢复可能等待用户手势；页面离开期间完成时不能重新启动画面。
    if (this.events.signal.aborted) return;
    this.state = 'playing';
    if (document.hidden) this.pause();
    this.wakeControls();
    this.syncControls();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.audio!.pause();
    this.time = this.audio!.getTime();
    this.state = 'paused';
    this.syncControls();
  }

  private togglePlayback(): void {
    if (this.state === 'playing') this.pause();
    else this.requestPlay(this.time);
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.audio?.setMuted(this.muted);
    const copy = INTRO_COPY[this.language];
    this.mute.textContent = this.muted ? copy.soundOff : copy.soundOn;
    this.mute.setAttribute('aria-pressed', String(this.muted));
  }

  private scrub(): void {
    if (this.state === 'playing') this.resumeAfterScrub = true;
    this.pause();
    this.time = Number(this.seek.value);
    this.state = 'paused';
    this.wakeControls();
    this.syncControls();
  }

  private endScrub(): void {
    if (!this.resumeAfterScrub) return;
    this.resumeAfterScrub = false;
    this.requestPlay(this.time);
  }

  private keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.togglePlayback();
      this.wakeControls();
    } else if (event.code === 'KeyM') this.toggleMute();
  }

  private syncLanguage(): void {
    const copy = INTRO_COPY[this.language];
    this.stage.lang = this.language === 'zh' ? 'zh-CN' : 'en';
    this.stage.setAttribute('aria-label', copy.stage);
    this.canvas.setAttribute('aria-label', copy.canvas);
    const set = (selector: string, value: string): void => { this.stage.querySelector<HTMLElement>(selector)!.textContent = value; };
    set('.intro-choose', `← ${copy.directory}`);
    set('.intro-edition-genre', this.edition.id === 'finale' ? copy.genre : this.language === 'zh' ? this.edition.name : this.edition.title);
    document.title = `${this.edition.id === 'finale' ? copy.genre : this.language === 'zh' ? this.edition.name : this.edition.title} · ${this.language === 'zh' ? '鹈鹕 429' : 'PELICAN 429'}`;
    set('.intro-ready h1', this.edition.id === 'finale' ? copy.title : this.language === 'zh' ? this.edition.name : this.edition.title);
    set('.intro-invitation', this.edition.id === 'finale' ? copy.invitation : this.language === 'zh' ? this.edition.description : this.edition.subtitle);
    set('.intro-listening', copy.listening(this.edition.duration, formatTime(editionPlaybackTime(INTRO_DURATION, this.edition))));
    set('.intro-back span', copy.directory);
    this.stage.querySelector('.intro-back')!.setAttribute('aria-label', copy.back);
    set('label[for="intro-seek"]', copy.seek);
    this.timeOutput.setAttribute('aria-label', copy.time);
    this.stage.querySelector('.intro-scenes')!.setAttribute('aria-label', copy.scenesLabel);
    this.sceneButtons.forEach((button, index) => { button.textContent = `${index ? `${index} ` : ''}${copy.scenes[index]!}`; });
    this.replay.textContent = copy.replay;
    this.skip.textContent = copy.skip;
    this.mute.textContent = this.muted ? copy.soundOff : copy.soundOn;
    if (this.edition.id === 'finale') {
      set('.intro-mission-status', copy.mission);
      set('.intro-chapter h2', copy.goal);
      set('.intro-human', copy.human);
      set('.intro-rights', copy.rights);
      set('.intro-chapter a', copy.enter);
    } else {
      set('.intro-chapter h2', copy.goal);
      set('.intro-human', copy.human);
      set('.intro-chapter a', copy.enter);
    }
    this.stage.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.language === this.language));
    });
  }

  private syncControls(): void {
    const pending = this.state === 'starting';
    this.stage.dataset.state = this.state;
    this.ready.hidden = this.state !== 'ready' && !pending;
    const copy = INTRO_COPY[this.language];
    this.begin.textContent = pending ? copy.starting : copy.begin;
    this.toggle.textContent = pending ? copy.preparing : this.state === 'playing' ? copy.pause : this.state === 'ready' ? copy.play : copy.resume;
    this.resume.hidden = this.state !== 'paused' || this.resumeAfterScrub;
    this.resume.querySelector('span:last-child')!.textContent = copy.resume;
    for (const button of [this.begin, this.toggle, this.replay, this.skip, ...this.sceneButtons]) button.disabled = pending;
    this.seek.disabled = pending;
    this.stage.classList.toggle('intro-is-paused', this.state === 'paused');
  }

  private updateProgress(): void {
    const total = editionPlaybackTime(INTRO_DURATION, this.edition);
    const storyTime = editionStoryTime(this.time, this.edition);
    const progress = Math.min(this.time, total);
    this.seek.value = String(progress);
    this.seek.style.setProperty('--intro-progress', `${progress / total * 100}%`);
    const label = `${formatTime(progress)} / ${formatTime(total)}`;
    if (this.timeOutput.textContent !== label) this.timeOutput.textContent = label;
    const finale = this.edition.id === 'finale' && this.time < this.edition.duration ? finaleChapterAt(this.time, this.language) : null;
    const phase = this.state === 'ready' ? INTRO_COPY[this.language].waiting : finale ? finale.phase : phaseAt(storyTime, this.edition, this.language);
    if (this.phase.textContent !== phase) this.phase.textContent = phase;
    this.chapter.hidden = storyTime < INTRO_GOAL_AT;
    const caption = finale ? finale.caption : captionAt(storyTime, this.edition, this.language);
    if (this.caption.textContent !== caption) this.caption.textContent = caption;
    const scene = sceneIndexAt(storyTime);
    if (scene !== this.currentScene) {
      this.currentScene = scene;
      this.sceneButtons.forEach((button, index) => {
        if (index === scene) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }
  }

  private frame(): void {
    if (this.state === 'disposed') return;
    try {
      if (this.state === 'playing') this.time = this.audio!.getTime();
      const preview = this.state === 'ready' || this.state === 'starting';
      drawEditionIntro(this.ctx, preview ? this.edition.duration * (this.edition.id === 'finale' ? .8 : .43) : this.time,
        this.images, this.width, this.height, this.edition, true, this.language);
      this.updateProgress();
      this.stage.classList.toggle('intro-controls-idle', this.state === 'playing' && performance.now() - this.lastInteraction > 3000);
      this.raf = requestAnimationFrame(() => this.frame());
    } catch (error) { this.fail(error); }
  }

  private fail(error: unknown): void {
    void this.dispose().catch(this.onError);
    this.onError(error);
  }

  private async dispose(): Promise<void> {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    cancelAnimationFrame(this.raf);
    this.events.abort();
    this.resizeObserver.disconnect();
    this.stage.remove();
    document.body.classList.remove('intro-active');
    // start 与 close 串行，避免恢复中的音频上下文在销毁后继续调度。
    try { await this.pending; }
    finally { await this.audio?.dispose(); }
  }
}

export async function startIntro(onError: (error: unknown) => void): Promise<void> {
  document.body.classList.add('intro-active');
  const selected = new URLSearchParams(location.search).get('opening');
  const edition = selected ? introEdition(selected) : null;
  // 首页直达终版时，加载层就是第一屏，提前显示所选版本的名字。
  const language = getLanguage();
  const name = edition ? language === 'zh' ? edition.name : edition.title : language === 'zh' ? '历史版本' : 'Past openings';
  document.title = `${name} · ${language === 'zh' ? '鹈鹕 429' : 'PELICAN 429'}`;
  document.querySelector('#loading h1')!.textContent = name;
  document.querySelector('#loading p')!.textContent = language === 'zh' ? '正在准备序章…' : 'Preparing the prelude…';
  const load = async (url: string): Promise<HTMLImageElement> => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  };
  const [night, glitch, transformation, dream, world] = await Promise.all(
    [load(IMAGE_URLS.night), load(IMAGE_URLS.glitch), load(IMAGE_URLS.transformation), load(IMAGE_URLS.dream), load(IMAGE_URLS.world)]);
  const images = { night, glitch, transformation, dream, world };
  if (edition) {
    new IntroPlayer(images, onError, edition);
  } else showIntroGallery(images);
  document.getElementById('loading')!.hidden = true;
}
