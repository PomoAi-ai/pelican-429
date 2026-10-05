// 019 打磨 A：操作提示自动淡出 + H 切换 + “H 帮助”角标；假人血条与鹈鹕重叠时侧移/上抬/半透明。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { DEFAULT_BINDINGS, GAME_ACTIONS, PLAY_ACTIONS, UI_ACTIONS, buildBindingLookup, validateBindings } from '../src/config/keybindings.ts';
import type { Bindings } from '../src/config/keybindings.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import { createDummyEntity, createPelicanEntity } from '../src/entities/entity.ts';
import type { Entity } from '../src/entities/entity.ts';
import { BAR_HALF_WIDTH, BAR_HEIGHT, BAR_OFFSET, BAR_OVERLAP_OPACITY, pelicanVisualRect, placeDummyBar } from '../src/ui/dummy-bar-layout.ts';
import type { Rect } from '../src/ui/dummy-bar-layout.ts';
import { CONTROL_HINTS, HINTS_AFTER_INPUT, HINTS_AUTO_HIDE, createHud } from '../src/ui/hud.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

const DT = 1 / 60;
const stats = { fps: 60, tick: 0, droppedTicks: 0 };

function run(hud: ReturnType<typeof createHud>, entities: Entity[], seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) hud.update({ entities, alpha: 1, frameDt: DT, stats, playerId: 1 });
}

describe('操作提示：自动淡出与 H 切换', () => {
  test('help 动作绑定 KeyH，是界面动作；缺绑定即抛；tracker.consumeUi 锁存一次', () => {
    assert.ok(GAME_ACTIONS.includes('help'));
    assert.ok(UI_ACTIONS.includes('help') && !PLAY_ACTIONS.includes('help') && PLAY_ACTIONS.includes('jump'));
    assert.equal(buildBindingLookup(DEFAULT_BINDINGS).keys.get('KeyH'), 'help');
    const { help: _omit, ...rest } = DEFAULT_BINDINGS;
    assert.throws(() => validateBindings(rest as unknown as Bindings), /'help' has no binding/);
    const t = createActionTracker();
    t.press('help', 'keyboard', 'KeyH');
    t.consume(null);
    assert.equal(t.consumeUi().helpPressed, true, '模拟 tick 不吃掉 help');
    assert.equal(t.consumeUi().helpPressed, false);
  });

  test(`开局显示，${HINTS_AUTO_HIDE}s 后自动淡出并出现“H 帮助”角标；H 再显示（不再自动淡出），再按隐藏`, () => {
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }));
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      const hints = root.find('hud-hints')!;
      const badge = root.find('hud-help-badge')!;
      assert.ok(CONTROL_HINTS.some((l) => l.startsWith('H ')));
      assert.equal(hud.hintsVisible, true);
      assert.equal(badge.hidden, true);
      run(hud, [player], HINTS_AUTO_HIDE - 0.2);
      assert.equal(hud.hintsVisible, true, '6 秒前仍显示');
      run(hud, [player], 0.3);
      assert.equal(hud.hintsVisible, false);
      assert.equal(hints.classList.contains('hud-hints-hidden'), true, '淡出（CSS 过渡）');
      assert.equal(badge.hidden, false);
      assert.equal(badge.textContent, 'H 帮助');
      hud.toggleHints();
      assert.equal(hud.hintsVisible, true);
      assert.equal(badge.hidden, true);
      run(hud, [player], 20);
      assert.equal(hud.hintsVisible, true, '手动显示后不自动淡出');
      hud.toggleHints();
      assert.equal(hud.hintsVisible, false);
      assert.equal(badge.hidden, false);
      hud.dispose();
    });
  });

  test(`首次有效输入后 ${HINTS_AFTER_INPUT}s 淡出（比 ${HINTS_AUTO_HIDE}s 早到才提前；后续输入不再推迟）`, () => {
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }));
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      run(hud, [player], 0.5);
      hud.noteInput();
      run(hud, [player], HINTS_AFTER_INPUT - 0.2);
      hud.noteInput();
      assert.equal(hud.hintsVisible, true);
      run(hud, [player], 0.3);
      assert.equal(hud.hintsVisible, false, '0.5 + 4 = 4.5s 淡出');
      assert.throws(() => hud.update({ entities: [player], alpha: 1, frameDt: Number.NaN, stats, playerId: 1 }), /hud: invalid frameDt/);
      hud.dispose();
    });
  });
});

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const barRect = (x: number, y: number): Rect => ({ x0: x - BAR_HALF_WIDTH, x1: x + BAR_HALF_WIDTH, y0: y, y1: y + BAR_HEIGHT });

describe('假人血条避让鹈鹕', () => {
  const dummyAt = (x: number): Entity => createDummyEntity(5, { x, y: 10 }, TUNING);
  const pelicanAt = (x: number, y: number, facing: 1 | -1 = 1): Entity => {
    const p = createPelicanEntity(1, { x, y }, TUNING);
    p.facing = facing;
    return p;
  };

  test('无鹈鹕靠近：锚定假人头顶上方固定偏移，不透明', () => {
    const d = dummyAt(20);
    const r = placeDummyBar(d, 1, [pelicanVisualRect(pelicanAt(5, 10), 1)]);
    assert.deepEqual(r, { x: 20, y: 10 + d.body.height + BAR_OFFSET, opacity: 1, overlapped: false });
    assert.throws(() => placeDummyBar(pelicanAt(0, 0), 1, []), /not a trainingDummy/);
  });

  for (const facing of [1, -1] as const) {
    test(`鹈鹕站在假人头上（facing=${facing}）：血条抬到鹈鹕与假人整体上方（不悬在假人头高度的身侧），不重叠且不透明`, () => {
      const d = dummyAt(20);
      for (const dx of [0, 0.35, -0.35]) {
        const pel = pelicanAt(20 + dx, 10 + d.body.height, facing);
        const box = pelicanVisualRect(pel, 1);
        const r = placeDummyBar(d, 1, [box]);
        assert.equal(r.overlapped, true);
        assert.equal(r.opacity, 1);
        assert.equal(overlaps(barRect(r.x, r.y), box), false);
        assert.ok(r.y >= box.y1, `在整体上方：bar ${r.y} vs 鹈鹕顶 ${box.y1}`);
        assert.ok(r.y - box.y1 < 0.3, '紧贴鹈鹕头顶之上');
        assert.ok(Math.abs(r.x - 20) < 1e-9, '水平仍对准假人');
      }
    });
  }

  test('鹈鹕贴着假人侧面：血条侧移或上抬后不重叠；被两只鹈鹕夹住避不开时原位半透明 .35', () => {
    const d = dummyAt(20);
    const box = pelicanVisualRect(pelicanAt(20.9, 10 + 1.2, -1), 1);
    const r = placeDummyBar(d, 1, [box]);
    assert.equal(overlaps(barRect(r.x, r.y), box), false);
    const wall: Rect = { x0: 10, x1: 30, y0: 0, y1: 40 };
    const s = placeDummyBar(d, 1, [wall]);
    assert.deepEqual(s, { x: 20, y: 10 + d.body.height + BAR_OFFSET, opacity: BAR_OVERLAP_OPACITY, overlapped: true });
  });

  test('HUD：重叠时血条平滑移开（投影坐标）、不遮挡鹈鹕、离开后回到头顶；避不开时 opacity .35', () => {
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, (x, y) => ({ x: x * 10, y: -y * 10 }));
      const d = dummyAt(20);
      const pel = pelicanAt(5, 10);
      const ents = [pel, d];
      const baseY = 10 + d.body.height + BAR_OFFSET;
      run(hud, ents, 0.1);
      const bar = root.find('hud-bar')!;
      const pos = (): [number, number] => {
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(bar.style.transform ?? '')!;
        return [Number(m[1]) / 10, -Number(m[2]) / 10];
      };
      const [x0, y0] = pos();
      assert.ok(Math.abs(x0 - 20) < 0.01 && Math.abs(y0 - baseY) < 0.01, `bar at ${x0},${y0}`);
      pel.body.x = pel.body.prevX = 20;
      pel.body.y = pel.body.prevY = 10 + d.body.height;
      hud.update({ entities: ents, alpha: 1, frameDt: DT, stats, playerId: 1 });
      const [x1, y1] = pos();
      const target = placeDummyBar(d, 1, [pelicanVisualRect(pel, 1)]);
      const moved = Math.hypot(x1 - 20, y1 - baseY);
      assert.ok(moved > 0.05 && moved < Math.hypot(target.x - 20, target.y - baseY) - 0.05, '平滑：第一帧只移一部分');
      run(hud, ents, 1);
      const [x2, y2] = pos();
      assert.equal(overlaps(barRect(x2, y2), pelicanVisualRect(pel, 1)), false, '稳定后不遮挡鹈鹕');
      assert.equal(bar.style.opacity, '1.00');
      pel.body.x = pel.body.prevX = 5;
      pel.body.y = pel.body.prevY = 10;
      run(hud, ents, 1);
      const [x3, y3] = pos();
      assert.ok(Math.abs(x3 - 20) < 0.01 && Math.abs(y3 - baseY) < 0.01, '回到头顶');
      // 避不开：鹈鹕从两侧和上方都挡住（三只鹈鹕围住假人头顶）。
      const crowd = [pelicanAt(18.2, 12.2, 1), pelicanAt(21.8, 12.2, -1), pelicanAt(20, 13.9, 1), d];
      run(hud, crowd, 0.5);
      assert.equal(bar.style.opacity, String(BAR_OVERLAP_OPACITY.toFixed(2)));
      assert.equal(bar.classList.contains('hud-bar-overlap'), true);
      hud.dispose();
    });
  });
});
