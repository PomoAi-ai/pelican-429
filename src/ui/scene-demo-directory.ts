import { SCENE_DEMOS } from '../config/scene-demos.ts';
import type { ShowcaseDemo } from '../config/showcase.ts';
import { FACILITY_SCENE_IDS, FACILITY_SCENES } from '../config/facility-scenes.ts';

/** 演示入口共用同一目录；卡片演示保留页内切换，其他页面使用真实链接。 */
export function createSceneDemoDirectory(parent: HTMLElement, activeId: string, onSelect?: (demo: ShowcaseDemo) => void) {
  const nav = document.createElement('nav');
  nav.className = 'scene-demo-directory';
  nav.setAttribute('aria-label', '场景目录');
  parent.append(nav);
  const link = (id: string, title: string, href: string) => {
    const button = document.createElement('a');
    button.className = 'scene-demo-choice';
    button.href = href;
    button.setAttribute('aria-current', id === activeId ? 'page' : 'false');
    const label = document.createElement('strong'); label.textContent = title;
    button.append(label); nav.append(button);
    return { id, button };
  };
  const entries = [link('residence', 'AI 住宅', './?mode=lab&demo=residence')];
  for (const demo of SCENE_DEMOS) {
    const entry = link(demo.id, demo.title.replace(/^\d+\s*·\s*/, ''), `./?mode=lab&demo=${demo.id}`);
    if (onSelect) entry.button.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onSelect(demo);
    });
    entries.push(entry);
  }
  for (const id of FACILITY_SCENE_IDS) entries.push(link(`facility:${id}`, FACILITY_SCENES[id].name, `./?mode=facility&scene=${id}`));
  return entries;
}
