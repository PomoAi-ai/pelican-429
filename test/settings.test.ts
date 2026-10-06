// 任务 019：游戏内设置面板——选项表（与网址参数共用）、存储解析/非法值清除、URL 优先、控制器（运行时接口/持久化/暂停）、面板 DOM、按键绑定。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTIALIAS_MODES, LIGHTING_QUALITIES } from '../src/config/lighting-rules.ts';
import { WIND_MODES } from '../src/config/weather-rules.ts';
import { PRECIP_MODES } from '../src/config/precip-rules.ts';
import { WATER_PALETTE_NAMES } from '../src/config/water-palettes.ts';
import { DEFAULT_BINDINGS, GAME_ACTIONS, PLAY_ACTIONS, UI_ACTIONS, buildBindingLookup, validateBindings } from '../src/config/keybindings.ts';
import type { Bindings } from '../src/config/keybindings.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import {
  SETTING_DEFS,
  SETTINGS_STORAGE_KEY,
  newWorldSearch,
  parseSeed,
  parseStoredSettings,
  resolveSettings,
  settingDef,
} from '../src/config/game-settings.ts';
import type { GameSettings, SettingKey } from '../src/config/game-settings.ts';
import { createLocalSettingsStore, createSettingsController, loadSettings } from '../src/ui/settings-model.ts';
import type { SettingsRuntime, SettingsStore } from '../src/ui/settings-model.ts';
import { createSettingsPanel } from '../src/ui/settings-panel.ts';
import { CONTROL_HINTS } from '../src/ui/hud.ts';
import { setLanguage } from '../src/ui/language.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

const DEFAULTS: GameSettings = Object.freeze({ quality: 'high', antialias: 'smaa', wind: 'auto', windDirection: 'right', tornado: false, windPower: 1, tornadoPower: 2, tornadoCount: 3, rainPower: 1, snowPower: 1, precip: 'manual', rain: 'none', snow: 'none', water: 'clear', perfPanel: false, minimapVisible: true, minimapOpacity: 75, tileGrid: false, mapTeleport: false, dummyShoot: false });

const params = (q: string) => new URLSearchParams(q);

function memoryStore(initial: string | null = null): SettingsStore & { value: string | null; writes: number } {
  return {
    value: initial,
    writes: 0,
    read() {
      return this.value;
    },
    write(s: string) {
      this.writes++;
      this.value = s;
    },
  };
}

function fakeRuntime(start: GameSettings = DEFAULTS) {
  const state: GameSettings = { ...start };
  const calls: string[] = [];
  const rt: SettingsRuntime = {
    read: () => ({ ...state }),
    setQuality: (v) => {
      calls.push(`quality:${v}`);
      state.quality = v;
    },
    setAntialias: (v) => {
      calls.push(`antialias:${v}`);
      state.antialias = v;
    },
    setWind: (v) => {
      calls.push(`wind:${v}`);
      state.wind = v;
    },
    setWindPower: (v) => { calls.push(`windPower:${v}`); state.windPower = v; },
    setTornadoPower: (v) => { calls.push(`tornadoPower:${v}`); state.tornadoPower = v; },
    setTornadoCount: (v) => { calls.push(`tornadoCount:${v}`); state.tornadoCount = v; },
    setRainPower: (v) => { calls.push(`rainPower:${v}`); state.rainPower = v; },
    setSnowPower: (v) => { calls.push(`snowPower:${v}`); state.snowPower = v; },
    setTornado: (v) => {
      calls.push(`tornado:${v}`);
      state.tornado = v;
    },
    setWindDirection: (v) => {
      calls.push(`windDirection:${v}`);
      state.windDirection = v;
    },
    setPrecip: (v) => {
      calls.push(`precip:${v}`);
      state.precip = v;
    },
    setRain: (v) => {
      calls.push(`rain:${v}`);
      state.rain = v;
    },
    setSnow: (v) => {
      calls.push(`snow:${v}`);
      state.snow = v;
    },
    setWater: (v) => {
      calls.push(`water:${v}`);
      state.water = v;
    },
    setPerfPanel: (v) => {
      calls.push(`perfPanel:${v}`);
      state.perfPanel = v;
    },
    setMinimapVisible: (v) => { calls.push(`minimapVisible:${v}`); state.minimapVisible = v; },
    setMinimapOpacity: (v) => { calls.push(`minimapOpacity:${v}`); state.minimapOpacity = v; },
    setTileGrid: (v) => {
      calls.push(`tileGrid:${v}`);
      state.tileGrid = v;
    },
    setMapTeleport: (v) => {
      calls.push(`mapTeleport:${v}`);
      state.mapTeleport = v;
    },
    setDummyShoot: (v) => {
      calls.push(`dummyShoot:${v}`);
      state.dummyShoot = v;
    },
  };
  return { rt, calls, state };
}

describe('设置选项表（与网址参数共用）', () => {
  test('选项与各配置模块的取值常量一致；网址参数名沿用 quality/aa/wind/water/dummyShoot，022 新增 precip', () => {
    const values = (k: SettingKey) => settingDef(k).options.map((o) => o.value);
    assert.deepEqual(values('quality').slice().sort(), [...LIGHTING_QUALITIES].sort());
    assert.deepEqual(values('antialias').slice().sort(), [...ANTIALIAS_MODES].sort());
    assert.deepEqual(values('wind').slice().sort(), [...WIND_MODES].sort());
    assert.deepEqual(values('precip'), [...PRECIP_MODES]);
    assert.deepEqual(settingDef('precip').options.map((o) => o.label), ['手动', '自动']);
    assert.equal(settingDef('precip').group, 'weather');
    assert.deepEqual(values('water').slice().sort(), [...WATER_PALETTE_NAMES].sort());
    assert.deepEqual(values('perfPanel'), [false, true]);
    assert.deepEqual(values('dummyShoot'), [false, true]);
    const p = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.param]));
    assert.deepEqual(p, { quality: 'quality', antialias: 'aa', wind: 'wind', windDirection: 'windDirection', tornado: 'tornado', windPower: 'windPower', tornadoPower: 'tornadoPower', tornadoCount: 'tornadoCount', rainPower: 'rainPower', snowPower: 'snowPower', precip: 'precip', rain: 'rain', snow: 'snow', water: 'water', perfPanel: null, minimapVisible: null, minimapOpacity: null, tileGrid: null, mapTeleport: null, dummyShoot: 'dummyShoot' });
    assert.match(settingDef('antialias').options.find((o) => o.value === 'msaa')?.label ?? '', /MSAA/);
    assert.match(settingDef('antialias').note ?? '', /MSAA 较慢/);
    assert.throws(() => settingDef('nope' as SettingKey), /settings/);
  });

  test('resolveSettings：网址参数优先于保存值，保存值优先于默认值；来源记录在 fromUrl', () => {
    const r = resolveSettings({ defaults: DEFAULTS, saved: { water: 'deep', quality: 'low' }, params: params('?water=emerald&aa=msaa&dummyShoot&precip=manual&rain=heavy&snow=light&wind=gale&windDirection=left&tornado') });
    assert.deepEqual(r.settings, { quality: 'low', antialias: 'msaa', wind: 'gale', windDirection: 'left', tornado: true, windPower: 1, tornadoPower: 2, tornadoCount: 3, rainPower: 1, snowPower: 1, precip: 'manual', rain: 'heavy', snow: 'light', water: 'emerald', perfPanel: false, minimapVisible: true, minimapOpacity: 75, tileGrid: false, mapTeleport: false, dummyShoot: true });
    assert.deepEqual([...r.fromUrl].sort(), ['antialias', 'dummyShoot', 'precip', 'rain', 'snow', 'tornado', 'water', 'wind', 'windDirection']);
  });

  test('网址参数非法即抛（fail-fast，不静默回退）', () => {
    for (const q of ['?quality=ultra', '?aa=fxaa', '?wind=unknown', '?water=mud', '?dummyShoot=maybe', '?precip=hail', '?precip=rain', '?precip=RAIN-HEAVY', '?precip=']) {
      assert.throws(() => resolveSettings({ defaults: DEFAULTS, saved: {}, params: params(q) }), /settings: invalid \?/, q);
    }
    const off = resolveSettings({ defaults: DEFAULTS, saved: { dummyShoot: true }, params: params('?dummyShoot=0') });
    assert.equal(off.settings.dummyShoot, false);
  });
});

describe('保存值解析（非法值清除并提示）', () => {
  test('合法保存值原样返回、无提示', () => {
    const r = parseStoredSettings(JSON.stringify({ quality: 'low', wind: 'storm', perfPanel: true }));
    assert.deepEqual(r.values, { quality: 'low', wind: 'storm', perfPanel: true });
    assert.deepEqual(r.issues, []);
    assert.equal(r.changed, false);
    assert.deepEqual(parseStoredSettings(null), { values: {}, issues: [], changed: false });
  });

  test('非法值/未知项：清除该项、保留其余，并给出提示', () => {
    const r = parseStoredSettings(JSON.stringify({ quality: 'ultra', water: 'deep', bogus: 1, dummyShoot: 'yes' }));
    assert.deepEqual(r.values, { water: 'deep' });
    assert.equal(r.changed, true);
    assert.equal(r.issues.length, 3);
    assert.ok(r.issues.some((s) => s.includes('画质') && s.includes('ultra')));
    assert.ok(r.issues.some((s) => s.includes('bogus')));
  });

  test('损坏（非 JSON / 非对象）：全部清除并提示', () => {
    for (const raw of ['{not json', '[1,2]', '42', 'null']) {
      const r = parseStoredSettings(raw);
      assert.deepEqual(r.values, {}, raw);
      assert.equal(r.changed, true, raw);
      assert.equal(r.issues.length, 1, raw);
      assert.match(r.issues[0] ?? '', /损坏/);
    }
  });

  test('loadSettings：清理后的保存值写回；读存储抛错时用默认值（不阻止启动）', () => {
    const store = memoryStore(JSON.stringify({ quality: 'ultra', water: 'deep' }));
    const r = loadSettings({ store, defaults: DEFAULTS, params: params('') });
    assert.equal(r.settings.water, 'deep');
    assert.equal(r.settings.quality, 'high');
    assert.equal(r.issues.length, 1);
    assert.deepEqual(JSON.parse(store.value ?? ''), { water: 'deep' }, '非法项已从存储清除');

    const broken: SettingsStore = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {
        throw new Error('SecurityError');
      },
    };
    const warn = console.warn;
    const warned: unknown[] = [];
    console.warn = (...a: unknown[]) => warned.push(a);
    try {
      const d = loadSettings({ store: broken, defaults: DEFAULTS, params: params('?wind=calm') });
      assert.deepEqual(d.settings, { ...DEFAULTS, wind: 'calm' });
      assert.deepEqual(d.saved, {});
    } finally {
      console.warn = warn;
    }
    assert.equal(warned.length, 1, '读不到存储：告警但不静默吞掉');
  });

  test('createLocalSettingsStore：读写固定键', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const s = createLocalSettingsStore(() => storage);
    assert.equal(s.read(), null);
    s.write('{"quality":"low"}');
    assert.equal(map.get(SETTINGS_STORAGE_KEY), '{"quality":"low"}');
    assert.equal(s.read(), '{"quality":"low"}');
  });
});

describe('设置控制器', () => {
  test('每项切换调用对应运行时接口并持久化（只写面板改过的项）', () => {
    const { rt, calls } = fakeRuntime();
    const store = memoryStore();
    const c = createSettingsController({ runtime: rt, store, saved: {}, issues: [] });
    const cases: Array<[SettingKey, GameSettings[SettingKey]]> = [
      ['quality', 'low'],
      ['antialias', 'msaa'],
      ['wind', 'gale'],
      ['windDirection', 'left'],
      ['tornado', true],
      ['precip', 'auto'],
      ['rain', 'heavy'],
      ['snow', 'light'],
      ['water', 'emerald'],
      ['perfPanel', true],
      ['tileGrid', true],
      ['mapTeleport', true],
      ['dummyShoot', true],
    ];
    for (const [k, v] of cases) c.set(k, v as never);
    assert.deepEqual(calls, ['quality:low', 'antialias:msaa', 'wind:gale', 'windDirection:left', 'tornado:true', 'precip:auto', 'rain:heavy', 'snow:light', 'water:emerald', 'perfPanel:true', 'tileGrid:true', 'mapTeleport:true', 'dummyShoot:true']);
    assert.deepEqual(JSON.parse(store.value ?? ''), { quality: 'low', antialias: 'msaa', wind: 'gale', windDirection: 'left', tornado: true, precip: 'auto', rain: 'heavy', snow: 'light', water: 'emerald', perfPanel: true, tileGrid: true, mapTeleport: true, dummyShoot: true });
    assert.deepEqual(c.current(), { minimapVisible: true, minimapOpacity: 75, windPower: 1, tornadoPower: 2, tornadoCount: 3, rainPower: 1, snowPower: 1, quality: 'low', antialias: 'msaa', wind: 'gale', windDirection: 'left', tornado: true, precip: 'auto', rain: 'heavy', snow: 'light', water: 'emerald', perfPanel: true, tileGrid: true, mapTeleport: true, dummyShoot: true });
    assert.equal(loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings.tileGrid, true, '下次启动恢复格子虚线开关');
    assert.equal(loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings.mapTeleport, true);
    assert.equal(loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings.precip, 'auto');
    const restored = loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings;
    assert.equal(restored.tornado, true);
    assert.equal(restored.wind, 'gale');
    assert.equal(restored.windDirection, 'left');
    assert.equal(restored.rain, 'heavy');
    assert.equal(restored.snow, 'light');
    c.set('quality', 'low');
    assert.equal(calls.length, 13, '值不变不重复调用');
    c.set('mapTeleport', false);
    assert.equal(c.current().mapTeleport, false);
    assert.equal(JSON.parse(store.value ?? '').mapTeleport, false);
    c.set('tileGrid', false);
    assert.equal(c.current().tileGrid, false);
    assert.equal(JSON.parse(store.value ?? '').tileGrid, false);
  });

  test('小地图显隐与不透明度即时应用，重启恢复保存值', () => {
    const { rt, state } = fakeRuntime();
    const store = memoryStore();
    const controller = createSettingsController({ runtime: rt, store, saved: {}, issues: [] });
    controller.set('minimapVisible', false);
    controller.set('minimapOpacity', 40);
    assert.equal(state.minimapVisible, false);
    assert.equal(state.minimapOpacity, 40);
    const restored = loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings;
    assert.equal(restored.minimapVisible, false);
    assert.equal(restored.minimapOpacity, 40);
  });

  test('非法值即抛、不调用运行时、不写存储', () => {
    const { rt, calls } = fakeRuntime();
    const store = memoryStore();
    const c = createSettingsController({ runtime: rt, store, saved: {}, issues: [] });
    assert.throws(() => c.set('quality', 'ultra' as never), /settings/);
    assert.throws(() => c.set('perfPanel', 1 as never), /settings/);
    assert.deepEqual(calls, []);
    assert.equal(store.writes, 0);
  });

  test('写存储失败：设置仍生效，面板提示（不静默）', () => {
    const { rt, calls } = fakeRuntime();
    const store: SettingsStore = {
      read: () => null,
      write: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const c = createSettingsController({ runtime: rt, store, saved: {}, issues: ['旧提示'] });
    c.set('water', 'deep');
    assert.deepEqual(calls, ['water:deep']);
    assert.equal(c.issues.length, 2);
    assert.match(c.issues[1] ?? '', /无法保存/);
    c.set('water', 'clear');
    assert.equal(c.issues.length, 2, '同一提示不重复追加');
  });

  test('打开暂停（sim 不步进）、关闭恢复；open 变化回调', () => {
    const { rt } = fakeRuntime();
    const changes: boolean[] = [];
    const c = createSettingsController({ runtime: rt, store: memoryStore(), saved: {}, issues: [], onOpenChange: (o) => changes.push(o) });
    let ticks = 0;
    let acc = 0;
    const stepper = {
      advance(elapsed: number, onTick: () => void) {
        acc += elapsed;
        while (acc >= 0.01 - 1e-12) {
          acc -= 0.01;
          onTick();
        }
        return acc / 0.01;
      },
    };
    const tick = () => void ticks++;
    const a1 = c.advance(stepper, 0.025, tick);
    assert.equal(ticks, 2);
    c.toggle();
    assert.equal(c.open, true);
    assert.equal(c.paused, true);
    const a2 = c.advance(stepper, 0.5, tick);
    assert.equal(ticks, 2, '暂停期间不步进');
    assert.equal(a2, a1, '暂停期间保持上一帧插值系数');
    c.setOpen(true);
    c.toggle();
    assert.equal(c.paused, false);
    c.advance(stepper, 0.01, tick);
    assert.equal(ticks, 3, '关闭后恢复，且不补暂停期间的时间');
    assert.deepEqual(changes, [true, false]);
  });
});

describe('新世界与种子', () => {
  test('parseSeed：uint32 十进制；非法即抛', () => {
    assert.equal(parseSeed('0'), 0);
    assert.equal(parseSeed('4294967295'), 4294967295);
    for (const bad of ['', '-1', '1.5', 'abc', '4294967296', '12345678901']) assert.throws(() => parseSeed(bad), /seed/, bad);
  });

  test('newWorldSearch：更换 seed 后清除旧关卡与地形定位，已有设置使用面板当前值', () => {
    const live: GameSettings = { ...DEFAULTS, water: 'deep', dummyShoot: false };
    const q = new URLSearchParams(newWorldSearch('?debug&level=test&seed=1&inspect=716&region=cave-11&scene=fortress&water=clear&dummyShoot', 42, live));
    assert.equal(q.get('seed'), '42');
    assert.equal(q.has('level'), false);
    assert.equal(q.has('inspect'), false, '新世界不能沿用旧种子的地形位置');
    assert.equal(q.has('region'), false);
    assert.equal(q.has('scene'), false);
    assert.equal(q.has('debug'), true);
    assert.equal(q.get('water'), 'deep');
    assert.equal(q.has('dummyShoot'), false, '关闭的开关参数删除');
    assert.equal(q.has('quality'), false, '原本没有的参数不添加（由保存值决定）');
  });
});

describe('按键：settings（Esc / O）', () => {
  test('settings 绑定 Escape 与 KeyO，是界面动作；缺绑定即抛；consumeUi 锁存一次', () => {
    assert.ok(GAME_ACTIONS.includes('settings'));
    assert.ok(UI_ACTIONS.includes('settings') && !PLAY_ACTIONS.includes('settings'));
    const lookup = buildBindingLookup(DEFAULT_BINDINGS);
    assert.equal(lookup.keys.get('Escape'), 'settings');
    assert.equal(lookup.keys.get('KeyO'), 'settings');
    const { settings: _omit, ...rest } = DEFAULT_BINDINGS;
    assert.throws(() => validateBindings(rest as unknown as Bindings), /'settings' has no binding/);
    const t = createActionTracker();
    t.press('settings', 'keyboard', 'Escape');
    t.release('settings', 'Escape');
    t.consume(null);
    assert.equal(t.consumeUi().settingsPressed, true, '模拟 tick 不吃掉 settings');
    assert.equal(t.consumeUi().settingsPressed, false);
  });

  test('H 帮助含设置一行', () => {
    assert.ok(CONTROL_HINTS.some((h) => h.startsWith('Esc / O 设置')));
  });
});

describe('设置面板 DOM', () => {
  function build(opts: { issues?: string[]; seed?: number | null; gm?: boolean } = {}) {
    const { rt, calls } = fakeRuntime();
    const store = memoryStore();
    const c = createSettingsController({ runtime: rt, store, saved: {}, issues: opts.issues ?? [] });
    const parent = new FakeElement('div');
    const worlds: number[] = [];
    const panel = withFakeDocument(() =>
      createSettingsPanel({ chapter: false, gm: opts.gm ?? true, parent: parent as unknown as HTMLElement, controller: c, seed: opts.seed === undefined ? 7 : opts.seed, onNewWorld: (s) => worlds.push(s), onShowcase: () => {}, random: () => 0.5 }),
    );
    return { rt, calls, c, parent, panel, worlds };
  }
  const all = (root: FakeElement, cls: string): FakeElement[] => {
    const out: FakeElement[] = [];
    const walk = (n: FakeElement) => {
      if (n.classList.contains(cls)) out.push(n);
      n.children.forEach(walk);
    };
    walk(root);
    return out;
  };
  const option = (root: FakeElement, key: string, value: string) => all(root, 'settings-option').find((b) => b.dataset.key === key && b.dataset.value === value);

  test('齿轮按钮切换面板；分组与选项按表生成；当前值高亮', () => {
    setLanguage('zh');
    const { parent, c, panel } = build();
    const gear = parent.find('settings-gear');
    const card = parent.find('settings-panel');
    assert.ok(gear && card);
    assert.equal(card.hidden, true);
    gear.dispatch('click');
    assert.equal(c.open, true);
    panel.update();
    assert.equal(card.hidden, false);
    const groups = all(card, 'settings-group-title').map((g) => g.textContent);
    assert.deepEqual(groups, ['画面', '天气', '水', '调试', '世界']);
    assert.equal(all(card, 'settings-option').length, SETTING_DEFS.reduce((n, d) => n + d.options.length, 0));
    assert.ok(option(card, 'quality', 'high')?.classList.contains('settings-active'));
    assert.ok(!option(card, 'quality', 'low')?.classList.contains('settings-active'));
    assert.match(all(card, 'settings-note').map((n) => n.textContent).join(' '), /MSAA 较慢/);
  });

  test('普通游戏设置可开关帧率，点击即时生效且同步外部快捷键的状态', () => {
    const { parent, calls, c, panel, rt } = build({ gm: false });
    c.setOpen(true);
    panel.update();
    option(parent, 'water', 'emerald')?.dispatch('click');
    option(parent, 'perfPanel', 'true')?.dispatch('click');
    assert.deepEqual(calls, ['water:emerald', 'perfPanel:true']);
    panel.update();
    assert.ok(option(parent, 'water', 'emerald')?.classList.contains('settings-active'));
    assert.ok(!option(parent, 'water', 'clear')?.classList.contains('settings-active'));
    assert.ok(option(parent, 'perfPanel', 'true')?.classList.contains('settings-active'));
    rt.setPerfPanel(false);
    rt.setWind('storm');
    panel.update();
    assert.ok(option(parent, 'perfPanel', 'false')?.classList.contains('settings-active'));
    assert.ok(option(parent, 'wind', 'storm')?.classList.contains('settings-active'));
  });

  test('提示条显示存储问题；无问题时隐藏', () => {
    const a = build({ issues: ['已清除无效的保存设置：画质 = "ultra"'] });
    a.c.setOpen(true);
    a.panel.update();
    const n = a.parent.find('settings-issues');
    assert.equal(n?.hidden, false);
    assert.match(n?.textContent ?? '', /ultra/);
    const b = build();
    b.c.setOpen(true);
    b.panel.update();
    assert.equal(b.parent.find('settings-issues')?.hidden, true);
  });

  test('新世界：合法种子 → onNewWorld；空 → 随机种子；非法 → 面板内提示、不跳转', () => {
    const { parent, worlds } = build();
    const input = parent.find('settings-seed');
    const go = parent.find('settings-new-world');
    assert.ok(input && go);
    assert.equal(input.value, '7', '当前种子预填');
    input.value = '123';
    go.dispatch('click');
    input.value = '  ';
    go.dispatch('click');
    assert.deepEqual(worlds, [123, Math.floor(0.5 * 0x100000000)]);
    input.value = 'abc';
    go.dispatch('click');
    assert.equal(worlds.length, 2);
    assert.match(parent.find('settings-seed-error')?.textContent ?? '', /seed|种子/);
    input.dispatch('keydown', { code: 'Enter', key: 'Enter' });
    assert.equal(worlds.length, 2);
  });

  test('输入框按键不冒泡到游戏（打字不触发武器/调试键）；dispose 移除元素', () => {
    const { parent, panel } = build();
    const input = parent.find('settings-seed');
    const ev = input?.dispatch('keydown', { code: 'Digit1', key: '1' });
    assert.equal(ev?.stopped, true);
    panel.dispose();
    assert.equal(parent.find('settings-panel'), null);
    assert.equal(parent.find('settings-gear'), null);
  });
});


test('连续天气强度从网址加载、实时应用并保存，非法强度拒绝', () => {
  const loaded = resolveSettings({ defaults: DEFAULTS, saved: {}, params: params('?windPower=4.5&rainPower=5&snowPower=3.2&tornadoPower=4&tornadoCount=6') });
  assert.equal(loaded.settings.windPower, 4.5);
  assert.equal(loaded.settings.rainPower, 5);
  assert.equal(loaded.settings.snowPower, 3.2);
  assert.equal(loaded.settings.tornadoCount, 6);
  for (const query of ['?windPower=NaN', '?rainPower=5.1', '?snowPower=-1', '?tornadoCount=2.5', '?tornadoPower=']) {
    assert.throws(() => resolveSettings({ defaults: DEFAULTS, saved: {}, params: params(query) }), /invalid/);
  }
  const { rt, state } = fakeRuntime();
  const store = memoryStore();
  const controller = createSettingsController({ runtime: rt, store, saved: {}, issues: [] });
  controller.set('windPower', 4.5);
  controller.set('rainPower', 0);
  controller.set('snowPower', 5);
  controller.set('tornadoPower', 4);
  controller.set('tornadoCount', 6);
  assert.equal(state.windPower, 4.5);
  assert.equal(state.rainPower, 0);
  assert.equal(state.snowPower, 5);
  assert.equal(state.tornadoPower, 4);
  assert.equal(state.tornadoCount, 6);
  const restored = loadSettings({ store, defaults: DEFAULTS, params: params('') }).settings;
  assert.equal(restored.windPower, 4.5);
  assert.equal(restored.rainPower, 0);
  assert.equal(restored.snowPower, 5);
  assert.equal(restored.tornadoPower, 4);
  assert.equal(restored.tornadoCount, 6);
});
