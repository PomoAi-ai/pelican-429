import { TRANSIT_DESTINATIONS } from '../../config/transit.ts';
import { t } from '../../config/i18n.ts';
import '../../ui/hud/transit.css';

/** 交通中心界面：叠在游戏画布上的透明层，只有按钮与对话框接收指针。 */
export function createTransitInterface(root: HTMLElement) {
  root.insertAdjacentHTML('beforeend', `<section class="transit-app" data-label="星舰交通中心" hidden>
    <div class="transit-telemetry"><span data-phase></span><strong data-readout>READY</strong><small data-engine></small><div class="transit-meter"><i></i></div></div>
    <button type="button" class="transit-hatch-marker" data-hatch data-text="打开舱门" hidden> <span>E</span></button>
    <section class="transit-entry" role="dialog" data-label="星舰舱门" hidden>
      <span class="transit-eyebrow">CREW ACCESS / 01</span><h2 data-text="驾驶舱已就绪"></h2><p data-text="进入后选择目的地。"></p>
      <button type="button" class="transit-launch" data-enter data-text="进入驾驶舱 →"></button>
      <button type="button" class="transit-cancel" data-close-entry data-text="暂不进入"></button>
    </section>
    <section class="transit-destinations" data-label="舱内导航" hidden>
      <span class="transit-eyebrow" data-text="航道已连接 · CREW ONLINE"></span><h2 data-text="下一站，去哪里？"></h2>
      <p data-text="选择目的地后发射。先升空，再跃迁进入场景。"></p>
      <div class="transit-routes">${TRANSIT_DESTINATIONS.map((d, i) => `<button type="button" data-destination="${d.id}" aria-pressed="false"><span class="transit-route-number">0${i + 1}</span><span><strong data-text="${d.name}" data-scope="place"></strong><small data-text="${d.detail}"></small></span><b aria-hidden="true">↗</b></button>`).join('')}</div>
      <button type="button" class="transit-launch" data-launch disabled></button>
      <button type="button" class="transit-cancel" data-cancel data-text="暂不出发 · 返回平台"></button>
    </section>
    <div class="transit-bottom"><p data-hint role="status" aria-live="polite"></p><button type="button" class="transit-board" data-board></button></div>
    <div class="transit-jump" aria-hidden="true"><span data-text="航道开启"></span></div>
  </section>`);
  const section = root.lastElementChild as HTMLElement;
  const element = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  /** 固定文字按当前语言重写：data-text 写首个文字节点（舱门按钮后面还有按键标记），data-label 写无障碍名称。 */
  const translate = (): void => {
    for (const item of section.querySelectorAll<HTMLElement>('[data-text]')) {
      const text = t(item.dataset.text!, item.dataset.scope);
      if (item.firstChild === null) item.textContent = text; else item.firstChild.nodeValue = text;
    }
    for (const item of [section, ...section.querySelectorAll<HTMLElement>('[data-label]')]) item.setAttribute('aria-label', t(item.dataset.label!));
  };
  translate();
  return { section, translate,
    panel: element<HTMLElement>('.transit-destinations'), entry: element<HTMLElement>('.transit-entry'),
    phase: element<HTMLElement>('[data-phase]'), readout: element<HTMLElement>('[data-readout]'),
    engine: element<HTMLElement>('[data-engine]'), hint: element<HTMLElement>('[data-hint]'),
    meter: element<HTMLElement>('.transit-meter i'), board: element<HTMLButtonElement>('[data-board]'),
    launch: element<HTMLButtonElement>('[data-launch]'), cancel: element<HTMLButtonElement>('[data-cancel]'),
    hatch: element<HTMLButtonElement>('[data-hatch]'), enter: element<HTMLButtonElement>('[data-enter]'),
    closeEntry: element<HTMLButtonElement>('[data-close-entry]'), flash: element<HTMLElement>('.transit-jump') };
}
