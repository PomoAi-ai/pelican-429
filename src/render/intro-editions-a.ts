import { backdrop, clamp, glow, line, MONO, room, seeded, SERIF, smooth, TAU, text, type EditionFrame } from './intro-edition-shared.ts';
import { claudeMilestoneAt } from '../config/intro-models.ts';

const GOLD = '#ebc785';
const CORAL = '#ef9c80';
const BLUE = '#a5b9ec';
type Point = readonly [number, number];

function fitted(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, maxWidth: number,
  color: string, font = MONO, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${size}px ${font}`;
  const actual = Math.min(size, size * maxWidth / ctx.measureText(value).width);
  text(ctx, value, x, y, actual, color, font, align);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, width = 1): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function note(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, tilt = 0): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, size * .34, size * .23, -.35, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(size * .29, 0); ctx.lineTo(size * .29, -size * 1.15);
  ctx.bezierCurveTo(size * .29, -size * .88, size * .86, -size * .91, size * .48, -size * .51);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * .075); ctx.stroke(); ctx.restore();
}

function ink(ctx: CanvasRenderingContext2D, points: readonly Point[], amount: number, color: string, width = 1): void {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * clamp(amount);
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const a = points[i]!; const b = points[i + 1]!; const fraction = Math.min(1, remaining / lengths[i]!);
    ctx.lineTo(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction); remaining -= lengths[i]!;
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function spotlight(frame: EditionFrame, x: number, strength: number, color: string): void {
  const { ctx, width: w, height: h } = frame;
  const light = ctx.createLinearGradient(x, 0, x, h * .86);
  light.addColorStop(0, `${color}04`); light.addColorStop(.8, `${color}22`); light.addColorStop(1, `${color}02`);
  ctx.save(); ctx.globalAlpha *= strength; ctx.fillStyle = light; ctx.beginPath();
  ctx.moveTo(w * .5, -h * .12); ctx.lineTo(x + w * .14, h * .84); ctx.lineTo(x - w * .14, h * .84); ctx.closePath(); ctx.fill();
  glow(ctx, x, h * .72, w * .12, `${color}20`); ellipse(ctx, x, h * .83, w * .12, h * .013, `${color}32`); ctx.restore();
}

function melodyInstrument(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, kind: number, color: string, progress: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha *= progress;
  if (kind === 0) {
    ink(ctx, [[-54, 45], [-40, 2], [-47, -34], [-25, -67], [-5, -75], [30, -48], [21, -13], [42, 11], [42, 45], [-54, 45]], 1, color, 1.7);
    line(ctx, [[-18, -61], [4, 44]], color, 1.2);
    for (let j = 0; j < 7; j++) { const ly = -40 + j * 12; text(ctx, j % 2 ? 'la' : '♪', -23 + Math.sin(j) * 8, ly, 11, color, SERIF); }
  } else if (kind === 1) {
    ink(ctx, [[-69, 33], [-69, 9], [-56, -5], [-5, -63], [58, -54], [69, -8], [61, 32], [-69, 33]], 1, color, 1.7);
    line(ctx, [[-69, 18], [62, 18], [62, 34]], color, 1.2);
    for (let j = 0; j < 16; j++) line(ctx, [[-64 + j * 8, 19], [-64 + j * 8, 32]], color, .8);
    line(ctx, [[-57, 34], [-59, 52]], color, 2); line(ctx, [[48, 34], [51, 52]], color, 2);
    text(ctx, '{ }', -5, -16, 27, color, MONO, 'center');
  } else {
    ink(ctx, [[-41, 45], [-25, -65], [32, -79], [54, -58], [43, 45], [-41, 45]], 1, color, 1.7);
    for (let j = 0; j < 8; j++) line(ctx, [[-19 + j * 8, -62 - Math.sin(j / 8 * Math.PI) * 12], [-30 + j * 10, 42]], color, .8);
    text(ctx, '∞', 9, 65, 20, color, SERIF, 'center');
  }
  ctx.restore();
}

function melodyFinale(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p } = frame;
  const reveal = smooth(.9, .995, p);
  if (reveal <= 0) return;
  ctx.save(); ctx.globalAlpha = 1;
  const spread = w * (.01 + reveal * 1.15);
  ctx.beginPath(); ctx.moveTo(w * .5, -h * .2); ctx.lineTo(w * .5 + spread, h * 1.2); ctx.lineTo(w * .5 - spread, h * 1.2); ctx.closePath(); ctx.clip();
  ctx.fillStyle = '#080c12'; ctx.fillRect(0, 0, w, h); room(frame, reveal); ctx.restore();
  if (p >= .99) { ctx.save(); ctx.globalAlpha = smooth(.99, 1, p); ctx.fillStyle = '#080c12'; ctx.fillRect(0, 0, w, h); room(frame, 1); ctx.restore(); }
}

export function drawMelody(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: seconds } = frame;
  backdrop(frame);
  const stageFade = 1 - smooth(.91, .98, p);
  ctx.save(); ctx.globalAlpha = stageFade;
  const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#111d33'); sky.addColorStop(.68, '#090c16'); sky.addColorStop(1, '#211811');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  for (let j = 0; j < 28; j++) {
    const x = seeded(j + 15) * w; const y = seeded(j + 76) * h * .72;
    ctx.globalAlpha = stageFade * (.1 + Math.sin(seconds * .5 + j) ** 2 * .25); ctx.fillStyle = GOLD;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.globalAlpha = stageFade;
  const beat = Math.max(0, Math.sin(seconds * (3.7 + p * 4))) ** 9;
  const active = Math.min(2, Math.floor(clamp((p - .12) / .58) * 3));
  const claude = claudeMilestoneAt(p);
  const colors = [GOLD, CORAL, BLUE]; const models = ['GPT', claude, 'GEMINI 3'];
  const skills = ['LANGUAGE', p < .64 ? 'COMPOSITION' : 'IMAGINATION', 'PERCEPTION'];
  for (let i = 0; i < 3; i++) {
    const birth = smooth(.08 + i * .19, .17 + i * .19, p); const x = w * (.22 + i * .28);
    spotlight(frame, x, birth * (active === i || p > .72 ? .8 + beat * .2 : .25), colors[i]!);
    melodyInstrument(ctx, x, h * .70, Math.min(w / 550, h / 420), i, colors[i]!, smooth(.46 + i * .07, .6 + i * .07, p));
    ctx.globalAlpha = stageFade * birth;
    fitted(ctx, models[i]!, x, h * .84, Math.min(22, w / 27), w * .26, colors[i]!, SERIF);
    text(ctx, skills[i]!, x, h * .88, Math.min(10, w / 50), `${colors[i]}aa`, MONO, 'center');
  }
  ctx.globalAlpha = stageFade;
  text(ctx, 'PASS THE MELODY', w * .5, h * .14, Math.min(57, w / 12), '#f6e8ce', SERIF, 'center');
  text(ctx, p < .7 ? 'A SINGLE NOTE FINDS ANOTHER VOICE' : 'NO VOICE PLAYS ALONE', w * .5, h * .195, Math.min(11, w / 40), '#beaf98', MONO, 'center');
  const mainAlpha = smooth(.035, .09, p) * (1 - smooth(.72, .8, p));
  ctx.globalAlpha = stageFade * mainAlpha;
  const model = p < .30 ? 'GPT' : p >= .54 && p < .64 ? 'Gemini 3' : claude;
  fitted(ctx, model, w * .5, h * .36, Math.min(40, w / 12), w * .86, colors[active]!, SERIF);
  if (p >= .65) text(ctx, 'IMAGINATION FINDS FORM', w * .5, h * .405, Math.min(14, w * .031), CORAL, MONO, 'center');
  ctx.globalAlpha = stageFade;
  const pass = clamp((p - .08) / .7); const mx = w * (.19 + pass * .62); const my = h * (.51 - Math.sin(pass * Math.PI * 3) * .055);
  const bandAlpha = smooth(.1, .25, p);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(w * .07, h * .51 + i * 7);
    ctx.bezierCurveTo(w * .31, h * .32 + i * 7, w * .62, h * .69 + i * 7, w * .94, h * .43 + i * 7);
    ctx.strokeStyle = `rgba(225,190,128,${bandAlpha * .14})`; ctx.lineWidth = .7; ctx.stroke();
  }
  glow(ctx, mx, my, Math.min(w * .11, 110), `${colors[active]}25`);
  note(ctx, mx, my, Math.min(43, w / 15) * (1 + beat * .12), colors[active]!, -.12 + Math.sin(seconds * .6) * .16);
  const count = Math.floor(smooth(.3, .85, p) * 28);
  for (let i = 0; i < count; i++) {
    const u = (i / 28 + seconds * .024) % 1; const x = w * (.09 + .83 * u);
    const y = h * (.51 + Math.sin(u * TAU + seconds * .13) * .065) + (i % 3 - 1) * 13;
    ctx.globalAlpha = stageFade * Math.sin(u * Math.PI) * .7;
    note(ctx, x, y, Math.min(16, w / 40), colors[i % 3]!, -.12);
  }
  ctx.globalAlpha = stageFade * smooth(.7, .78, p);
  text(ctx, 'DEEPSEEK  /  LLAMA  /  QWEN', w * .5, h * .945, Math.min(11, w / 40), '#a59e91', MONO, 'center');
  const batonX = w * .5 + Math.sin(seconds * 2.5) * w * .025;
  line(ctx, [[batonX - w * .035, h * .975], [batonX + Math.cos(seconds * 2.5) * w * .026, h * .92]], '#f4deaf', 2);
  const finale = smooth(.775, .805, p) * (1 - smooth(.9, .95, p));
  ctx.save(); ctx.globalAlpha = stageFade * finale;
  spotlight(frame, w * .5, 1, '#ffe1a0');
  glow(ctx, w * .5, h * .365, Math.min(w, h) * .27, '#ffd87a20');
  text(ctx, 'GPT-6 ASTRA', w * .5, h * .36, Math.min(44, w * .074), '#ffe5a5', SERIF, 'center');
  note(ctx, w * .5, h * .46, Math.min(34, w * .067), '#ffe5a5', -.12);
  ctx.restore();
  ctx.restore(); melodyFinale(frame);
}

function blueprint(ctx: CanvasRenderingContext2D, p: number, seconds: number): void {
  const graphite = '#556b68'; const rust = '#af6545'; const soft = '#a0aaa0';
  ink(ctx, [[55, 475], [55, 80], [760, 80], [910, 0], [910, 398], [760, 475], [55, 475], [205, 397], [910, 398]], smooth(.09, .34, p), soft, 1.2);
  ink(ctx, [[760, 80], [760, 475]], smooth(.17, .31, p), soft, 1.2);
  ink(ctx, [[115, 136], [380, 136], [380, 355], [115, 355], [115, 136]], smooth(.18, .35, p), graphite, 3);
  ink(ctx, [[247, 136], [247, 355]], smooth(.28, .36, p), graphite, 2);
  ink(ctx, [[115, 245], [380, 245]], smooth(.28, .36, p), graphite, 2);
  const colorIn = smooth(.56, .79, p);
  ctx.save(); ctx.globalAlpha = colorIn; const windowLight = ctx.createLinearGradient(115, 135, 380, 355);
  windowLight.addColorStop(0, '#86bfc6'); windowLight.addColorStop(1, '#c7d4c6'); ctx.fillStyle = windowLight; ctx.fillRect(119, 140, 125, 102); ctx.fillRect(251, 140, 125, 102); ctx.fillRect(119, 248, 125, 103); ctx.fillRect(251, 248, 125, 103);
  for (let i = 0; i < 22; i++) {
    const x = 122 + seeded(i + 29) * 245; const y = 144 + (seeded(i) * 204 + seconds * 18) % 202;
    line(ctx, [[x, y], [x - 4, y + 10]], '#f5f1e2', 1.3);
  }
  ctx.restore();
  ink(ctx, [[352, 366], [757, 366], [835, 405], [425, 405], [352, 366]], smooth(.30, .48, p), rust, 3);
  ink(ctx, [[367, 375], [367, 508], [380, 514], [380, 383]], smooth(.38, .51, p), graphite, 2);
  ink(ctx, [[805, 406], [805, 528], [792, 536], [792, 407]], smooth(.38, .51, p), graphite, 2);
  ink(ctx, [[465, 216], [688, 216], [688, 340], [465, 340], [465, 216]], smooth(.39, .55, p), graphite, 3);
  ink(ctx, [[572, 341], [572, 365], [550, 367], [606, 367]], smooth(.45, .55, p), graphite, 2);
  ctx.save(); ctx.globalAlpha = colorIn; ctx.fillStyle = '#243f46'; ctx.fillRect(470, 221, 213, 114);
  for (let i = 0; i < 6; i++) line(ctx, [[484 + i % 2 * 12, 239 + i * 13], [520 + seeded(i + 2) * 130, 239 + i * 13]], i % 2 ? '#bfbd86' : '#89c3b5', 2);
  ctx.restore();
  ink(ctx, [[702, 332], [750, 332], [772, 344], [772, 368], [724, 368], [702, 355], [702, 332]], smooth(.45, .59, p), graphite, 2);
  ink(ctx, [[702, 332], [724, 344], [772, 344]], smooth(.49, .59, p), graphite, 1);
  ink(ctx, [[485, 386], [629, 386], [609, 373], [465, 373], [485, 386]], smooth(.51, .65, p), graphite, 1.5);
  ink(ctx, [[515, 436], [515, 379], [595, 379], [605, 451], [525, 451], [515, 436]], smooth(.52, .67, p), rust, 3);
  ink(ctx, [[525, 452], [570, 475], [625, 460], [605, 451]], smooth(.57, .69, p), rust, 2);
  ink(ctx, [[572, 475], [572, 530], [545, 547], [598, 534]], smooth(.6, .71, p), graphite, 2);
  ctx.save(); ctx.globalAlpha = smooth(.68, .76, p);
  ellipse(ctx, 243, 246, 169, 130, '#94b3ad66');
  for (let j = 0; j < 24; j++) { const x = 355 + j * 18; const y = 563; const amplitude = Math.sin(j * .75 + seconds * 3) * (5 + Math.sin(j * .4) * 6); line(ctx, [[x, y - amplitude], [x, y + amplitude]], '#6d9e99', 1.5); }
  ctx.restore();
}

function draftingMarks(frame: EditionFrame): void {
  const { ctx, width: w, height: h } = frame;
  ctx.strokeStyle = '#6371680c'; ctx.lineWidth = .6;
  const grid = Math.max(24, w / 40);
  for (let x = w % grid; x < w; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = h % grid; y < h; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const m = Math.min(28, w * .06);
  for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) {
    line(ctx, [[x! - 7, y!], [x! + 7, y!]], '#798c8066'); line(ctx, [[x!, y! - 7], [x!, y! + 7]], '#798c8066');
  }
}

export function drawWorld(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds } = frame;
  backdrop(frame); draftingMarks(frame);
  const titleSize = Math.min(66, w / 10.7);
  text(ctx, 'A WORLD WRITTEN', w * .5, h * .145, titleSize, '#334a45', SERIF, 'center');
  text(ctx, 'FROM A SENTENCE TO A PLACE', w * .5, h * .198, Math.min(11, w / 37), '#7c8577', MONO, 'center');
  const size = Math.min(w * .89 / 950, h * .58 / 600); const originX = w * .5 - size * 480; const originY = h * .27;
  ctx.save(); ctx.translate(originX, originY); ctx.scale(size, size); blueprint(ctx, p, seconds); ctx.restore();
  ctx.save(); ctx.globalAlpha = smooth(.75, .79, p) * (1 - smooth(.9, .96, p));
  const inscriptionX = originX + size * 568; const inscriptionY = originY + size * 151;
  glow(ctx, inscriptionX, inscriptionY, size * 135, '#d8ac5133');
  text(ctx, 'GPT-6 ASTRA', inscriptionX, inscriptionY, Math.min(26, w * .044), '#9e6b20', SERIF, 'center');
  line(ctx, [[originX + size * 407, inscriptionY + 9], [originX + size * 729, inscriptionY + 9]], '#ba913f', 1.2);
  ctx.restore();
  const message = p < .24 ? 'let there be a room;' : p < .43 ? 'const window = light.open();' : p < .61 ? 'await world.build();' : p < .78 ? 'await world.comeAlive();' : 'a place to begin.';
  ctx.save(); ctx.globalAlpha = smooth(.02, .075, p) * (1 - smooth(.89, .95, p));
  text(ctx, message, w * .5, h * .865, Math.min(22, w / 21), '#98664d', MONO, 'center'); ctx.restore();
  const entries = [
    { label: 'GPT', line: 'DESCRIBE', start: .055, x: .18 },
    { label: claudeMilestoneAt(p),
      line: p < .64 ? 'CLAUDE CODE' : 'IMAGINE + BUILD', start: .26, x: .5 },
    { label: 'GEMINI 3', line: 'SEE + HEAR', start: .5, x: .82 },
  ];
  for (const entry of entries) {
    ctx.save(); ctx.globalAlpha = smooth(entry.start, entry.start + .06, p);
    fitted(ctx, entry.label, w * entry.x, h * .26, Math.min(17, w / 30), w * .29, '#425a53', SERIF);
    text(ctx, entry.line, w * entry.x, h * .29, Math.min(9, w / 48), '#9a6c55', MONO, 'center'); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = smooth(.73, .8, p);
  text(ctx, 'DEEPSEEK  ·  LLAMA  ·  QWEN', w * .5, h * .94, Math.min(10, w / 41), '#808878', MONO, 'center'); ctx.restore();
  const opening = smooth(.9, .995, p);
  if (opening > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * opening, h); ctx.clip();
    ctx.fillStyle = '#090d11'; ctx.fillRect(0, 0, w, h); room(frame, 1); ctx.restore();
    ctx.save(); ctx.globalAlpha = 1 - opening; line(ctx, [[w * opening, 0], [w * opening, h]], '#b97951', 2); ctx.restore();
  }
}

function piano(frame: EditionFrame, y: number, keyHeight: number): void {
  const { ctx, width: w, progress: p, seconds } = frame;
  const count = 28; const left = w * .04; const keyWidth = w * .92 / count;
  const beat = Math.floor(seconds * (2.8 + p * 3));
  for (let i = 0; i < count; i++) {
    const playing = p > .08 && (i === beat * 5 % count || (p > .5 && i === (beat * 3 + 8) % count));
    const shift = playing ? keyHeight * .1 : 0;
    ctx.fillStyle = playing ? '#f5bc76' : '#e7d8bd'; ctx.fillRect(left + i * keyWidth, y + shift, keyWidth - 1, keyHeight - shift);
    ctx.fillStyle = '#827064'; ctx.fillRect(left + i * keyWidth, y + keyHeight - 5, keyWidth - 1, 5);
    if (![2, 6].includes(i % 7)) {
      ctx.fillStyle = '#261b28'; ctx.fillRect(left + (i + .69) * keyWidth, y, keyWidth * .58, keyHeight * .62);
      ctx.fillStyle = '#4b3543'; ctx.fillRect(left + (i + .75) * keyWidth, y + 2, keyWidth * .44, keyHeight * .44);
    }
  }
}

function jazzWave(frame: EditionFrame, birth: number): void {
  const { ctx, width: w, height: h, seconds, progress: p } = frame;
  ctx.save(); ctx.globalAlpha = birth;
  const x = w * .77; const y = h * .49; const radius = Math.min(w * .19, h * .22);
  glow(ctx, x, y, radius * 1.5, '#f5a5660c');
  for (let ring = 0; ring < 3; ring++) {
    ctx.beginPath();
    for (let j = 0; j <= 150; j++) {
      const a = j / 150 * TAU; const pulse = Math.sin(a * (3 + ring) + seconds * (1.2 + p)) * radius * .05;
      const r = radius * (.55 + ring * .14) + pulse; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r;
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = ['#efa068aa', '#d2889a88', '#a99ccc88'][ring]!; ctx.lineWidth = 1.5; ctx.stroke();
  }
  text(ctx, 'GEMINI 3', x, y + 5, Math.min(21, w / 24), '#f2c48c', SERIF, 'center');
  text(ctx, 'LISTEN / SEE', x, y + Math.min(25, w / 17), Math.min(10, w / 47), '#c19499', MONO, 'center');
  ctx.restore();
}

function jazzDisc(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p } = frame;
  const reveal = smooth(.9, 1, p);
  if (reveal <= 0) return;
  const x = w * .77; const y = h * .49; const radius = Math.hypot(w, h) * reveal;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.clip();
  ctx.fillStyle = '#080c12'; ctx.fillRect(0, 0, w, h); room(frame, 1); ctx.restore();
  ctx.save(); ctx.globalAlpha = 1 - reveal; ellipse(ctx, x, y, radius, radius, '#f9c581', 3); ellipse(ctx, x, y, radius + 8, radius + 8, '#ba758b', 1); ctx.restore();
}

export function drawJazz(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds } = frame;
  backdrop(frame);
  const light = ctx.createLinearGradient(0, h, w, 0); light.addColorStop(0, '#301426'); light.addColorStop(.6, '#27142d'); light.addColorStop(1, '#6d3939');
  ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
  glow(ctx, w * .78, h * .31, w * .4, '#e6954719');
  ctx.save(); ctx.globalAlpha = .2;
  for (let j = 0; j < 30; j++) { const x = j * w / 29; line(ctx, [[x, 0], [x, h * .77]], '#a7798822', 1); }
  ctx.restore();
  const size = Math.min(74, w / 7.7); const left = w * .085;
  text(ctx, 'TERMINAL', left, h * .175, size, '#f7d6a0', SERIF);
  text(ctx, 'JAM', left, h * .175 + size * .85, size * 1.05, '#f39679', SERIF);
  text(ctx, 'WRITE IT. PLAY IT.', left, h * .175 + size * 1.32, Math.min(11, w / 37), '#bc8d96', MONO);
  const gptVisible = smooth(.055, .12, p);
  ctx.save(); ctx.globalAlpha = gptVisible;
  const gptX = w * .105; const gptY = h * .43;
  text(ctx, 'GPT', gptX, gptY, Math.min(26, w / 19), '#f8ce89', SERIF);
  text(ctx, p < .3 ? 'hello, world' : 'say it again', gptX, gptY + Math.min(27, h * .045), Math.min(13, w / 33), '#d7ac80', MONO);
  ctx.restore();
  const claudeVisible = smooth(.27, .35, p);
  ctx.save(); ctx.globalAlpha = claudeVisible;
  const soloist = claudeMilestoneAt(p);
  fitted(ctx, soloist, left, h * .61, Math.min(p < .64 ? 27 : 33, w / 19), w * .48, '#f19a83', SERIF, 'left');
  text(ctx, p < .51 ? 'play(answer);' : p < .64 ? 'again, with feeling();' : 'imagine, then play();', left, h * .66,
    Math.min(14, w / 34), '#c995a7', MONO);
  ctx.restore();
  jazzWave(frame, smooth(.43, .55, p));
  for (let j = 0; j < 5; j++) {
    ctx.beginPath(); ctx.moveTo(w * .02, h * .725 + j * 5);
    ctx.bezierCurveTo(w * .30, h * .73 + j * 5, w * .58, h * .67 + j * 5, w * .98, h * .73 + j * 5);
    ctx.strokeStyle = '#e6ac7722'; ctx.lineWidth = .8; ctx.stroke();
  }
  const swingTime = seconds * (.16 + p * .05);
  for (let i = 0; i < 18; i++) {
    const birth = smooth(.1 + i * .03, .15 + i * .03, p); const u = (swingTime + i * .093) % 1;
    const x = w * (.04 + .92 * u); const lift = Math.sin(u * Math.PI) * (h * (.025 + i % 3 * .012));
    ctx.save(); ctx.globalAlpha = birth * Math.sin(u * Math.PI) * .8;
    note(ctx, x, h * .748 - lift, Math.min(19, w / 30), [GOLD, CORAL, BLUE][i % 3]!, Math.sin(seconds * 3 + i) * .18); ctx.restore();
  }
  piano(frame, h * .8, h * .115);
  const baseline = h * .97;
  text(ctx, p < .65 ? 'LIVE AT THE TERMINAL' : 'DEEPSEEK  /  LLAMA  /  QWEN', w * .5, baseline, Math.min(11, w / 41), '#ae7c85', MONO, 'center');
  ctx.save(); ctx.globalAlpha = smooth(.75, .79, p) * (1 - smooth(.9, .95, p));
  const solo = ctx.createLinearGradient(0, h * .34, 0, h * .81);
  solo.addColorStop(0, '#ffd57300'); solo.addColorStop(1, '#ffd57333'); ctx.fillStyle = solo;
  ctx.beginPath(); ctx.moveTo(w * .32, h * .34); ctx.lineTo(w * .65, h * .34);
  ctx.lineTo(w * .512, h * .8); ctx.lineTo(w * .477, h * .8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffdf89'; ctx.fillRect(w * .477, h * .81, w * .033, h * .093);
  glow(ctx, w * .493, h * .8, Math.min(w, h) * .11, '#ffe7aa48');
  text(ctx, 'GPT-6 ASTRA', w * .51, h * .34, Math.min(29, w * .054), '#ffe6a5', SERIF, 'center');
  note(ctx, w * .493, h * .72, Math.min(29, w * .052), '#ffdc83', -.2);
  ctx.restore();
  jazzDisc(frame);
}
