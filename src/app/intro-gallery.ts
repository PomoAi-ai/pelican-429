import { INTRO_EDITIONS } from '../config/intro-editions.ts';
import { drawEditionIntro } from '../render/intro-editions.ts';
import type { IntroImages } from '../render/intro-story.ts';
import { getLanguage, onLanguageChange, setLanguage } from '../ui/language.ts';

const EN_MUSIC = [
  'Bells · orchestral crescendo', 'Minimal piano · layered harmony', 'Swing piano · plucked bass',
  'Electronic pulse · driving eighth notes', 'Glass tones · slow tides', 'Mechanical percussion · rising arpeggios',
  'Celestial bells · sustained chords', 'Piano dialogue · space and response', 'Three-part counterpoint · Baroque arpeggios',
  'Sparse bass · suspenseful finale',
];

/** 现行开局只有降智风暴序章；其余方案作为历史版本保留，仍可逐个播放。 */
export function showIntroGallery(images: IntroImages): void {
  const archive = INTRO_EDITIONS.filter((edition) => edition.id !== 'finale');
  const gallery = document.createElement('section');
  gallery.className = 'intro-gallery';
  gallery.innerHTML = `
    <header class="intro-gallery-header">
      <a href="/" class="intro-gallery-home"></a>
      <p class="intro-gallery-eyebrow">PELICAN 429 / HISTORY</p>
      <h1></h1>
      <p class="intro-gallery-lede"></p>
      <a class="intro-gallery-current" href="/?mode=intro&opening=finale"></a>
    </header>
    <nav class="intro-edition-grid">
      ${archive.map((edition) => `<a class="intro-edition-card" href="/?mode=intro&opening=${edition.id}" style="--card-accent:${edition.accent}">
        <div class="intro-edition-preview"><canvas data-opening="${edition.id}"></canvas><span class="intro-edition-number">${edition.number}</span><span class="intro-edition-play" aria-hidden="true">↗</span></div>
        <div class="intro-edition-body"><p class="intro-edition-en">${edition.title}</p><h2>${edition.name}</h2><p>${edition.description}</p><div class="intro-edition-meta"><span>${edition.music}</span><span>${edition.duration}s 序奏</span></div></div>
      </a>`).join('')}
    </nav>
    <footer class="intro-gallery-footer"></footer>`;
  document.getElementById('app')!.append(gallery);
  const languages = document.createElement('div');
  languages.className = 'intro-languages';
  languages.setAttribute('role', 'group');
  languages.setAttribute('aria-label', '语言 / Language');
  languages.innerHTML = '<button type="button" data-language="zh">中文</button><button type="button" data-language="en">English</button>';
  gallery.append(languages);
  languages.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.language as 'zh' | 'en'));
  });
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    gallery.lang = en ? 'en' : 'zh-CN';
    gallery.setAttribute('aria-label', en ? 'Past openings' : '历史版本');
    const set = (selector: string, value: string): void => { gallery.querySelector<HTMLElement>(selector)!.textContent = value; };
    set('.intro-gallery-home', en ? '← Game home' : '← 游戏首页');
    set('.intro-gallery-header h1', en ? 'Past openings' : '历史版本');
    set('.intro-gallery-lede', en
      ? `The current opening is AGI Brain-Drain Storm · Prelude. These ${archive.length} earlier versions are kept for reference and can still be played.`
      : `现行开局是「AGI 降智风暴 · 序章」。以下 ${archive.length} 套是之前的版本，保留在这里，仍可逐个播放。`);
    set('.intro-gallery-current', en ? 'Play the current prelude ↗' : '播放现行序章 ↗');
    gallery.querySelector('.intro-edition-grid')!.setAttribute('aria-label', en ? 'Past openings' : '历史版本');
    archive.forEach((edition, index) => {
      const card = gallery.querySelectorAll<HTMLElement>('.intro-edition-card')[index]!;
      card.querySelector('h2')!.textContent = en ? edition.title : edition.name;
      card.querySelector('.intro-edition-body > p:not(.intro-edition-en)')!.textContent = en ? edition.subtitle : edition.description;
      card.querySelector('.intro-edition-meta span:first-child')!.textContent = en ? EN_MUSIC[index]! : edition.music;
      card.querySelector('.intro-edition-meta span:last-child')!.textContent = en ? `${edition.duration}s prelude` : `${edition.duration}s 序奏`;
      card.querySelector('canvas')!.setAttribute('aria-label', en ? `${edition.title} animation preview` : `${edition.name}的实际动画预览`);
    });
    set('.intro-gallery-footer', en
      ? 'Each past version has its own overture and continues into the stormy night, malfunction, pelican dream and game world.'
      : '每个历史版本都有独立序奏，并衔接雨雪夜、失控、鹈鹕梦境与游戏世界。');
    languages.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.language === getLanguage())));
    document.title = en ? 'Past openings · PELICAN 429' : '历史版本 · 鹈鹕 429';
  };
  syncLanguage();
  const unsubscribe = onLanguageChange(() => { syncLanguage(); paint(); });
  window.addEventListener('pagehide', unsubscribe, { once: true });
  const previews = [...gallery.querySelectorAll('canvas')].map((canvas) => ({
    canvas, edition: INTRO_EDITIONS.find((edition) => edition.id === canvas.dataset.opening)!,
  }));
  const paint = (): void => {
    previews.forEach(({ canvas, edition }) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('历史版本页无法创建预览画布。');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      drawEditionIntro(ctx, edition.duration * .61, images, width, height, edition, false, getLanguage());
    });
  };
  const resize = new ResizeObserver(paint);
  resize.observe(gallery);
  paint();
  window.addEventListener('pagehide', () => resize.disconnect(), { once: true });
}
