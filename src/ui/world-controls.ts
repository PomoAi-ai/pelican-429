import {
  DAY_SECONDS, MOON_PHASE_NAMES, SEASON_NAMES, calendarOf, dayOf, moonPhase, sunriseSecond, sunsetSecond, timeFromReal,
  type GameTime,
} from '../core/calendar.ts';

export const clock = (second: number): string =>
  `${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor(second / 60) % 60).padStart(2, '0')}`;

export const WORLD_CONTROLS = `
  <details class="world-controls">
    <summary>世界控制 <output data-world-time>10:00</output></summary>
    <div class="world-controls-panel">
      <div class="world-controls-heading"><strong data-world-date></strong><span data-world-phase></span></div>
      <p data-world-sun></p>
      <label class="world-time-slider">世界时间
        <input data-world-minute type="range" min="0" max="1439" step="1" value="600" aria-label="世界时间" />
      </label>
      <div class="world-time-scale" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>
      <div class="world-time-presets" role="group" aria-label="选择时段">
        <button type="button" data-world-preset="rise">日出</button>
        <button type="button" data-world-preset="noon">正午</button>
        <button type="button" data-world-preset="set">日落</button>
        <button type="button" data-world-preset="night">星夜</button>
      </div>
      <div class="world-cycle-row">
        <label>季节 <select data-world-season aria-label="季节">
          ${SEASON_NAMES.map((name, index) => `<option value="${index}">${name}</option>`).join('')}
        </select></label>
        <label>第 <select data-world-day aria-label="季内第几天">
          ${Array.from({ length: 24 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('')}
        </select> 天</label>
      </div>
      <div class="world-cycle-row">
        <button type="button" data-world-running aria-pressed="true">暂停</button>
        <label>倍率 <select data-world-speed aria-label="时间倍率">
          <option value="1" selected>×1</option><option value="6">×6</option><option value="12">×12</option>
        </select></label>
      </div>
      <p>打开页面时取真实日期与时刻；拖动时间即可定格观察，×1 时一天 24 分钟。</p>
    </div>
  </details>`;

/** 展示场的观察时间由面板持有；调用方每帧 advance，场景只读 time。 */
export function bindWorldControls(root: HTMLElement) {
  const now = new Date();
  const time: GameTime = timeFromReal(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
  const slider = root.querySelector<HTMLInputElement>('[data-world-minute]')!;
  const output = root.querySelector<HTMLOutputElement>('[data-world-time]')!;
  const date = root.querySelector<HTMLElement>('[data-world-date]')!;
  const phase = root.querySelector<HTMLElement>('[data-world-phase]')!;
  const sun = root.querySelector<HTMLElement>('[data-world-sun]')!;
  const season = root.querySelector<HTMLSelectElement>('[data-world-season]')!;
  const dayOfSeason = root.querySelector<HTMLSelectElement>('[data-world-day]')!;
  const running = root.querySelector<HTMLButtonElement>('[data-world-running]')!;
  let playing = true;
  let speed = 1;
  let carry = 0;
  let shown = -1;
  const render = (): void => {
    const key = time.day * 1440 + Math.floor(time.second / 60);
    if (key === shown) return;
    shown = key;
    const c = calendarOf(time.day);
    const rise = sunriseSecond(time.day);
    const set = sunsetSecond(time.day);
    const s = time.second;
    output.value = clock(s);
    slider.value = String(Math.floor(s / 60));
    slider.setAttribute('aria-valuetext', output.value);
    date.textContent = `第 ${c.year} 年 · ${SEASON_NAMES[c.season]}季 · 第 ${c.dayOfSeason} 天`;
    phase.textContent = Math.abs(s - rise) < 3600 ? '黎明' : Math.abs(s - set) < 3600 ? '黄昏' : s > rise && s < set ? '白昼' : '星夜';
    sun.textContent = `日出 ${clock(rise)} · 日落 ${clock(set)} · ${MOON_PHASE_NAMES[moonPhase(time)]}`;
    season.value = String(c.season);
    dayOfSeason.value = String(c.dayOfSeason);
  };
  const setRunning = (next: boolean): void => {
    playing = next;
    running.textContent = playing ? '暂停' : '继续';
    running.setAttribute('aria-pressed', String(playing));
  };
  const setSecond = (second: number): void => { time.second = second; carry = 0; setRunning(false); render(); };
  const presets: Record<string, () => number> = {
    rise: () => sunriseSecond(time.day),
    noon: () => Math.round((sunriseSecond(time.day) + sunsetSecond(time.day)) / 120) * 60,
    set: () => sunsetSecond(time.day),
    night: () => 0,
  };
  slider.addEventListener('input', () => setSecond(Number(slider.value) * 60));
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-world-preset]')) {
    button.addEventListener('click', () => setSecond(presets[button.dataset.worldPreset!]!()));
  }
  const setDate = (): void => {
    time.day = dayOf(calendarOf(time.day).year, Number(season.value), Number(dayOfSeason.value));
    render();
  };
  season.addEventListener('change', setDate);
  dayOfSeason.addEventListener('change', setDate);
  running.addEventListener('click', () => setRunning(!playing));
  root.querySelector<HTMLSelectElement>('[data-world-speed]')!.addEventListener('change', event => {
    speed = Number((event.target as HTMLSelectElement).value);
  });
  setRunning(true);
  render();
  return {
    time: time as Readonly<GameTime>,
    advance(dt: number): void {
      if (playing) {
        // ×1 时 1 实秒 = 60 游戏秒，与家园一天 24 分钟一致。
        carry += dt * 60 * speed;
        const whole = Math.floor(carry);
        carry -= whole;
        const total = time.second + whole;
        time.day += Math.floor(total / DAY_SECONDS);
        time.second = total % DAY_SECONDS;
      }
      render();
    },
  };
}
