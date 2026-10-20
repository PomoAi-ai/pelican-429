import { FACILITY_CHAPTERS, FACILITY_SCENES } from '../../config/facility-scenes.ts';
import type { FacilityChapterId } from '../../config/facility-scenes.ts';
import type { ScreenPoint } from './hud.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

export interface FacilityChapterHud {
  update(respawning: boolean): void;
  dispose(): void;
}

function element<T extends keyof HTMLElementTagNameMap>(tag: T, className: string, parent: HTMLElement) {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

function chapterLink(parent: HTMLElement, id: FacilityChapterId, label: string) {
  const link = element('a', 'facility-chapter-link', parent);
  link.href = `./?mode=game&level=facility&scene=${id}`;
  link.textContent = label;
  return link;
}

export function createFacilityChapterHud(parent: HTMLElement, id: FacilityChapterId, project: (x: number, y: number) => ScreenPoint | null): FacilityChapterHud {
  const scene = FACILITY_SCENES[id];
  const chapter = FACILITY_CHAPTERS[id];
  const root = element('div', 'facility-chapter-hud', parent);
  const panel = element('section', 'facility-chapter-panel', root);
  const header = element('div', 'facility-chapter-header', panel);
  const number = element('span', 'facility-chapter-number', header);
  const title = element('h1', 'facility-chapter-title', header);
  const description = element('p', 'facility-chapter-description', panel);
  const footer = element('div', 'facility-chapter-footer', panel);
  const resetLink = chapterLink(footer, id, '');
  const nextLink = chapter.next !== null ? chapterLink(footer, chapter.next, '') : null;
  const controls = element('div', 'facility-chapter-controls', panel);
  const hints = ([['A/D', '移动'], ['空格', '跳跃 / 飞行'], ['J', '吐水普攻'], ['1–3', '技能（右键副攻）'], ['S＋空格', '下平台'], ['M', '场景地图']] as const).map(([keys, action]) => {
    const hint = element('span', 'facility-chapter-control', controls);
    const kbd = element('kbd', '', hint);
    const text = document.createTextNode('');
    hint.append(text);
    return () => { kbd.textContent = keys.includes('空格') ? t(keys) : keys; text.textContent = ` ${t(action)}`; };
  });

  const exit = element('div', 'facility-chapter-exit', root);
  exit.hidden = true;
  const death = element('div', 'facility-chapter-death', root);
  death.setAttribute('role', 'alert');
  death.hidden = true;
  const deathTitle = element('strong', '', death);
  const deathHint = element('p', '', death);
  const syncLanguage = (): void => {
    panel.setAttribute('aria-label', t('场景预览'));
    number.textContent = `${t('场景', 'facility')} ${scene.number}`;
    title.textContent = t(scene.name, 'facility');
    description.textContent = t('场景预览 · 自由探索');
    resetLink.textContent = t('回到起点');
    if (nextLink && chapter.next) nextLink.textContent = t('下一场景 · {name} →').replace('{name}', t(FACILITY_SCENES[chapter.next].name, 'facility'));
    hints.forEach((sync) => sync());
    exit.textContent = t('出口');
    deathTitle.textContent = t('已死亡');
    deathHint.textContent = t('正在返回前哨入口…');
  };
  syncLanguage();
  const unsubscribeLanguage = onLanguageChange(syncLanguage);
  for (const event of ['pointerdown', 'mousedown', 'click', 'keydown']) {
    root.addEventListener(event, (e) => e.stopPropagation());
  }

  return {
    update(respawning: boolean): void {
      death.hidden = !respawning;
      const position = project(chapter.exit.x, chapter.exit.y + 4);
      exit.hidden = position === null;
      if (position) exit.style.transform = `translate(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px) translate(-50%, -100%)`;
    },
    dispose(): void { unsubscribeLanguage(); root.remove(); },
  };
}
