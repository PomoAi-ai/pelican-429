import type { ResidenceResource } from '../../config/residence.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

/**
 * 城区建造面板：只提供控件与容器，建造状态、存档反馈与城区提示由城区功能驱动。
 * 面板只在建造时显示；存档状态与城区提示行常驻画面。
 */
export function createResidenceHud(resources: readonly ResidenceResource[], parent: HTMLElement = document.body) {
  const root = document.createElement('section');
  root.className = 'residence-build';
  // 模板只拼一次；每段译文先留注释标记，挂载后换成文本节点绑定，语言切换时逐个重取。
  const texts: Array<() => string> = [];
  const attrs: Array<readonly [string, () => string]> = [];
  const text = (render: () => string): string => `<!--${texts.push(render) - 1}-->${render()}`;
  const attr = (name: string, render: () => string): string => `${name}="${render()}" data-l10n="${attrs.push([name, render]) - 1}"`;
  root.innerHTML = `
    <aside id="residence-resources" class="residence-sidebar" ${attr('aria-label', () => t('建造资源与工具'))}>
      <div class="residence-panel-heading"><h2>${text(() => t('建造资源'))}</h2><span>${text(() => t('{n} 种').replace('{n}', String(resources.length)))}</span></div>
      <p class="residence-panel-intro">${text(() => t('挑选构件，在格子上搭出自己的家。'))}</p>
      <div data-resource-picker aria-describedby="residence-resource-note"></div>
      <label class="residence-field" data-depth-field for="residence-depth">${text(() => `${t('砖块深度')} `)}<select id="residence-depth" data-depth-mode>
          <option value="normal">${text(() => t('普通格 · 深 2'))}</option>
          <option value="deep">${text(() => t('加深格 · 深 3（前后各扩 0.5）'))}</option>
        </select>
      </label>
      <p id="residence-resource-note" class="residence-resource-note" data-resource-note>${text(() => t('选择资源，查看尺寸与摆放方式。'))}</p>
      <label class="residence-field" for="residence-tool">${text(() => `${t('建造工具')} `)}<select id="residence-tool" data-tool>
          <option value="place">${text(() => t('放置构件'))}</option>
          <option value="remove">${text(() => t('拆除构件'))}</option>
        </select>
      </label>
      <div class="residence-build-status" data-build-status role="status" aria-live="polite" aria-atomic="true">${text(() => t('选好资源后，点击场景中的格子。'))}</div>
      <details class="residence-help">
        <summary>${text(() => t('搭建提示'))}</summary>
        <p>${text(() => t('先搭地板和墙，再加入门窗、跳台与家具。给人物留出通道，家具完整落在支撑面上。'))}</p>
        <p>${text(() => t('建造时游玩暂停；结束建造后，走进房间检查实际效果。'))}</p>
      </details>
    </aside>
    <p class="residence-save-status" data-save-status role="status" aria-live="polite">${text(() => t('本机独立存档 · 修改后自动保存'))}</p>
    <p class="residence-action-status" data-action-status role="status" aria-live="polite" aria-atomic="true"></p>`;
  const bound: Array<readonly [Text, () => string]> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const markers: Comment[] = [];
  while (walker.nextNode()) markers.push(walker.currentNode as Comment);
  for (const marker of markers) {
    bound.push([marker.nextSibling as Text, texts[Number(marker.data)]!]);
    marker.remove();
  }
  const attributed = [...root.querySelectorAll<HTMLElement>('[data-l10n]')].map((element) => [element, attrs[Number(element.dataset.l10n)]!] as const);
  // 城区功能会改写状态行等文本；只重取仍是上一语言原文的节点，避免覆盖运行中的状态。
  let shown = bound.map(([node]) => node.data);
  const syncLanguage = (): void => {
    bound.forEach(([node, render], index) => { if (node.data === shown[index]) node.data = render(); });
    shown = bound.map(([node]) => node.data);
    for (const [element, [name, render]] of attributed) element.setAttribute(name, render());
  };
  const unsubscribe = onLanguageChange(syncLanguage);
  parent.append(root);
  return { root, dispose(): void { unsubscribe(); root.remove(); } };
}
