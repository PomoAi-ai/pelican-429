// 任务 019：?debug 性能面板——帧分段计时（core/frame-profiler，纯逻辑）与面板文本格式（ui/perf-panel）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createFrameProfiler, frameTimeStats } from '../src/core/frame-profiler.ts';
import { createPerfPanel, formatPerfText } from '../src/ui/hud/perf-panel.ts';
import { setLanguage } from '../src/config/i18n.ts';
import { createResolutionGovernor } from '../src/core/resolution-governor.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

function clock(values: number[]) {
  let i = 0;
  return () => {
    const v = values[i++];
    if (v === undefined) throw new Error('clock exhausted');
    return v;
  };
}

describe('frame-profiler', () => {
  test('mark 记录自上一次标记以来的耗时；end 汇总帧时间与各段窗口均值', () => {
    // 两帧：begin=0, sim@1, render@4, end@5；begin=16, sim@18, render@20, end@21
    const p = createFrameProfiler(['sim', 'render'], { windowSize: 2, now: clock([0, 1, 4, 5, 16, 18, 20, 21]) });
    p.begin();
    p.mark('sim');
    p.mark('render');
    p.end({ calls: 100, triangles: 2000 });
    p.begin();
    p.mark('sim');
    p.mark('render');
    p.end({ calls: 120, triangles: 4000 });
    const s = p.snapshot();
    assert.equal(s.frames, 2);
    assert.equal(s.segments.sim, 1.5);
    assert.equal(s.segments.render, 2.5);
    assert.equal(s.cpu, 5, 'CPU 帧内耗时 (5 + 5) / 2');
    assert.equal(s.frameTime, 16, '帧间隔（begin 到 begin）');
    assert.equal(s.fps, 62.5);
    assert.equal(s.calls, 110);
    assert.equal(s.triangles, 3000);
  });

  test('窗口滑动只保留最近 window 帧；未知段名/嵌套 begin 即抛', () => {
    const t = [0, 1, 2, 10, 13, 14, 20, 24, 25];
    const p = createFrameProfiler(['a'], { windowSize: 2, now: clock(t) });
    for (let k = 0; k < 3; k++) {
      p.begin();
      p.mark('a');
      p.end({ calls: 0, triangles: 0 });
    }
    assert.equal(p.snapshot().segments.a, 3.5, '(3 + 4) / 2');
    assert.throws(() => p.mark('nope'), /frame-profiler/);
    const q = createFrameProfiler(['a'], { now: () => 0 });
    q.begin();
    assert.throws(() => q.begin(), /frame-profiler/);
    assert.throws(() => createFrameProfiler([], { now: () => 0 }), /frame-profiler/);
    assert.throws(() => createFrameProfiler(['a'], {} as never), /frame-profiler/);
  });

  test('帧耗时分位数取排序后第 ⌈p·n⌉ 个样本，与输入顺序无关', () => {
    // 1..100 打乱：p50 = 第 50 个，p95 = 第 95 个，p99 = 第 99 个。
    const samples = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) + 1);
    assert.deepEqual(frameTimeStats(samples), { p50: 50, p95: 95, p99: 99, max: 100, mean: 50.5 });
    // 样本少时高分位落到最大值，而不是插值出不存在的帧耗时。
    assert.deepEqual(frameTimeStats([16, 17, 40]), { p50: 17, p95: 40, p99: 40, max: 40, mean: 73 / 3 });
  });
});

describe('perf-panel', () => {
  test('普通场景快捷键切换，长按只触发一次，编辑撤销与销毁后不拦截', () => withFakeDocument(() => {
    // 若快捷键仍依赖调试模式，或丢失重复键/编辑控件过滤，此用例会失败。
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const parent = Object.assign(new FakeElement('BODY'), { isConnected: true });
      const keys = new FakeElement('WINDOW');
      const panel = createPerfPanel(parent as unknown as HTMLElement, keys as unknown as Window, false, 'test');
      const shortcut = { code: 'KeyZ', [modifier]: true, altKey: true };
      assert.equal(keys.dispatch('keydown', { ...shortcut, altKey: false }).prevented, false);
      assert.equal(panel.visible, false);
      assert.equal(keys.dispatch('keydown', shortcut).prevented, true);
      assert.equal(panel.visible, true);
      keys.dispatch('keydown', { ...shortcut, repeat: true });
      assert.equal(panel.visible, true);
      for (const target of [new FakeElement('INPUT'), new FakeElement('TEXTAREA'), Object.assign(new FakeElement('DIV'), { isContentEditable: true })]) {
        assert.equal(keys.dispatch('keydown', { ...shortcut, target }).prevented, false);
        assert.equal(panel.visible, true);
      }
      assert.equal(keys.dispatch('keydown', { ...shortcut, shiftKey: true }).prevented, false);
      keys.dispatch('keydown', { code: 'KeyP' });
      assert.equal(panel.visible, true);
      keys.dispatch('keydown', shortcut);
      assert.equal(panel.visible, false);
      panel.dispose();
      assert.equal(keys.dispatch('keydown', shortcut).prevented, false);
      assert.equal(panel.visible, false);
    }
  }));

  test('文本：FPS、帧时间、CPU 分段、draw call、三角形（千/百万）', () => {
    setLanguage('zh');
    const text = formatPerfText({ frames: 60, fps: 59.94, frameTime: 16.68, cpu: 3.2, segments: { sim: 0.21, render: 1.6 }, calls: 252, triangles: 1_090_000 }, null, 'test');
    assert.match(text, /FPS\s+59\.9/);
    assert.match(text, /帧\s+16\.7 ms/);
    assert.match(text, /CPU\s+3\.20 ms/);
    assert.match(text, /sim\s+0\.21/);
    assert.match(text, /render\s+1\.60/);
    assert.match(text, /draw\s+252/);
    assert.match(text, /tris\s+1\.09M/);
  });
});

describe('createResolutionGovernor', () => {
  const tuning = { minPixelRatio: 1, targetGpuMs: 12, step: 0.25, raiseSamples: 4 };

  test('超预算按像素数比例一次降档，不低于下限', () => {
    const g = createResolutionGovernor(tuning, 2);
    assert.equal(g.sample(24), true);
    assert.equal(g.ratio, 1.25);
    assert.equal(g.sample(13), true);
    assert.equal(g.ratio, 1);
    assert.equal(g.sample(50), false);
    assert.equal(g.ratio, 1);
  });

  test('预估升档后仍有余量的窗口连续够数才升一档，中途超出余量重新计数；不超过上限', () => {
    const g = createResolutionGovernor(tuning, 1.5);
    g.sample(100);
    assert.equal(g.ratio, 1);
    assert.deepEqual([6, 6, 6].map((ms) => g.sample(ms)), [false, false, false]);
    assert.equal(g.sample(6), true);
    assert.equal(g.ratio, 1.25);
    assert.deepEqual([7, 7.5, 7, 7, 7].map((ms) => g.sample(ms)), [false, false, false, false, false]);
    assert.equal(g.sample(7), true);
    assert.equal(g.ratio, 1.5);
    assert.deepEqual([1, 1, 1, 1, 1].map((ms) => g.sample(ms)), [false, false, false, false, false]);
    assert.equal(g.ratio, 1.5);
  });
});
