type Measure = { phase: string; completed?: number; total?: number };

const LINE = '#8ca3ad';
const DONE = '#b6dc9a';
const FAILED = '#e0584a';
// 一个阶段一小节；计数阶段最多写 8 个音，再多按比例填，避免音符挤成一团。
const MAX_BEATS = 8;
// 预留空小节，避免第一个阶段就把整行谱占满，看起来像快加载完了。
const MIN_MEASURES = 4;
// 自下线起按半个线距计的音高，循环成一段平缓的旋律。
const MELODY = [2, 4, 6, 5, 3, 5, 7, 6];

export function createSceneLoading(parent: HTMLElement, retry: () => void) {
  const root = document.createElement('div');
  root.className = 'scene-loading';
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="scene-loading-copy"><h2></h2><p role="status" aria-live="polite"></p><button type="button" hidden>重新加载</button><small>加载期间可直接选择其他场景</small></div>`;
  parent.append(root);
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const title = root.querySelector('h2')!;
  const detail = root.querySelector('p')!;
  const button = root.querySelector('button')!;
  button.addEventListener('click', retry);
  // 已写下的阶段一直留在谱上；同名阶段交替上报时更新原小节，不另起一节。
  let measures: Measure[] = [];
  let current = -1;
  let failed = false;
  let frame = 0;
  const draw = (now: number): void => {
    const ratio = Math.min(devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gap = 9;
    const staff = Math.min(520, width * .78);
    const left = (width - staff) / 2;
    const bottom = height / 2 + gap * 2;
    const beatsOf = (measure: Measure): number =>
      measure.total !== undefined && measure.total > 0 ? Math.min(measure.total, MAX_BEATS) : 1;
    // 小节宽度按拍数分配（两侧各留半拍），音符间距在各小节里一致。
    const widths = measures.map(measure => beatsOf(measure) + 1);
    for (let slot = measures.length; slot < MIN_MEASURES; slot++) widths.push(2);
    const unit = staff / widths.reduce((sum, value) => sum + value, 0);
    const starts = widths.map((_, index) => left + widths.slice(0, index).reduce((sum, value) => sum + value, 0) * unit);
    ctx.lineCap = 'round';
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.globalAlpha = .45;
    ctx.beginPath();
    for (let line = 0; line < 5; line++) {
      ctx.moveTo(left, bottom - line * gap); ctx.lineTo(left + staff, bottom - line * gap);
    }
    for (const x of [...starts, left + staff]) { ctx.moveTo(x, bottom); ctx.lineTo(x, bottom - gap * 4); }
    ctx.stroke();
    const breath = .55 + .45 * Math.sin(now / 320);
    let pitch = 0;
    for (const [index, measure] of measures.entries()) {
      const counted = measure.total !== undefined && measure.total > 0;
      const beats = beatsOf(measure);
      // 不计数的阶段没有中间值，等后面的阶段开始才算写完。
      const filled = counted ? Math.floor(measure.completed! / measure.total! * beats) : index === current ? 0 : 1;
      for (let beat = 0; beat < beats; beat++) {
        const x = starts[index]! + (beat + 1) * unit;
        const step = MELODY[pitch++ % MELODY.length]!;
        const y = bottom - step * gap / 2;
        const done = beat < filled;
        const active = index === current && beat === filled;
        const color = active && failed ? FAILED : done || active ? DONE : LINE;
        ctx.globalAlpha = done ? .95 : active ? (failed ? .95 : breath) : .3;
        ctx.fillStyle = color; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, gap * .62, gap * .42, -.35, 0, Math.PI * 2);
        if (done) ctx.fill(); else { ctx.lineWidth = 1.2; ctx.stroke(); }
        // 中线以下符干朝上，以上朝下，与手写谱一致。
        const up = step < 4;
        const stemX = x + (up ? gap * .55 : -gap * .55);
        ctx.lineWidth = 1.1; ctx.beginPath();
        ctx.moveTo(stemX, y); ctx.lineTo(stemX, y + (up ? -gap * 3.3 : gap * 3.3)); ctx.stroke();
        if (active && !failed) {
          ctx.globalAlpha = breath * .5; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, bottom + gap * 1.2); ctx.lineTo(x, bottom - gap * 5.2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    if (!failed) frame = requestAnimationFrame(draw);
  };
  return {
    show(name: string): void {
      root.hidden = false; title.textContent = name; button.hidden = true;
      detail.textContent = '准备场景'; measures = []; current = -1; failed = false;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
    },
    progress(phase: string, completed?: number, total?: number): void {
      detail.textContent = total === undefined ? phase : `${phase} · ${completed} / ${total}`;
      current = measures.findIndex(measure => measure.phase === phase);
      if (current < 0) current = measures.push({ phase }) - 1;
      measures[current]!.completed = completed; measures[current]!.total = total;
    },
    error(error: unknown): void {
      detail.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`;
      button.hidden = false; failed = true;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
    },
    hide(): void { root.hidden = true; cancelAnimationFrame(frame); },
    dispose(): void { cancelAnimationFrame(frame); root.remove(); },
  };
}
