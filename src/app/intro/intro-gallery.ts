import { INTRO_EDITIONS } from '../../config/intro-editions.ts';
import { drawEditionPrelude } from '../../render/intro/intro-editions.ts';
import type { IntroImages } from '../../render/intro/intro-story.ts';
import { getLanguage, onLanguageChange } from '../../ui/model/language.ts';
import { t } from '../../config/i18n.ts';
import type { PageContext } from '../shell/page-context.ts';

/** 现行开局只有降智风暴序章；其余方案作为历史版本保留，仍可逐个播放。 */
export function showIntroGallery(context: PageContext, images: IntroImages): void {
  const archive = INTRO_EDITIONS.filter((edition) => edition.id !== 'finale');
  const gallery = document.createElement('section');
  gallery.className = 'intro-gallery';
  gallery.innerHTML = `
    <header class="intro-gallery-header">
      <a href="./" class="intro-gallery-home"></a>
      <p class="intro-gallery-eyebrow">PELICAN 429 / HISTORY</p>
      <h1></h1>
      <p class="intro-gallery-lede"></p>
      <a class="intro-gallery-current" href="./?mode=intro&opening=finale"></a>
    </header>
    <nav class="intro-edition-grid">
      ${archive.map((edition) => `<a class="intro-edition-card" href="./?mode=intro&opening=${edition.id}" style="--card-accent:${edition.accent}">
        <div class="intro-edition-preview"><canvas data-opening="${edition.id}"></canvas><span class="intro-edition-number">${edition.number}</span><span class="intro-edition-play" aria-hidden="true">↗</span></div>
        <div class="intro-edition-body"><p class="intro-edition-en">${edition.title}</p><h2></h2><p></p><div class="intro-edition-meta"><span></span><span></span></div></div>
      </a>`).join('')}
    </nav>
    <footer class="intro-gallery-footer"></footer>`;
  context.root.append(gallery);
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    gallery.lang = en ? 'en' : 'zh-CN';
    gallery.setAttribute('aria-label', t('历史版本', 'intro'));
    const set = (selector: string, value: string): void => { gallery.querySelector<HTMLElement>(selector)!.textContent = value; };
    set('.intro-gallery-home', t('← 游戏首页'));
    set('.intro-gallery-header h1', t('历史版本', 'intro'));
    set('.intro-gallery-lede', t('现行开局是「AGI 降智风暴 · 序章」。以下 {n} 套是之前的版本，保留在这里，仍可逐个播放。').replace('{n}', String(archive.length)));
    set('.intro-gallery-current', t('播放现行序章 ↗'));
    gallery.querySelector('.intro-edition-grid')!.setAttribute('aria-label', t('历史版本', 'intro'));
    archive.forEach((edition, index) => {
      const card = gallery.querySelectorAll<HTMLElement>('.intro-edition-card')[index]!;
      card.querySelector('h2')!.textContent = en ? edition.title : edition.name;
      card.querySelector('.intro-edition-body > p:not(.intro-edition-en)')!.textContent = en ? edition.subtitle : edition.description;
      card.querySelector('.intro-edition-meta span:first-child')!.textContent = t(edition.music);
      card.querySelector('.intro-edition-meta span:last-child')!.textContent = t('{n}s 序奏').replace('{n}', String(edition.duration));
      card.querySelector('canvas')!.setAttribute('aria-label', t('{name}的实际动画预览').replace('{name}', en ? edition.title : edition.name));
    });
    set('.intro-gallery-footer', t('每个历史版本都有独立序奏，并衔接雨雪夜、失控、鹈鹕梦境与游戏世界。'));
    document.title = `${t('历史版本', 'intro')} · ${t('鹈鹕 429')}`;
  };
  syncLanguage();
  context.onDispose(onLanguageChange(() => { syncLanguage(); paint(); }));
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
      drawEditionPrelude({ ctx, seconds: edition.duration * .61, progress: .61, images, width, height, edition, language: getLanguage() });
    });
  };
  const resize = new ResizeObserver(paint);
  resize.observe(gallery);
  paint();
  context.onDispose(() => resize.disconnect());
}
