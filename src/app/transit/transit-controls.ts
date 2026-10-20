import { TRANSIT_DESTINATIONS } from '../../config/transit.ts';
import { t } from '../../config/i18n.ts';
import '../../ui/hud/transit.css';

/** 交通中心界面：叠在游戏画布上的透明层，只有按钮与对话框接收指针。 */
export function createTransitInterface(root: HTMLElement) {
  root.insertAdjacentHTML('beforeend', `<section class="transit-app" aria-label="${t('星舰交通中心')}" hidden>
    <div class="transit-telemetry"><span data-phase>${t('等待登船')}</span><strong data-readout>READY</strong><small data-engine></small><div class="transit-meter"><i></i></div></div>
    <button type="button" class="transit-hatch-marker" data-hatch hidden>${t('打开舱门')} <span>E</span></button>
    <section class="transit-entry" role="dialog" aria-label="${t('星舰舱门')}" hidden>
      <span class="transit-eyebrow">CREW ACCESS / 01</span><h2>${t('驾驶舱已就绪')}</h2><p>${t('进入后选择目的地。')}</p>
      <button type="button" class="transit-launch" data-enter>${t('进入驾驶舱 →')}</button>
      <button type="button" class="transit-cancel" data-close-entry>${t('暂不进入')}</button>
    </section>
    <section class="transit-destinations" aria-label="${t('舱内导航')}" hidden>
      <span class="transit-eyebrow">${t('航道已连接 · CREW ONLINE')}</span><h2>${t('下一站，去哪里？')}</h2>
      <p>${t('选择目的地后发射。先升空，再跃迁进入场景。')}</p>
      <div class="transit-routes">${TRANSIT_DESTINATIONS.map((d, i) => `<button type="button" data-destination="${d.id}" aria-pressed="false"><span class="transit-route-number">0${i + 1}</span><span><strong>${t(d.name, 'place')}</strong><small>${t(d.detail)}</small></span><b aria-hidden="true">↗</b></button>`).join('')}</div>
      <button type="button" class="transit-launch" data-launch disabled>${t('请选择目的地')}</button>
      <button type="button" class="transit-cancel" data-cancel>${t('暂不出发 · 返回平台')}</button>
    </section>
    <div class="transit-bottom"><p data-hint role="status" aria-live="polite">${t('按住空格飞行 · S 下降 · E 交互')}</p><button type="button" class="transit-board" data-board>${t('乘电梯 ↑')}</button></div>
    <div class="transit-jump" aria-hidden="true"><span>${t('航道开启')}</span></div>
  </section>`);
  const section = root.lastElementChild as HTMLElement;
  const element = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  return { section,
    panel: element<HTMLElement>('.transit-destinations'), entry: element<HTMLElement>('.transit-entry'),
    phase: element<HTMLElement>('[data-phase]'), readout: element<HTMLElement>('[data-readout]'),
    engine: element<HTMLElement>('[data-engine]'), hint: element<HTMLElement>('[data-hint]'),
    meter: element<HTMLElement>('.transit-meter i'), board: element<HTMLButtonElement>('[data-board]'),
    launch: element<HTMLButtonElement>('[data-launch]'), cancel: element<HTMLButtonElement>('[data-cancel]'),
    hatch: element<HTMLButtonElement>('[data-hatch]'), enter: element<HTMLButtonElement>('[data-enter]'),
    closeEntry: element<HTMLButtonElement>('[data-close-entry]'), flash: element<HTMLElement>('.transit-jump') };
}
