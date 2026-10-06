import {
  FINALE_CUES as C, FINALE_LINEAGE, FINALE_TOKEN_RECORDS, FINALE_UNDERTONE, LINEAGE_WEIGHT, tokenLabel,
} from '../config/intro-finale.ts';
import { clamp, glow, MONO, smooth, type EditionFrame, type ScoreFrame } from './intro-edition-shared.ts';
import { CYAN, GOLD, IVORY, STORM, envelope, hit, label, mix, note, star, type Point } from './intro-finale-geometry.ts';
import { goneAt, tornLabel } from './intro-finale-storm.ts';

/** 同一小节里的名字在谱线上下交替分四层，才不会叠在一起。 */
const TIERS = [-1.75, 1.2, -2.75, 2.2] as const;
/**
 * 主谱线在 7–12 秒折成电路，九段里偶数段是水平的：每个 bar 对应其中一段，同段的音符均分这一段，
 * 折线时名字不会落在竖段上叠成一摞。
 */
const SLOTS = FINALE_LINEAGE.map((entry) => {
  const mates = FINALE_LINEAGE.filter(({ bar }) => bar === entry.bar);
  const k = mates.indexOf(entry);
  return { u: (2 * entry.bar + (k + .5) / mates.length) / 9, tier: TIERS[k]! };
});
/** token 光点在两个音符之间先停住，最后一拍才跳过去。 */
const HOP = .5;
/** 被雷击打回的那一跳更快，像被一把甩回去。 */
const BACK = .3;

/**
 * 模型谱系：每个模型在自己的发布拍点跳上主谱线。主旋律的音符最大、名字一直亮到风暴来临，
 * 里程碑的名字常驻到第二幕后半。
 * 一颗 token 光点在相邻音符之间按抛物线跳过去，落点与下一个音符同拍；上下文纪录刷新时数字放大并标出倍数。
 * 风暴里每劈一次，token 就退回上一个纪录，那之后的模型全部变灰：被降智，就是被打回过去。
 * staff 是主谱线本身的坐标，所以音符跟着谱线展开、折成电路、被风暴撕裂和坠落。
 */
export function lineage(f: ScoreFrame, staff: (u: number) => Point): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < FINALE_LINEAGE[0]!.at - HOP || t >= C.blackout) return;
  const narrow = w < 700;
  const fade = 1 - goneAt(t);
  // 第一道闪电劈下时所有名字一起熄灭；更早些，第二幕后半把位置让给开放权重的接入标签，只留主旋律。
  const stay = fade * (1 - smooth(C.storm, C.storm + .3, t));
  const late = 1 - smooth(C.senses, C.senses + .4, t);
  const size = Math.min(16, w * .03); const text = Math.min(12, w * .024);
  const slot = (i: number): Point => staff(SLOTS[i]!.u);
  const landed = FINALE_LINEAGE.findLastIndex((entry) => t >= entry.at);
  const records = FINALE_LINEAGE.slice(0, landed + 1).filter((entry) => entry.tokens);
  const struck = C.strikes.filter((at) => t >= at).length;
  const record = records[records.length - 1 - struck];
  const kept = struck && record ? FINALE_LINEAGE.indexOf(record) : landed;
  ctx.save();
  for (let i = 0; i <= landed; i++) {
    const entry = FINALE_LINEAGE[i]!; const [x, y] = slot(i);
    const weight = LINEAGE_WEIGHT[entry.role]; const theme = entry.role === 'theme';
    const lost = i > kept;
    const pop = hit(t, entry.at, theme ? 5 : 8); const scale = size * (.6 + weight * .25) * (lost ? .75 : 1);
    const color = lost ? '#5a5866' : entry.open ? CYAN : GOLD;
    ctx.globalAlpha = fade * (.6 + pop * .4);
    const halo = lost ? 0 : theme ? Math.max(pop, .35) : pop;
    if (halo > .02) glow(ctx, x, y, scale * (1.5 + weight) * halo, entry.open ? '#8be6e250' : '#f8d79150');
    note(ctx, x, y - pop * scale * 1.2, scale * (1 + pop * .25 * weight), pop > .5 ? IVORY : color, -.15);
    const current = i === landed;
    const shown = narrow ? (current ? (theme ? 1 : 1 - smooth(entry.at + .5, entry.at + .8, t)) : 0) : theme ? 1 : .64 * late;
    if (shown === 0 || stay === 0) continue;
    const tier = narrow ? 1.4 : SLOTS[i]!.tier;
    const lx = narrow ? Math.max(w * .3, Math.min(w * .7, x)) : x;
    const ly = y + tier * scale; const away = Math.sign(tier);
    const fit = narrow ? w * .6 : w * .18;
    ctx.globalAlpha = stay * Math.min(1, shown + pop);
    label(ctx, entry.name, lx, ly, text * (.8 + weight * .17 + pop * weight * .25), fit, theme || current ? IVORY : color, MONO, theme ? 700 : 600);
    ctx.globalAlpha *= .6;
    label(ctx, entry.year, lx, ly + away * text * (theme ? 1.35 : 1.15), text * .78, fit, theme ? GOLD : color, MONO);
  }
  // token 光点：第一跳从谱线起点出发，停在最新的型号上；风暴里每一击都把它往回打到上一个纪录的音符。
  const arc = (from: Point, to: Point, p: number): Point => [mix(from[0], to[0], p),
    mix(from[1], to[1], p) - Math.sin(p * Math.PI) * (h * .035 + Math.abs(to[0] - from[0]) * .35)];
  const target = FINALE_LINEAGE[landed + 1];
  let [bx, by] = landed < 0 ? staff(0) : slot(landed);
  if (struck && record) {
    const before = FINALE_LINEAGE.indexOf(records[records.length - struck]!);
    [bx, by] = arc(slot(before), slot(kept), clamp((t - C.strikes[struck - 1]!) / BACK));
  } else if (target) {
    const start = Math.max(target.at - HOP, landed < 0 ? 0 : FINALE_LINEAGE[landed]!.at);
    [bx, by] = arc(landed < 0 ? staff(0) : slot(landed), slot(landed + 1), clamp((t - start) / (target.at - start)));
  }
  const changed = struck ? C.strikes[struck - 1]! : record?.at;
  const leap = changed === undefined ? 0 : hit(t, changed, 6);
  ctx.globalAlpha = fade;
  glow(ctx, bx, by, size * (1.4 + leap * 2), struck ? '#ff3d7f60' : '#fff6dd60');
  star(ctx, bx, by, 2.2 + leap * 2, struck ? STORM : IVORY, true);
  if (record) {
    ctx.globalAlpha = struck ? fade : stay;
    label(ctx, `${tokenLabel(record.tokens!)} TOKENS`, bx, by - size * 4.9, Math.min(13, w * .028) * (1 + leap * .7),
      w * .4, struck ? STORM : IVORY, MONO, 700);
    // 刷新纪录时倍数往上飘；被打回时除数往下掉。
    const other = records[records.indexOf(record) + (struck ? 1 : -1)];
    if (other && changed !== undefined) {
      const age = t - changed;
      ctx.globalAlpha = (struck ? fade : stay) * (1 - smooth(.35, .8, age));
      label(ctx, struck ? `÷${Math.round(other.tokens! / record.tokens!)}` : `×${Math.round(record.tokens! / other.tokens!)}`,
        bx, by - size * (struck ? 3.6 - age * 3 : 6.2 + age * 3), Math.min(16, w * .034), w * .2, struck ? STORM : GOLD, MONO, 700);
    }
  }
  ctx.restore();
}

/** 伏笔撑到第一道闪电，罪证随谱带坠进黑场，翻转在 ASTRA 星座成形前让位。 */
const UNDERTONE_END = { omen: C.storm, strike: C.blackout, flip: C.astra } as const;

/**
 * 暗线：社区抓到的原始字段挂在第二声部上，只有字段和数字。伏笔是从谱线底下渗出来的灰字；
 * 罪证被闪电砸在谱线上方，跟谱带一起被撕开、坠落；高潮时翻转成金色。
 */
export function undertone(f: ScoreFrame, staff: (u: number) => Point): void {
  const { ctx, width: w, seconds: t } = f;
  const live = FINALE_UNDERTONE.filter(({ at, act }) => t >= at && t < UNDERTONE_END[act]);
  if (live.length === 0) return;
  const narrow = w < 700;
  const size = Math.min(12, w * .026); const fade = 1 - goneAt(t); const tick = Math.floor(t * 18);
  ctx.save();
  // 窄屏只放最新的一条，避免和雷击大字、主旋律名字挤在一起。
  for (const entry of narrow ? live.slice(-1) : live) {
    const [x, y] = staff(entry.u);
    const lx = narrow ? w * .5 : x; const fit = narrow ? w * .8 : w * .26;
    const pop = hit(t, entry.at, 8);
    const out = 1 - smooth(UNDERTONE_END[entry.act] - .3, UNDERTONE_END[entry.act], t);
    if (entry.act === 'omen') {
      ctx.globalAlpha = smooth(entry.at, entry.at + .25, t) * out * .6;
      label(ctx, entry.text, lx, y + size * 2.2, size, fit, '#7f959b', MONO, 500);
      continue;
    }
    const ly = y - size * 2.4;
    if (entry.act === 'strike') {
      ctx.globalAlpha = fade * (.75 + pop * .25);
      if (pop > .05) glow(ctx, lx, ly, size * 5 * pop, '#ff3d7f50');
      tornLabel(ctx, entry.text, lx, ly, size * (1.15 + pop * .6), fit, IVORY, .1 + pop * .9, tick * 5 + FINALE_UNDERTONE.indexOf(entry) * 37, MONO, 700);
      continue;
    }
    ctx.globalAlpha = smooth(entry.at, entry.at + .15, t) * out;
    if (pop > .05) glow(ctx, lx, ly, size * 6 * pop, '#f8d79150');
    // 高潮的金色天空和谱带都很亮，金字要压一层深色描底才读得出来；谱带按 screen 叠加，深色描底得切回普通叠加才画得上。
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = '#140d04'; ctx.shadowBlur = 10;
    label(ctx, entry.text, lx, ly, size * (1.15 + pop * .5), fit, GOLD, MONO, 700);
    ctx.restore();
  }
  ctx.restore();
}

const SURGE_STEP = .125;

/** 24 秒高潮：token 沿着同一串纪录一口气跳回最高，每个三十二分音符跳一级，落定后标出总倍数。 */
export function tokenSurge(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const alpha = envelope(t, C.rise, C.astra, .1);
  if (alpha === 0) return;
  const last = FINALE_TOKEN_RECORDS.length - 1;
  const step = Math.min(last, Math.floor((t - C.rise) / SURGE_STEP));
  const pop = hit(t, C.rise + step * SURGE_STEP, 9);
  const size = Math.min(13, w * .03); const y = Math.max(26, h * .07) + size * 3.4;
  ctx.save(); ctx.globalAlpha = alpha;
  label(ctx, `${tokenLabel(FINALE_TOKEN_RECORDS[step]!)} TOKENS`, w * .5, y, Math.min(16, w * .034) * (1 + pop * .45), w * .6, GOLD, MONO, 700);
  if (step === last) {
    ctx.globalAlpha = alpha * smooth(C.rise + last * SURGE_STEP, C.rise + last * SURGE_STEP + .15, t);
    const times = Math.round(FINALE_TOKEN_RECORDS[last]! / FINALE_TOKEN_RECORDS[0]!);
    label(ctx, `×${times} · ${f.language === 'zh' ? '智能回来了' : 'INTELLIGENCE RESTORED'}`, w * .5, y + size * 1.6,
      Math.min(11, w * .025), w * .8, IVORY, MONO, 600);
  }
  ctx.restore();
}
