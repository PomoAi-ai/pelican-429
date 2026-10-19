import { TRANSIT_DESTINATIONS } from '../config/transit.ts';
import type { SceneMountContext } from './scene-mount.ts';

/** 飞行与着陆测试场：每次点击都重新载入内嵌游戏页，交接与关卡加载留在框内完成。 */
export function mountLandingLab(context: SceneMountContext): void {
  const page = document.createElement('section');
  page.className = 'room-preview';
  // 主世界不是星舰目的地，只能着陆（从机房坐着陆舱返回）。
  page.innerHTML = `<div class="room-preview-toolbar">
    <select aria-label="目的地">${TRANSIT_DESTINATIONS.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}<option value="main-world">主世界</option></select>
    <button type="button" data-flight>开始飞行</button><button type="button" data-landing>开始着陆</button><button type="button" data-takeoff>起飞返回</button>
    <span class="room-preview-status" role="status"></span>
    </div><iframe class="scene-game-frame" title="星舰飞行 · 着陆测试"></iframe>`;
  context.root.append(page);
  context.onDispose(() => page.remove());
  const select = page.querySelector('select')!, frame = page.querySelector('iframe')!;
  const flight = page.querySelector<HTMLButtonElement>('[data-flight]')!, takeoff = page.querySelector<HTMLButtonElement>('[data-takeoff]')!;
  const status = page.querySelector<HTMLElement>('.room-preview-status')!;
  frame.addEventListener('load', () => frame.focus(), { signal: context.signal });
  const play = (label: string, href: string): void => {
    status.textContent = `${label} · ${select.selectedOptions[0]!.textContent}`;
    frame.src = href;
  };
  const land = (): void => play('正在着陆', select.value === 'main-world' ? './?mode=game&landing=1' : `./?mode=game&level=facility&scene=${select.value}&landing=1`);
  select.addEventListener('change', () => { flight.disabled = takeoff.disabled = select.value === 'main-world'; }, { signal: context.signal });
  flight.addEventListener('click', () => {
    play('正在飞行', `./?mode=game&level=transit&flight=${select.value}`);
  }, { signal: context.signal });
  page.querySelector('[data-landing]')!.addEventListener('click', land, { signal: context.signal });
  // 关卡里出生点旁就停着开门的舱，走到舱门前确认即可起飞返回主世界。
  takeoff.addEventListener('click', () => play('起飞返回', `./?mode=game&level=facility&scene=${select.value}`), { signal: context.signal });
  // An empty frame reads as a broken page, so the lab opens straight into a landing.
  land();
}
