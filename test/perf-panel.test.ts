// 任务 019：?debug 性能面板——帧分段计时（core/frame-profiler，纯逻辑）与面板文本格式（ui/perf-panel）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createFrameProfiler } from '../src/core/frame-profiler.ts';
import { formatPerfText } from '../src/ui/perf-panel.ts';

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
});

describe('perf-panel', () => {
  test('文本：FPS、帧时间、CPU 分段、draw call、三角形（千/百万）', () => {
    const text = formatPerfText({ frames: 60, fps: 59.94, frameTime: 16.68, cpu: 3.2, segments: { sim: 0.21, render: 1.6 }, calls: 252, triangles: 1_090_000 });
    assert.match(text, /FPS\s+59\.9/);
    assert.match(text, /帧\s+16\.7 ms/);
    assert.match(text, /CPU\s+3\.20 ms/);
    assert.match(text, /sim\s+0\.21/);
    assert.match(text, /render\s+1\.60/);
    assert.match(text, /draw\s+252/);
    assert.match(text, /tris\s+1\.09M/);
  });
});
