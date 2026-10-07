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
import { getLanguage, onLanguageChange } from '../ui/language.ts';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../ui/fullscreen.ts';
import type { createIntroFortress } from './intro-fortress.ts';

type PlayState = 'ready' | 'starting' | 'playing' | 'paused' | 'entering' | 'disposed';

export interface StoryIntro {
  readonly ready: () => Promise<void>;
  readonly enter: (onReady: () => Promise<void>) => Promise<void>;
}

const IMAGE_URLS: Record<keyof IntroImages, string> = {
  night: new URL('../../assets/chapter-one/01-grassy-coding-concept-v3-mac-studio.webp', import.meta.url).href,
  glitch: new URL('../../assets/chapter-one/02-neural-breach-game-v3.webp', import.meta.url).href,
  transformation: new URL('../../assets/chapter-one/03-feather-transformation-v2.webp', import.meta.url).href,
  dream: new URL('../../assets/chapter-one/03-neural-rift-game-v3.webp', import.meta.url).href,
};

const CAPTIONS: Record<Exclude<IntroSceneId, 'prelude'>, string> = {
  night: '窗外雨雪交加，Grassy 在 Mac Studio 前写代码。',
  glitch: '金色的 gpt-6-astra 被悄悄改路由成 gpt-5.6-luna，又被降智成 gpt-4o-mini；空一拍，「封号」重重砸下，Grassy 天旋地转。',
  dream: 'Grassy 彻底变成鹈鹕，骑着车随音乐起伏；车轮踩着节拍聚拢、悬停，又一次次被甩飞。',
  world: '山体算力堡垒显现：黑洞前哨、冷却液断崖与三层机房。锁定落点，准备穿越。',
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
    <canvas class="intro-canvas" role="img" aria-label="从代码与多模型协奏到雨雪夜编程、屏幕失控、鹈鹕梦境与算力堡垒黑洞前哨的动画"></canvas>
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
      <a class="intro-mission-enter" href="./?mode=story&intro=skip"></a>
      <p class="intro-rights"></p>
    </div>` : `
    <div class="intro-chapter" hidden>
      <p class="intro-kicker">CHAPTER 01</p>
      <h2>FIGHT THE ROGUE AI</h2>
      <p class="intro-human">Become human again.</p>
      <a href="./?mode=story&intro=skip">进入游戏 <span aria-hidden="true">→</span></a>
    </div>`}
    <div class="intro-controls">
      <div class="intro-progress-row">
        <label class="intro-sr-only" for="intro-seek">播放进度</label>
        <input id="intro-seek" type="range" min="0" max="${total}" step="0.1" value="0" />
        <nav class="intro-scenes" aria-label="场景跳转">
          ${INTRO_SCENES.map((scene) => `<button type="button" style="left:${editionPlaybackTime(scene.at, edition) / total * 100}%"><span>${scene.label}</span></button>`).join('')}
        </nav>
      </div>
      <div class="intro-control-row">
        <output class="intro-time" aria-label="播放时间">00:00 / ${formatTime(total)}</output>
        <button type="button" class="intro-fullscreen" aria-pressed="false">全屏</button>
        <button type="button" class="intro-skip">跳过 →</button>
      </div>
    </div>
    <button type="button" class="intro-resume" hidden><span aria-hidden="true">▶</span> <span>继续</span></button>
    <p class="intro-sr-only intro-caption" aria-live="polite"></p>`;
  return stage;
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
      world: 'The mountain compute fortress emerges: a black-hole outpost, coolant chasm and three server floors. Landing site locked. Prepare to cross.',
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
  private readonly resume: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly fullscreen: HTMLButtonElement;
  private readonly seek: HTMLInputElement;
  private readonly sceneButtons: HTMLButtonElement[];
  private currentScene = -1;
  private readonly timeOutput: HTMLOutputElement;
  private readonly caption: HTMLElement;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private audio: IntroAudio | null = null;
  private released: Promise<void> | null = null;
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
  private images: IntroImages | null = null;
  private fortress: Awaited<ReturnType<typeof createIntroFortress>> | null = null;
  private readonly resourcesReady: Promise<void>;
  private readonly edition: IntroEdition;
  private readonly onError: (error: unknown) => void;
  private readonly story: StoryIntro | undefined;
  private readonly onPageHide = (): void => { void this.dispose().catch(this.onError); };

  constructor(loadResources: () => Promise<{ images: IntroImages; fortress: Awaited<ReturnType<typeof createIntroFortress>> }>, onError: (error: unknown) => void, edition: IntroEdition, story?: StoryIntro) {
    this.edition = edition;
    this.story = story;
    this.stage = createStage(edition);
    this.canvas = this.stage.querySelector('canvas')!;
    this.ready = this.stage.querySelector<HTMLElement>('.intro-ready')!;
    this.chapter = this.stage.querySelector<HTMLElement>('.intro-chapter')!;
    this.begin = this.stage.querySelector<HTMLButtonElement>('.intro-begin')!;
    this.resume = this.stage.querySelector<HTMLButtonElement>('.intro-resume')!;
    this.skip = this.stage.querySelector<HTMLButtonElement>('.intro-skip')!;
    this.fullscreen = this.stage.querySelector<HTMLButtonElement>('.intro-fullscreen')!;
    this.fullscreen.hidden = !canFullscreen();
    this.seek = this.stage.querySelector<HTMLInputElement>('#intro-seek')!;
    this.sceneButtons = [...this.stage.querySelectorAll<HTMLButtonElement>('.intro-scenes button')];
    this.timeOutput = this.stage.querySelector<HTMLOutputElement>('.intro-time')!;
    this.caption = this.stage.querySelector<HTMLElement>('.intro-caption')!;

    this.onError = onError;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('序章动画无法创建 Canvas 2D 绘图环境。');
    this.ctx = ctx;
    document.getElementById('app')!.append(this.stage);
    // 先让标题与操作界面绘制，再准备图片和后段才使用的 WebGL 世界。
    this.resourcesReady = new Promise<void>((resolve) => requestAnimationFrame(() => { setTimeout(resolve, 0); }))
      .then(async () => {
        if (this.events.signal.aborted) return;
        const resources = await loadResources();
        if (this.events.signal.aborted) { resources.fortress.dispose(); return; }
        this.images = resources.images;
        this.fortress = resources.fortress;
        this.syncControls();
      });
    const options = { signal: this.events.signal };
    if (story) {
      this.stage.querySelector<HTMLElement>('.intro-choose')!.hidden = true;
      const status = document.createElement('p');
      status.className = 'story-preload';
      status.setAttribute('role', 'status');
      this.stage.append(status);
      const sync = (): void => { status.textContent = getLanguage() === 'zh' ? this.fortress ? '正在后台加载游戏资源…' : '正在准备序章…' : this.fortress ? 'Loading game assets in the background…' : 'Preparing the prelude…'; };
      sync();
      this.events.signal.addEventListener('abort', onLanguageChange(sync), { once: true });
      // 加载完成不再提示，避免序章画面上残留状态文字。
      void this.resourcesReady.then(async () => {
        if (this.events.signal.aborted) return;
        sync();
        await story.ready();
        status.remove();
      }).catch((error: unknown) => { if (!this.events.signal.aborted) this.fail(error); });
      const enter = this.chapter.querySelector<HTMLAnchorElement>('a')!;
      enter.href = './?mode=story';
      enter.addEventListener('click', (event) => {
        event.preventDefault();
        void this.enterStory(story).catch((error: unknown) => this.fail(error));
      }, options);
    }
    // 进入即自动播放；开场页只在浏览器拦下自动播放时出现，点「开始播放」补上用户手势。
    this.begin.addEventListener('click', () => this.audio!.unlock(), options);
    this.canvas.addEventListener('click', () => this.togglePlayback(), options);
    this.resume.addEventListener('click', () => this.requestPlay(this.time), options);
    this.skip.addEventListener('click', () => {
      if (story) void this.enterStory(story).catch((error: unknown) => this.fail(error));
      else this.requestPlay(editionPlaybackTime(INTRO_GOAL_AT, this.edition));
    }, options);
    // 全屏随页面保留，序章里进入后游戏接着全屏。
    this.fullscreen.addEventListener('click', () => { toggleFullscreen().catch((error: unknown) => console.error('全屏失败', error)); }, options);
    onFullscreenChange(() => this.syncLanguage(), this.events.signal);
    this.sceneButtons.forEach((button, index) => {
      button.addEventListener('click', () => this.requestPlay(editionPlaybackTime(INTRO_SCENES[index]!.at, this.edition)), options);
    });
    const unsubscribeLanguage = onLanguageChange((language) => {
      this.language = language;
      this.syncLanguage();
      this.syncControls();
      this.updateProgress();
    });
    this.events.signal.addEventListener('abort', unsubscribeLanguage, { once: true });
    this.syncLanguage();
    this.seek.addEventListener('input', () => this.scrub(), options);
    this.seek.addEventListener('change', () => this.endScrub(), options);
    this.stage.addEventListener('pointermove', () => this.wakeControls(), options);
    this.stage.addEventListener('pointerdown', () => this.wakeControls(), options);
    this.stage.addEventListener('focusin', () => this.wakeControls(), options);
    window.addEventListener('keydown', (event) => this.keyDown(event), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    }, options);
    // 过渡会先释放播放资源，退出监听要持续到游戏接管画面。
    window.addEventListener('pagehide', this.onPageHide, { once: true });
    // bfcache 恢复时旧音频已释放，重新启动页面以恢复可交互的序章。
    window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.resize();
    this.requestPlay(0);
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
    if (this.state === 'starting' || this.state === 'entering' || this.state === 'disposed') return;
    void this.play(time).catch((error: unknown) => {
      if (!this.events.signal.aborted) this.fail(error);
    });
  }

  private async play(time: number): Promise<void> {
    if (time >= editionPlaybackTime(INTRO_DURATION, this.edition)) time = 0;
    // 拖回原值时浏览器可能不发 change，续播标记在这里一并清掉，免得之后暂停状态下拖动意外续播。
    this.resumeAfterScrub = false;
    this.state = 'starting';
    this.time = time;
    this.syncControls();
    this.audio ??= new IntroAudio(this.edition, (error) => this.fail(error));
    this.audio.setMuted(this.muted);
    await this.resourcesReady;
    if (this.events.signal.aborted) return;
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
    set('label[for="intro-seek"]', copy.seek);
    this.timeOutput.setAttribute('aria-label', copy.time);
    this.stage.querySelector('.intro-scenes')!.setAttribute('aria-label', copy.scenesLabel);
    this.sceneButtons.forEach((button, index) => { button.firstElementChild!.textContent = copy.scenes[index]!; });
    this.skip.textContent = copy.skip;
    this.fullscreen.textContent = isFullscreen() ? copy.exitFullscreen : copy.fullscreen;
    this.fullscreen.setAttribute('aria-pressed', String(isFullscreen()));
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
  }

  private syncControls(): void {
    const pending = this.state === 'starting';
    const ended = this.time >= editionPlaybackTime(INTRO_DURATION, this.edition);
    this.stage.dataset.state = this.state;
    this.stage.dataset.loading = String(!this.fortress);
    if (this.state !== 'entering') this.ready.hidden = this.state !== 'ready' && !pending;
    const copy = INTRO_COPY[this.language];
    this.begin.textContent = this.state === 'entering' ? this.language === 'zh' ? '正在进入游戏…' : 'Entering the game…'
      : this.fortress ? copy.begin : this.language === 'zh' ? '正在准备序章…' : 'Preparing the prelude…';
    this.resume.hidden = this.state !== 'paused' || this.resumeAfterScrub || ended;
    this.resume.querySelector('span:last-child')!.textContent = copy.resume;
    this.skip.disabled = pending && !this.story;
    for (const button of this.sceneButtons) button.disabled = pending;
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
    if (this.state === 'disposed' || this.state === 'entering') return;
    try {
      if (this.state === 'playing') {
        this.time = this.audio!.getTime();
        const end = editionPlaybackTime(INTRO_DURATION, this.edition);
        if (this.time >= end) {
          this.pause();
          this.time = end;
          // 终版播完直接进入游戏；历史版本停在结尾，留在目录里继续挑选。
          if (this.edition.id === 'finale') {
            this.chapter.querySelector('a')!.click();
            if (this.story) return;
          }
        }
      }
      const preview = this.state === 'ready' || this.state === 'starting';
      const seconds = preview ? this.edition.duration * (this.edition.id === 'finale' ? .8 : .43) : this.time;
      const storyTime = editionStoryTime(seconds, this.edition);
      if (this.fortress) {
        if (storyTime >= introSceneAt('world')) this.fortress.render(storyTime, this.width, Math.max(1, this.height - 96));
        drawEditionIntro(this.ctx, seconds,
          this.images!, this.fortress.canvas, this.width, this.height, this.edition, true, this.language);
      }
      this.updateProgress();
      this.stage.classList.toggle('intro-controls-idle', this.state === 'playing' && performance.now() - this.lastInteraction > 3000);
      this.raf = requestAnimationFrame(() => this.frame());
    } catch (error) { this.fail(error); }
  }

  private fail(error: unknown): void {
    void this.dispose().catch(this.onError);
    this.onError(error);
  }

  private async enterStory(story: StoryIntro): Promise<void> {
    if (this.state === 'entering' || this.state === 'disposed') return;
    this.pause();
    this.state = 'entering';
    this.syncControls();
    this.stage.inert = true;
    this.stage.querySelector('.story-preload')?.remove();
    const status = document.createElement('p');
    status.className = 'story-preload';
    status.setAttribute('role', 'status');
    status.textContent = this.language === 'zh' ? '正在进入游戏…' : 'Entering the game…';
    this.stage.append(status);
    // 即使提前跳过，也先完成序章资源，避免两套场景争抢加载。
    await this.resourcesReady;
    if (this.state !== 'entering') return;
    await this.releaseResources();
    if (this.state !== 'entering') return;
    await story.ready();
    if (this.state !== 'entering') return;
    await story.enter(async () => {
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
      await this.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' }).finished;
      this.stage.remove();
      document.body.classList.remove('intro-active');
      this.state = 'disposed';
      window.removeEventListener('pagehide', this.onPageHide);
    });
  }

  private releaseResources(): Promise<void> {
    if (this.released) return this.released;
    cancelAnimationFrame(this.raf);
    this.events.abort();
    this.resizeObserver.disconnect();
    this.fortress?.dispose();
    this.released = this.audio?.dispose() ?? Promise.resolve();
    return this.released;
  }

  private async dispose(): Promise<void> {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    window.removeEventListener('pagehide', this.onPageHide);
    this.stage.remove();
    document.body.classList.remove('intro-active');
    await this.releaseResources();
  }
}

export async function startIntro(onError: (error: unknown) => void, story?: StoryIntro): Promise<void> {
  document.body.classList.add('intro-active');
  const selected = story ? 'finale' : new URLSearchParams(location.search).get('opening');
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
  const loadImages = (): Promise<IntroImages> => Promise.all(
    [load(IMAGE_URLS.night), load(IMAGE_URLS.glitch), load(IMAGE_URLS.transformation), load(IMAGE_URLS.dream)])
    .then(([night, glitch, transformation, dream]) => ({ night, glitch, transformation, dream }));
  if (edition) {
    new IntroPlayer(async () => {
      // 图片解码与实时场景并行；失败时仍等待另一侧结算，避免遗留 WebGL 资源。
      const [art, fortress] = await Promise.allSettled([
        loadImages(), import('./intro-fortress.ts').then(({ createIntroFortress }) => createIntroFortress()),
      ]);
      if (art.status === 'rejected') {
        if (fortress.status === 'fulfilled') fortress.value.dispose();
        throw art.reason;
      }
      if (fortress.status === 'rejected') throw fortress.reason;
      return { images: art.value, fortress: fortress.value };
    }, onError, edition, story);
  } else showIntroGallery(await loadImages());
  document.getElementById('loading')!.hidden = true;
}
