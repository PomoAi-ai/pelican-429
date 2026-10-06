import { FACILITY_CHAPTERS, FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { FacilityChapterId } from '../config/facility-scenes.ts';
import type { ScreenPoint } from './hud.ts';
import { FACILITY_EN } from './facility-minimap.ts';
import { getLanguage, onLanguageChange } from './language.ts';

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
  const params = new URLSearchParams(location.search);
  if (params.get('free') === '1') {
    params.set('scene', id);
    link.href = `./?${params}`;
  } else link.href = `./?mode=game&level=facility&scene=${id}`;
  link.textContent = label;
  return link;
}

export function createFacilityChapterHud(parent: HTMLElement, id: FacilityChapterId, project: (x: number, y: number) => ScreenPoint | null): FacilityChapterHud {
  const scene = FACILITY_SCENES[id];
  const chapter = FACILITY_CHAPTERS[id];
  const root = element('div', 'facility-chapter-hud', parent);
  const panel = element('section', 'facility-chapter-panel', root);
  panel.setAttribute('aria-label', '场景预览');
  const header = element('div', 'facility-chapter-header', panel);
  element('span', 'facility-chapter-number', header).textContent = `SCENE ${scene.number}`;
  element('h1', 'facility-chapter-title', header).textContent = scene.name;
  element('p', 'facility-chapter-description', panel).textContent = '场景预览 · 自由探索';
  const footer = element('div', 'facility-chapter-footer', panel);
  const resetLink = chapterLink(footer, id, '重置位置');
  const nextLink = chapter.next !== null ? chapterLink(footer, chapter.next, `下一场景 · ${FACILITY_SCENES[chapter.next].name} →`) : null;
  const controls = element('div', 'facility-chapter-controls', panel);
  const hints: HTMLElement[] = [];
  for (const [keys, action] of [['A/D', '移动'], ['空格', '跳跃 / 飞行'], ['J', '吐水普攻'], ['1–3', '技能（右键副攻）'], ['S＋空格', '下平台'], ['M', '场景地图']] as const) {
    const hint = element('span', 'facility-chapter-control', controls);
    element('kbd', '', hint).textContent = keys;
    hint.append(` ${action}`);
    hints.push(hint);
  }

  const exit = element('div', 'facility-chapter-exit', root);
  exit.hidden = true;
  exit.textContent = '出口';
  const death = element('div', 'facility-chapter-death', root);
  death.setAttribute('role', 'alert');
  death.hidden = true;
  const deathTitle = element('strong', '', death);
  const deathHint = element('p', '', death);
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    panel.setAttribute('aria-label', en ? 'Scene preview' : '场景预览');
    header.querySelector('.facility-chapter-number')!.textContent = `${en ? 'SCENE' : '场景'} ${scene.number}`;
    header.querySelector('h1')!.textContent = en ? FACILITY_EN[id].name : scene.name;
    panel.querySelector('.facility-chapter-description')!.textContent = en ? 'Scene preview · Free exploration' : '场景预览 · 自由探索';
    resetLink.textContent = en ? 'Reset position' : '重置位置';
    if (nextLink && chapter.next) nextLink.textContent = en ? `Next scene · ${FACILITY_EN[chapter.next].name} →` : `下一场景 · ${FACILITY_SCENES[chapter.next].name} →`;
    const actions = en ? ['Move', 'Jump / Fly', 'Water spray', 'Skills (RMB secondary)', 'Drop through', 'Scene map'] : ['移动', '跳跃 / 飞行', '吐水普攻', '技能（右键副攻）', '下平台', '场景地图'];
    hints.forEach((hint, index) => {
      hint.querySelector('kbd')!.textContent = en ? ['A/D', 'Space', 'J', '1–3', 'S + Space', 'M'][index]! : ['A/D', '空格', 'J', '1–3', 'S＋空格', 'M'][index]!;
      hint.lastChild!.textContent = ` ${actions[index]}`;
    });
    exit.textContent = en ? 'Exit' : '出口';
    deathTitle.textContent = en ? 'YOU DIED' : '已死亡';
    deathHint.textContent = en ? 'Returning to the outpost entrance…' : '正在返回前哨入口…';
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
