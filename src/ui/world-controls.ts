import type { createWorldClock } from '../core/world-clock.ts';

export const WORLD_CONTROLS = `
  <details class="world-controls">
    <summary>世界控制 <output data-world-time>10:00</output></summary>
    <div class="world-controls-panel">
      <div class="world-controls-heading"><strong>24 小时昼夜</strong><span data-world-phase>白昼</span></div>
      <label class="world-time-slider">世界时间
        <input data-world-hour type="range" min="0" max="24" step="0.05" value="10" aria-label="世界时间" />
      </label>
      <div class="world-time-scale" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>
      <div class="world-time-presets" role="group" aria-label="选择时段">
        <button type="button" data-world-preset="6">日出</button>
        <button type="button" data-world-preset="12">正午</button>
        <button type="button" data-world-preset="18">日落</button>
        <button type="button" data-world-preset="0">星夜</button>
      </div>
      <div class="world-cycle-row">
        <button type="button" data-world-running aria-pressed="true">暂停循环</button>
        <label>一天时长 <select data-world-speed aria-label="一天时长">
          <option value="120">2 分钟</option><option value="720" selected>12 分钟</option><option value="1440">24 分钟</option>
        </select></label>
      </div>
      <p>拖动时间即可定格观察；开启循环后，日月与灯光同步变化。</p>
    </div>
  </details>`;

export function bindWorldControls(root: HTMLElement, clock: ReturnType<typeof createWorldClock>) {
  const slider = root.querySelector<HTMLInputElement>('[data-world-hour]')!;
  const time = root.querySelector<HTMLOutputElement>('[data-world-time]')!;
  const phase = root.querySelector<HTMLElement>('[data-world-phase]')!;
  const running = root.querySelector<HTMLButtonElement>('[data-world-running]')!;
  let lastMinute = -1;
  const update = (): void => {
    const minute = Math.floor(clock.hour * 60);
    if (lastMinute !== minute) {
      lastMinute = minute;
      time.value = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      slider.value = String(clock.hour);
      slider.setAttribute('aria-valuetext', time.value);
      phase.textContent = clock.hour < 5 || clock.hour >= 20 ? '星夜' : clock.hour < 7 ? '黎明' : clock.hour < 17 ? '白昼' : '黄昏';
    }
    running.textContent = clock.running ? '暂停循环' : '开启循环';
    running.setAttribute('aria-pressed', String(clock.running));
  };
  const setHour = (hour: number): void => { clock.setHour(hour); clock.setRunning(false); update(); };
  slider.addEventListener('input', () => setHour(Number(slider.value)));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-world-preset]')) {
    button.addEventListener('click', () => setHour(Number(button.dataset.worldPreset)));
  }
  running.addEventListener('click', () => { clock.setRunning(!clock.running); update(); });
  root.querySelector<HTMLSelectElement>('[data-world-speed]')!.addEventListener('change', event => {
    clock.setDaySeconds(Number((event.target as HTMLSelectElement).value));
  });
  update();
  return { update };
}
