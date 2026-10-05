// 015 风吹天气：全局风场纯函数（确定性、范围、阵风传播、天气循环连续）、JS/GLSL 一致（把 GLSL 标量函数转成 JS 求值比对）、
// 调参校验与 ?wind 解析、控制器（模式切换平滑、云漂移累积）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { DEFAULT_WEATHER, WIND_DEBUG_CYCLE, resolveWindMode, validateWeatherTuning } from '../src/config/weather-rules.ts';
import type { WeatherTuning } from '../src/config/weather-rules.ts';
import {
  CLOUD_GLSL,
  WIND_GLSL,
  WIND_UNIFORM_NAMES,
  sharedWindUniforms,
  windUniformValues,
  writeWindUniforms,
} from '../src/render/wind.ts';
import { cloudShadeAt, createWindController, modeState, weatherCycleLevel, windAt, windGust } from '../src/world/wind.ts';
import { glslDeclarations, glslFunctionNames } from './helpers/glsl.ts';

const W = DEFAULT_WEATHER;
const AUTO = (t: number) => modeState(W, 'auto', t);

/**
 * 把只含 float 标量运算的 GLSL 函数源转成 JS（float 声明 → let，函数签名 → function），内建函数用 JS 实现。
 * 只支持本模块用到的子集；遇到 vec/mat 等即抛（保证 GLSL 侧确实是标量公式）。
 */
function compileGlsl(src: string, uniforms: Readonly<Record<string, number>>): Record<string, (...a: number[]) => number> {
  const body = src
    .split('\n')
    .filter((l) => !/^\s*uniform\s/.test(l))
    .join('\n');
  if (/\b(vec[234]|mat[234]|int|bool)\b/.test(body)) throw new Error('compileGlsl: only float scalar code is supported');
  const fns = [...glslFunctionNames(body)];
  const js = body
    .replace(/\bfloat\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_m, name: string, args: string) => `function ${name}(${args.replace(/\bfloat\s+/g, '')}) {`)
    .replace(/\bfloat\s+/g, 'let ');
  const builtins = {
    sin: Math.sin,
    cos: Math.cos,
    pow: Math.pow,
    max: Math.max,
    min: Math.min,
    abs: Math.abs,
    clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)),
    smoothstep: (a: number, b: number, v: number) => {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    },
  };
  const names = [...Object.keys(builtins), ...Object.keys(uniforms)];
  const factory = new Function(...names, `${js}\nreturn { ${fns.join(', ')} };`);
  return factory(...Object.values(builtins), ...Object.values(uniforms));
}

describe('风场纯函数', () => {
  test('确定性：同 (x,t,seed) 结果相同；换种子阵风相位不同', () => {
    for (const [x, t] of [[0, 0], [12.5, 3.3], [400, 77.7], [-30, 1234.5]] as const) {
      assert.deepEqual(windAt(W, x, t, AUTO(t)), windAt(W, x, t, AUTO(t)));
    }
    const other: WeatherTuning = { ...W, seed: W.seed + 1 };
    const diff = [0, 5, 10, 20, 40].some((t) => Math.abs(windGust(W, 10, t) - windGust(other, 10, t)) > 1e-3);
    assert.ok(diff, 'seed changes gust phase');
  });

  test('范围：方向与主风向同号且 |dirX| ∈ [1−wander, 1]；阵风 ∈ [0,1]；强度在 [breeze 基础, storm 基础+阵风] 内', () => {
    for (let i = 0; i < 2000; i++) {
      const t = i * 0.731;
      const x = (i * 37.3) % 900;
      const s = windAt(W, x, t, AUTO(t));
      assert.ok(Math.sign(s.dirX) === W.direction, `dirX ${s.dirX}`);
      assert.ok(Math.abs(s.dirX) >= 1 - W.directionWander - 1e-9 && Math.abs(s.dirX) <= 1 + 1e-9);
      assert.ok(s.gust >= 0 && s.gust <= 1, `gust ${s.gust}`);
      assert.ok(s.strength >= W.baseSpeed.breeze - 1e-9 && s.strength <= W.baseSpeed.storm + W.gustStrength.storm + 1e-9, `strength ${s.strength}`);
    }
    const left = windAt({ ...W, direction: -1 }, 3, 4, AUTO(4));
    assert.ok(left.dirX < 0, 'direction −1 blows right-to-left');
  });

  test('阵风传播：波包沿风向从上风扫到下风，下风点的阵风等于上风点稍早时刻的阵风', () => {
    const dx = 18;
    const lag = dx / W.gustSpeed;
    for (const t of [10, 23.4, 51, 99.9]) {
      assert.ok(Math.abs(windGust(W, 100 + dx, t + lag) - windGust(W, 100, t)) < 1e-9);
    }
    // 找上风点的阵风峰值时刻，下风点的峰值晚 lag 到达。
    /** [t0,t1) 内第一个严格内部的局部极大（阵风峰）时刻。 */
    const peakTime = (x: number, t0: number, t1: number): number => {
      const h = 0.002;
      for (let t = t0 + h; t < t1 - h; t += h) {
        const g = windGust(W, x, t);
        if (g > 0.05 && g > windGust(W, x, t - h) && g >= windGust(W, x, t + h)) return t;
      }
      throw new Error(`no gust peak in [${t0},${t1})`);
    };
    const up = peakTime(100, 0, W.gustInterval);
    const expected = 9 / W.gustSpeed;
    const down = peakTime(100 + 9, up + expected - 1, up + expected + 1);
    assert.ok(down > up, 'downwind sees the gust later');
    assert.ok(Math.abs(down - up - expected) < 0.01, `downwind peak lags by ${down - up}`);
    // 反向风：右侧是上风。
    const rev: WeatherTuning = { ...W, direction: -1 };
    assert.ok(Math.abs(windGust(rev, 100 - dx, 30 + lag) - windGust(rev, 100, 30)) < 1e-9);
  });

  test('天气循环：auto 等级在 [0,1] 连续平滑、一个周期内覆盖微风与大风；固定模式等级恒定', () => {
    let lo = 1;
    let hi = 0;
    let prev = weatherCycleLevel(W, 0);
    const step = 0.05;
    for (let t = step; t <= W.cyclePeriod; t += step) {
      const l = weatherCycleLevel(W, t);
      assert.ok(l >= 0 && l <= 1);
      assert.ok(Math.abs(l - prev) <= (Math.PI / W.cyclePeriod) * step + 1e-9, 'continuous (bounded slope)');
      prev = l;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    assert.ok(lo < 0.02 && hi > 0.98, `cycle covers breeze..storm (${lo}..${hi})`);
    assert.ok(Math.abs(weatherCycleLevel(W, 13) - weatherCycleLevel(W, 13 + W.cyclePeriod)) < 1e-9, 'periodic');
    assert.deepEqual(modeState(W, 'storm', 5), { level: 1, scale: 1 });
    assert.deepEqual(modeState(W, 'breeze', 5), { level: 0, scale: 1 });
    assert.deepEqual(modeState(W, 'calm', 5), { level: 0, scale: W.calmScale });
    const calm = windAt(W, 0, 5, modeState(W, 'calm', 5));
    const storm = windAt(W, 0, 5, modeState(W, 'storm', 5));
    assert.ok(storm.strength > calm.strength * 2);
  });

  test('云影：在 [1−strength, 1] 内，随云漂移平移', () => {
    for (let x = 0; x < 300; x += 1.3) {
      const c = cloudShadeAt(W, x, 0);
      assert.ok(c >= 1 - W.cloudShadow.strength - 1e-9 && c <= 1 + 1e-9);
      assert.ok(Math.abs(cloudShadeAt(W, x + 7, 7) - c) < 1e-9, 'shadow pattern drifts with the clouds');
    }
    const vals = Array.from({ length: 200 }, (_, i) => cloudShadeAt(W, i * 1.7, 0));
    assert.ok(Math.min(...vals) < 1 - W.cloudShadow.strength * 0.6 && Math.max(...vals) > 0.999, 'has dark patches and clear gaps');
  });
});

describe('JS / GLSL 一致', () => {
  test('uniform 声明与参数表一一对应（类型 float）', () => {
    const decl = new Map([...glslDeclarations(WIND_GLSL), ...glslDeclarations(CLOUD_GLSL)]);
    const values = windUniformValues(W, 12, AUTO(12), 3);
    assert.deepEqual([...decl.keys()].sort(), [...WIND_UNIFORM_NAMES].sort());
    assert.deepEqual(Object.keys(values).sort(), [...WIND_UNIFORM_NAMES].sort());
    for (const [, d] of decl) assert.deepEqual(d, { qualifier: 'uniform', type: 'float' });
    assert.ok(glslFunctionNames(WIND_GLSL).has('windSway'));
    assert.ok(glslFunctionNames(WIND_GLSL).has('windGust'));
    assert.ok(glslFunctionNames(CLOUD_GLSL).has('cloudShade'));
  });

  test('GLSL windSway / windGust / cloudShade 与 JS 数值一致（多时刻、多位置、两种风向）', () => {
    for (const w of [W, { ...W, direction: -1 as const, seed: 99 }]) {
      for (const t of [0, 4.2, 37.5, 260.1]) {
        for (const mode of ['calm', 'breeze', 'moderate', 'storm', 'gale', 'auto'] as const) {
          const state = modeState(w, mode, t);
          const drift = t * 0.8;
          const glsl = compileGlsl(`${WIND_GLSL}\n${CLOUD_GLSL}`, windUniformValues(w, t, state, drift));
          for (const x of [-20, 0, 3.7, 128.25, 999]) {
            const s = windAt(w, x, t, state);
            assert.ok(Math.abs((glsl.windSway as (...a: number[]) => number)(x, 5, t) - s.dirX * s.strength) < 1e-9, `sway x=${x} t=${t} ${mode}`);
            assert.ok(Math.abs((glsl.windGust as (...a: number[]) => number)(x, t) - s.gust) < 1e-9);
            assert.ok(Math.abs((glsl.cloudShade as (...a: number[]) => number)(x) - cloudShadeAt(w, x, drift)) < 1e-9);
          }
        }
      }
    }
  });

  test('共享 uniform 单例：写入后各材质读到同一对象的新值', () => {
    const u = sharedWindUniforms();
    assert.equal(sharedWindUniforms(), u, 'singleton');
    assert.deepEqual(Object.keys(u).sort(), [...WIND_UNIFORM_NAMES].sort());
    const values = windUniformValues(W, 8, AUTO(8), 1.5);
    writeWindUniforms(u, values);
    for (const k of WIND_UNIFORM_NAMES) assert.equal(u[k].value, values[k]);
    assert.throws(() => writeWindUniforms(u, { ...values, uWindBase: Number.NaN }), /wind/);
  });
});

describe('天气控制器', () => {
  test('强度倍率同步改变风采样和云漂移，零强度停风且不改变模式', () => {
    const baseline = createWindController(W, 'gale');
    const boosted = createWindController(W, 'gale');
    boosted.setPower(5);
    for (let t = 0; t <= 5; t += 0.1) {
      baseline.update(t);
      boosted.update(t);
    }
    assert.ok(Math.abs(boosted.sample(10).strength / baseline.sample(10).strength - 5) < 1e-9);
    assert.ok(Math.abs(boosted.cloudDrift / baseline.cloudDrift - 5) < 1e-9);
    boosted.setPower(0);
    const drift = boosted.cloudDrift;
    boosted.update(6);
    assert.equal(boosted.sample(10).strength, 0);
    assert.equal(boosted.cloudDrift, drift);
    assert.equal(boosted.mode, 'gale');
  });

  test('无风停止风场及云漂移，固定风力逐档增强，暴风达到大风的 2.5 倍', () => {
    const calm = createWindController(W, 'calm');
    for (const t of [0, 5, 19, 200]) {
      calm.update(t);
      assert.equal(calm.sample(716).strength, 0);
      assert.equal(calm.sway(716), 0);
      assert.equal(calm.cloudDrift, 0);
      const strengths = (['breeze', 'moderate', 'storm', 'gale'] as const).map((mode) => {
        const c = createWindController(W, mode);
        c.update(t);
        return c.sample(716).strength;
      });
      const [breeze, moderate, storm, gale] = strengths as [number, number, number, number];
      assert.ok(breeze < moderate && moderate < storm && storm < gale);
      assert.ok(Math.abs(gale - storm * 2.5) < 1e-12);
    }
  });

  test('反向先减弱至零再增强，远端风场连续且 CPU 与 GLSL 同向，云随之掉头', () => {
    const c = createWindController(W, 'gale');
    c.update(10);
    const initial = c.sway(99999);
    c.setDirection('left');
    assert.equal(c.sway(99999), initial, '切换指令不立即改变风场');
    const middle = 10 + W.modeBlend / 2;
    const at = [10, middle - 1e-7, middle, middle + 1e-7, 10 + W.modeBlend];
    let cloudBefore = c.cloudDrift;
    for (const t of at) {
      c.update(t);
      const glsl = compileGlsl(WIND_GLSL, windUniformValues(c.rules, c.time, c.state, c.cloudDrift));
      for (const x of [0, 716, 99999]) {
        const actual = c.sway(x);
        const rendered = (glsl.windSway as (...a: number[]) => number)(x, 5, t);
        assert.ok(Math.abs(actual - rendered) < 1e-9);
        if (Math.abs(t - middle) < 1e-6) assert.ok(Math.abs(actual) < 1e-5, '传播相位改向时振幅为零');
      }
      if (t > middle) assert.ok(c.cloudDrift < cloudBefore, '云漂移积分反向');
      cloudBefore = c.cloudDrift;
    }
    assert.ok(c.sway(716) < 0);
    assert.equal(c.direction, 'left');
    assert.deepEqual(c.sample(716), windAt({ ...W, direction: -1 }, 716, c.time, modeState(W, 'gale', c.time)));
  });

  test('风向过渡中重新改向保持当前风力，同方向设置不延长过渡', () => {
    const c = createWindController(W, 'storm');
    c.update(10);
    c.setDirection('left');
    c.update(10 + W.modeBlend / 4);
    const before = c.sway(716);
    c.setDirection('right');
    c.update(c.time);
    assert.equal(c.sway(716), before);
    const finish = c.time + W.modeBlend;
    c.update(c.time + W.modeBlend / 2);
    c.setDirection('right');
    c.update(finish);
    assert.deepEqual(c.sample(716), windAt(W, 716, finish, modeState(W, 'storm', finish)));
  });

  test('模式切换在 modeBlend 内平滑过渡；V 循环 微风 → 大风 → 自动', () => {
    const c = createWindController(W, 'breeze');
    c.update(10);
    assert.equal(c.state.level, 0);
    c.setMode('storm');
    let prev = c.state.level;
    for (let t = 10; t <= 10 + W.modeBlend + 0.5; t += 0.1) {
      c.update(t);
      assert.ok(c.state.level >= prev - 1e-12 && c.state.level - prev < 0.1, `smooth ramp ${prev} → ${c.state.level}`);
      prev = c.state.level;
    }
    assert.equal(c.state.level, 1);
    assert.deepEqual(WIND_DEBUG_CYCLE, ['breeze', 'storm', 'auto']);
    assert.equal(c.cycleMode(), 'auto');
    assert.equal(c.cycleMode(), 'breeze');
    assert.equal(c.cycleMode(), 'storm');
    assert.throws(() => c.setMode('invalid' as never), /weather/);
    assert.throws(() => c.update(Number.NaN), /weather/);
  });

  test('云漂移沿风向累积；同时间序列可复现；sway 与 windAt 一致', () => {
    const run = () => {
      const c = createWindController(W, 'auto');
      const out: number[] = [];
      for (let i = 0; i <= 600; i++) {
        c.update(i / 60);
        out.push(c.cloudDrift);
      }
      return { out, c };
    };
    const a = run();
    assert.deepEqual(run().out, a.out);
    assert.ok((a.out.at(-1) as number) > 0, 'clouds drift downwind (+x)');
    for (let i = 1; i < a.out.length; i++) assert.ok((a.out[i] as number) >= (a.out[i - 1] as number));
    const s = windAt(W, 42, 10, a.c.state);
    assert.ok(Math.abs(a.c.sway(42) - s.dirX * s.strength) < 1e-12);
  });
});

describe('调参校验与 URL 参数', () => {
  const clone = (): any => JSON.parse(JSON.stringify(TUNING));
  test('默认合法；?wind 解析', () => {
    validateTuning(TUNING);
    validateWeatherTuning(DEFAULT_WEATHER, 'render.weather');
    assert.equal(TUNING.render.weather.mode, 'auto');
    assert.equal(resolveWindMode(null, 'auto'), 'auto');
    for (const m of ['calm', 'breeze', 'moderate', 'storm', 'gale', 'auto'] as const) assert.equal(resolveWindMode(m, 'auto'), m);
    assert.throws(() => resolveWindMode('hurricane', 'auto'), /\?wind=hurricane/);
  });
  const cases: ReadonlyArray<[string, (t: any) => void, RegExp]> = [
    ['mode 非法', (t) => (t.render.weather.mode = 'invalid'), /render\.weather\.mode/],
    ['direction 非 ±1', (t) => (t.render.weather.direction = 0), /render\.weather\.direction/],
    ['directionWander ≥ 1（会反向）', (t) => (t.render.weather.directionWander = 1), /render\.weather\.directionWander/],
    ['baseSpeed.storm < breeze', (t) => (t.render.weather.baseSpeed.storm = 0.01), /render\.weather\.baseSpeed\.storm/],
    ['gustStrength 负数', (t) => (t.render.weather.gustStrength.breeze = -1), /render\.weather\.gustStrength\.breeze/],
    ['gustInterval 过小', (t) => (t.render.weather.gustInterval = 0), /render\.weather\.gustInterval/],
    ['gustSpeed 非数', (t) => (t.render.weather.gustSpeed = 'fast'), /render\.weather\.gustSpeed/],
    ['cyclePeriod 过小', (t) => (t.render.weather.cyclePeriod = 1), /render\.weather\.cyclePeriod/],
    ['particles.debrisMax 非整数', (t) => (t.render.weather.particles.debrisMax = 1.5), /render\.weather\.particles\.debrisMax/],
    ['clouds.count 超上限', (t) => (t.render.weather.clouds.count = 100), /render\.weather\.clouds\.count/],
    ['clouds.zFar 不远于 zNear', (t) => (t.render.weather.clouds.zFar = -10), /render\.weather\.clouds\.zFar/],
    ['cloudShadow.strength 过大', (t) => (t.render.weather.cloudShadow.strength = 0.95), /render\.weather\.cloudShadow\.strength/],
    ['seed 非整数', (t) => (t.render.weather.seed = 1.5), /render\.weather\.seed/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = clone();
      mutate(t);
      assert.throws(() => validateTuning(t as Tuning), re);
    });
  }
});
