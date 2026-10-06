// 分层规则（DESIGN.md §2）：扫描 src 下全部 .ts/.js 的 import/export-from，按模块归属断言依赖方向。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

type Group =
  | 'core' | 'config' | 'world' | 'physics' | 'combat' | 'entities' | 'sim'
  | 'input/action-map' | 'input/keyboard-mouse' | 'render' | 'render/pelican-animator' | 'ui' | 'vendor' | 'app' | 'main'
  | 'three' | 'external';

const LOGIC: readonly Group[] = ['world', 'physics', 'combat', 'entities', 'sim'];

interface Edge {
  readonly spec: string;
  readonly target: Group;
  readonly typeOnly: boolean;
  /** 解析后的 src 相对路径（外部依赖为 null）。 */
  readonly resolved: string | null;
}

interface SourceFile {
  readonly rel: string;
  readonly group: Group;
  readonly code: string;
  readonly edges: readonly Edge[];
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|js)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** 鹈鹕动画纯计算组（任务 014 扩展）：不碰 three/vendor，对 render 其它文件只能 import type，组内可互相运行时 import。 */
const PELICAN_PURE = [
  'render/pelican/pelican-animator.ts',
  'render/pelican/pelican-pose.ts',
  'render/pelican/pelican-skeleton.ts',
  'render/pelican/pelican-gait.ts',
  'render/pelican/pelican-gait-tuning.ts',
  'render/pelican/pelican-gait-head.ts',
  'render/pelican/pelican-gait-plan.ts',
  'render/pelican/pelican-gait-core.ts',
  'render/pelican/pelican-ride-anim.ts',
  'render/pelican/pelican-attack-layer.ts',
] as const;

export function groupOf(rel: string): Group {
  const p = rel.split(path.sep).join('/');
  if (p === 'main.ts') return 'main';
  if (p === 'input/action-map.ts') return 'input/action-map';
  if (p === 'input/keyboard-mouse.ts') return 'input/keyboard-mouse';
  if ((PELICAN_PURE as readonly string[]).includes(p)) return 'render/pelican-animator';
  const top = p.split('/')[0];
  if (top === 'vendor') return 'vendor';
  if (top === 'app') return 'app';
  if (top === 'render') return 'render';
  if (top === 'ui') return 'ui';
  if (top === 'core' || top === 'config' || (LOGIC as readonly string[]).includes(top ?? '')) return top as Group;
  throw new Error(`architecture: file src/${p} does not belong to any known layer — add it to the layer rules`);
}

/** 去掉注释（保留字符串、模板字符串、正则字面量内容），换行保留以便报错定位。 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let prevSignificant = '';
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      prevSignificant = c;
      continue;
    }
    if (c === '/' && (prevSignificant === '' || '(,=:[!&|?{};'.includes(prevSignificant))) {
      // 正则字面量：跳到未转义且不在字符类中的结束斜杠。
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') j += 2;
        else {
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          j++;
        }
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      prevSignificant = '/';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out;
}

const STATIC_IMPORT = /^[ \t]*(import|export)\s+(type\s+)?([^;=()'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\s*\(/g;

function targetOf(fromRel: string, spec: string): { target: Group; resolved: string | null } {
  if (spec === 'three' || spec.startsWith('three/')) return { target: 'three', resolved: null };
  if (!spec.startsWith('.')) return { target: 'external', resolved: null };
  const abs = path.resolve(path.dirname(path.join(SRC, fromRel)), spec);
  const rel = path.relative(SRC, abs);
  if (rel.startsWith('..')) throw new Error(`architecture: src/${fromRel} imports outside src: '${spec}'`);
  return { target: groupOf(rel), resolved: rel };
}

function dynamicImportEdges(code: string, rel: string): Edge[] {
  const edges: Edge[] = [];
  for (const match of code.matchAll(DYNAMIC_IMPORT)) {
    const literal = /^\s*(['"])([^'"\\\r\n]+)\1\s*\)/.exec(code.slice(match.index + match[0].length));
    if (literal === null) throw new Error(`architecture: dynamic import() in src/${rel} requires a literal path`);
    const spec = literal[2]!;
    const { target, resolved } = targetOf(rel, spec);
    const group = groupOf(rel);
    if ((group !== 'main' && group !== 'app') || target !== 'app') {
      throw new Error(`architecture: dynamic import() in src/${rel} is only allowed from main/app to app`);
    }
    edges.push({ spec, target, typeOnly: false, resolved });
  }
  return edges;
}

function parse(abs: string): SourceFile {
  const rel = path.relative(SRC, abs);
  const code = stripComments(readFileSync(abs, 'utf8'));
  const edges = dynamicImportEdges(code, rel);
  for (const m of code.matchAll(STATIC_IMPORT)) {
    const spec = m[4] as string;
    const { target, resolved } = targetOf(rel, spec);
    edges.push({ spec, target, typeOnly: m[2] !== undefined, resolved });
  }
  return { rel: rel.split(path.sep).join('/'), group: groupOf(rel), code, edges };
}

const FILES: readonly SourceFile[] = listFiles(SRC).map(parse);

function violations(predicate: (f: SourceFile) => boolean, allowed: (e: Edge, f: SourceFile) => boolean): string[] {
  const out: string[] = [];
  for (const f of FILES.filter(predicate)) {
    for (const e of f.edges) if (!allowed(e, f)) out.push(`src/${f.rel} → '${e.spec}' (${e.target}${e.typeOnly ? ', type' : ''})`);
  }
  return out;
}

test('architecture: 扫描器能识别已知依赖（防止规则空转）', () => {
  const sim = FILES.find((f) => f.rel === 'sim/sim-world.ts');
  assert.ok(sim, 'sim/sim-world.ts should be scanned');
  assert.ok(sim.edges.some((e) => e.target === 'entities'), 'sim-world imports entities');
  const rig = FILES.find((f) => f.rel === 'render/pelican/pelican-rig.ts');
  assert.ok(rig?.edges.some((e) => e.target === 'three' && !e.typeOnly), 'pelican-rig imports three');
  assert.ok(rig?.edges.some((e) => e.target === 'vendor'), 'pelican-rig imports vendor');
  const actionMap = FILES.find((f) => f.rel === 'input/action-map.ts');
  assert.ok(actionMap?.edges.some((e) => e.target === 'sim' && e.typeOnly), 'action-map imports sim types');
  const groups = new Set(FILES.map((f) => f.group));
  for (const g of ['core', 'config', 'world', 'physics', 'combat', 'entities', 'sim', 'render', 'vendor', 'ui', 'main'] as const) {
    assert.ok(groups.has(g), `layer ${g} should have files`);
  }
  assert.equal(stripComments("const a = 1; // window\n/* document */ const b = '//x';"), "const a = 1; \n               const b = '//x';");
  assert.deepEqual(dynamicImportEdges(`const a = import('./app/game-app.ts'); const b = import("./app/story-app.ts");`, 'main.ts'), [
    { spec: './app/game-app.ts', target: 'app', typeOnly: false, resolved: path.join('app', 'game-app.ts') },
    { spec: './app/story-app.ts', target: 'app', typeOnly: false, resolved: path.join('app', 'story-app.ts') },
  ]);
  assert.throws(() => dynamicImportEdges('import(route)', 'main.ts'), /requires a literal path/);
  assert.throws(() => dynamicImportEdges("import('../app/game-app.ts')", 'world/level.ts'), /only allowed from main\/app to app/);
  assert.throws(() => dynamicImportEdges("import('./world/level.ts')", 'main.ts'), /only allowed from main\/app to app/);
});

test('architecture: 相对导入均指向存在的文件且带扩展名', () => {
  const bad: string[] = [];
  for (const f of FILES) {
    for (const e of f.edges) {
      if (e.resolved === null) continue;
      if (!/\.(ts|js)$/.test(e.spec)) bad.push(`src/${f.rel} → '${e.spec}' (missing .ts/.js extension)`);
      else if (!existsSync(path.join(SRC, e.resolved))) bad.push(`src/${f.rel} → '${e.spec}' (file not found)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('architecture: 只允许 three 这一个外部依赖', () => {
  assert.deepEqual(violations(() => true, (e) => e.target !== 'external'), []);
});

test('architecture: core 无内部依赖', () => {
  assert.deepEqual(violations((f) => f.group === 'core', (e) => e.target === 'core'), []);
});

test('architecture: config 只依赖 core', () => {
  assert.deepEqual(violations((f) => f.group === 'config', (e) => e.target === 'core' || e.target === 'config'), []);
});

test('architecture: 逻辑层 world→physics→combat→entities→sim 只向左依赖，不碰 three/vendor/render/input/ui/main', () => {
  const allowed = (e: Edge, f: SourceFile): boolean => {
    if (e.target === 'core' || e.target === 'config') return true;
    const own = LOGIC.indexOf(f.group);
    const dep = LOGIC.indexOf(e.target);
    return dep !== -1 && dep <= own;
  };
  assert.deepEqual(violations((f) => LOGIC.includes(f.group), allowed), []);
});

test('architecture: 纯逻辑代码（core/config/逻辑层/action-map）不使用 DOM、实时时钟与随机数', () => {
  const forbidden: ReadonlyArray<[string, RegExp]> = [
    ['window', /\bwindow\b/],
    ['document', /\bdocument\b/],
    ['requestAnimationFrame', /\brequestAnimationFrame\b/],
    ['performance.now', /\bperformance\s*\.\s*now\b/],
    ['Math.random', /\bMath\s*\.\s*random\b/],
    ['Date', /\bDate\b/],
    ['setTimeout', /\bsetTimeout\b/],
    ['setInterval', /\bsetInterval\b/],
    ['globalThis', /\bglobalThis\b/],
    ['self', /(?<![.\w$])self\b/],
    ['navigator', /\bnavigator\b/],
    ['crypto', /\bcrypto\b/],
    ['import.meta', /\bimport\s*\.\s*meta\b/],
  ];
  // animator 以注入 rng 默认 Math.random 实现眨眼，属渲染层允许的随机，故不纳入随机数检查。
  const pure = FILES.filter((f) => ['core', 'config', ...LOGIC, 'input/action-map'].includes(f.group));
  assert.ok(pure.length >= 15, `expected the pure layers to be scanned, got ${pure.length} files`);
  const bad: string[] = [];
  for (const f of pure) {
    for (const [name, re] of forbidden) if (re.test(f.code)) bad.push(`src/${f.rel} uses ${name}`);
  }
  assert.deepEqual(bad, []);
});

test('architecture: input/action-map 仅依赖 core/config，sim 只能 import type', () => {
  const allowed = (e: Edge): boolean => e.target === 'core' || e.target === 'config' || (e.target === 'sim' && e.typeOnly);
  assert.deepEqual(violations((f) => f.group === 'input/action-map', allowed), []);
});

test('architecture: input/keyboard-mouse 白名单：仅 core（运行时）与 config/input/action-map（import type）', () => {
  const allowed = (e: Edge): boolean =>
    e.target === 'core' || ((e.target === 'config' || e.target === 'input/action-map') && e.typeOnly);
  const km = FILES.find((f) => f.rel === 'input/keyboard-mouse.ts');
  assert.ok(km && km.edges.length > 0, 'keyboard-mouse should be scanned with imports');
  assert.deepEqual(violations((f) => f.group === 'input/keyboard-mouse', allowed), []);
});

test('architecture: 纯逻辑禁用标识正则自检（不误伤成员访问/标识符片段）', () => {
  const self = /(?<![.\w$])self\b/;
  assert.ok(self.test('const a = self.postMessage;'));
  assert.ok(!self.test('this.self = 1; const myself = 2; const $self = 3;'));
  assert.ok(/\bimport\s*\.\s*meta\b/.test('const x = import.meta.glob("*.ts");'));
  assert.ok(/\bDate\b/.test('Date.now()') && !/\bDate\b/.test('const updated = 1; const lastDate_ = 2;'));
});

test('architecture: 011 新文件归入正确分层', () => {
  const expected: ReadonlyArray<[string, Group]> = [
    ['core/rng.ts', 'core'],
    ['core/game-events.ts', 'core'],
    ['world/worldgen.ts', 'world'],
    ['world/reachability.ts', 'world'],
    ['world/level.ts', 'world'],
    ['entities/projectile.ts', 'entities'],
    ['render/orb-view.ts', 'render'],
    ['render/orb-fx.ts', 'render'],
    ['render/pelican/beak-split.ts', 'render'],
  ];
  for (const [rel, group] of expected) assert.equal(groupOf(rel.split('/').join(path.sep)), group, rel);
  // 已存在的新文件必须被扫描到（防止规则空转）
  for (const [rel, group] of expected) {
    if (!existsSync(path.join(SRC, rel))) continue;
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `src/${rel} should be scanned`);
    assert.equal(f.group, group);
  }
  // 任务 018：光球并入通用投射物 entities/projectile.ts。
  const projectile = FILES.find((f) => f.rel === 'entities/projectile.ts');
  assert.ok(projectile?.edges.some((e) => e.target === 'physics'), 'entities/projectile imports physics');
});

test('architecture: 012 新文件归入正确分层（存在才校验扫描）', () => {
  const expected: ReadonlyArray<[string, Group]> = [
    ['world/fluid-map.ts', 'world'],
    ['world/fluid-sim.ts', 'world'],
    ['world/trees.ts', 'world'],
    ['physics/fluid-contact.ts', 'physics'],
    ['config/worldgen-rules.ts', 'config'],
    ['render/tile-textures.ts', 'render'],
    ['render/tile-geometry.ts', 'render'],
    ['render/tile-material.ts', 'render'],
    ['render/chunk-streamer.ts', 'render'],
    ['render/water-view.ts', 'render'],
    ['render/tree-geometry.ts', 'render'],
    ['render/tree-view.ts', 'render'],
  ];
  for (const [rel, group] of expected) assert.equal(groupOf(rel.split('/').join(path.sep)), group, rel);
  for (const [rel, group] of expected) {
    if (!existsSync(path.join(SRC, rel))) continue;
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `src/${rel} should be scanned`);
    assert.equal(f.group, group);
  }
  // 液体逻辑必须在逻辑层内：fluid-contact（physics）只向左依赖 world，sim 驱动 fluid-sim。
  const contact = FILES.find((f) => f.rel === 'physics/fluid-contact.ts');
  if (contact) assert.ok(contact.edges.some((e) => e.target === 'world'), 'physics/fluid-contact imports world/fluid-map');
  const sim = FILES.find((f) => f.rel === 'sim/sim-world.ts');
  assert.ok(sim?.edges.some((e) => e.resolved?.split(path.sep).join('/') === 'world/fluid-sim.ts'), 'sim-world drives world/fluid-sim');
});

test('architecture: 013 新文件归入正确分层，关键依赖边存在', () => {
  const expected: ReadonlyArray<[string, Group]> = [
    ['world/tile-shapes.ts', 'world'],
    ['world/slopes.ts', 'world'],
    ['world/structures.ts', 'world'],
    ['world/fish-spawns.ts', 'world'],
    ['world/worldgen-verify.ts', 'world'],
    ['entities/fish.ts', 'entities'],
    ['render/flora.ts', 'render'],
    ['render/flora-geometry.ts', 'render'],
    ['render/ground-profile.ts', 'render'],
    ['render/water-weeds.ts', 'render'],
    ['render/tree-skeleton.ts', 'render'],
    ['render/tree-kinds.ts', 'render'],
    ['render/petal-fx.ts', 'render'],
    ['render/hut-geometry.ts', 'render'],
    ['render/structure-view.ts', 'render'],
    ['render/fish-view.ts', 'render'],
    ['render/tile-organic.ts', 'render'],
    ['render/world-views.ts', 'render'],
  ];
  for (const [rel, group] of expected) {
    assert.ok(existsSync(path.join(SRC, rel)), `src/${rel} should exist`);
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `src/${rel} should be scanned`);
    assert.equal(f.group, group, rel);
  }
  const imports = (from: string, to: string): boolean =>
    FILES.find((f) => f.rel === from)?.edges.some((e) => e.resolved?.split(path.sep).join('/') === to) ?? false;
  assert.ok(imports('physics/tile-collision.ts', 'world/tile-shapes.ts'), 'tile-collision is shape-aware');
  assert.ok(imports('sim/sim-world.ts', 'entities/fish.ts'), 'sim-world steps the fish');
  assert.ok(imports('app/game-app.ts', 'render/world-views.ts'), 'game app assembles world views');
  for (const dep of ['render/fish-view.ts', 'render/structure-view.ts', 'render/water-weeds.ts', 'render/petal-fx.ts', 'render/ground-profile.ts']) {
    assert.ok(imports('render/world-views.ts', dep), `world-views wires ${dep}`);
  }
  const fish = FILES.find((f) => f.rel === 'entities/fish.ts');
  assert.deepEqual(fish?.edges.filter((e) => e.target === 'combat').map((e) => e.spec), [], 'fish stays out of combat');
  // 规划函数（花草/树骨架）只用 core/rng 等纯依赖，不碰 DOM 随机：Math.random 禁用于 world 新文件由纯逻辑用例覆盖。
  for (const rel of ['render/flora.ts', 'render/tree-skeleton.ts']) {
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f && !/\bMath\s*\.\s*random\b/.test(f.code), `${rel} plans deterministically (no Math.random)`);
  }
});

test('architecture: render 不依赖 input/ui/main', () => {
  const banned: readonly Group[] = ['input/action-map', 'input/keyboard-mouse', 'ui', 'main'];
  const isRender = (f: SourceFile): boolean => f.group === 'render' || f.group === 'render/pelican-animator';
  assert.deepEqual(violations(isRender, (e) => !banned.includes(e.target)), []);
});

test('architecture: pelican-animator 纯组（animator/pose/skeleton/gait/ride-anim）不依赖 three/vendor，render 其它文件仅 import type', () => {
  const allowed = (e: Edge): boolean => e.target !== 'three' && e.target !== 'vendor' && (e.target !== 'render' || e.typeOnly);
  assert.deepEqual(violations((f) => f.group === 'render/pelican-animator', allowed), []);
});

/**
 * 任务 016 小地图：ui 可运行时 import 的 world 纯模块（只有常量与纯函数、无模块级状态/副作用）——
 * 形状顶高 shapeTopAt 与水量上限 FLUID_FULL；其余 world/sim 仍只能 import type（数据由组合根注入、只读）。
 */
const UI_RUNTIME_WORLD = ['world/tile-shapes.ts', 'world/fluid-map.ts'] as const;

test('architecture: ui 不依赖 three/render/vendor/input/main，逻辑层只能 import type（world 纯常量模块白名单除外）', () => {
  const allowed = (e: Edge): boolean =>
    e.target === 'core' ||
    e.target === 'config' ||
    e.target === 'ui' ||
    (LOGIC.includes(e.target) && e.typeOnly) ||
    (e.target === 'world' && (UI_RUNTIME_WORLD as readonly string[]).includes(e.resolved?.split(path.sep).join('/') ?? ''));
  assert.deepEqual(violations((f) => f.group === 'ui', allowed), []);
});

/** vendor 包名：vendor/<pkg>/** 的 <pkg>。 */
const vendorPackage = (rel: string): string | null => {
  const parts = rel.split(path.sep).join('/').split('/');
  return parts[0] === 'vendor' && parts.length > 2 ? (parts[1] ?? null) : null;
};

test('architecture: vendor 只依赖 three（含 three/addons）或同一 vendor 包内的相对路径文件', () => {
  const allowed = (e: Edge, f: SourceFile): boolean => {
    if (e.target === 'three') return true;
    const own = vendorPackage(f.rel);
    return own !== null && e.resolved !== null && e.spec.startsWith('.') && vendorPackage(e.resolved) === own;
  };
  const vendor = FILES.filter((f) => f.group === 'vendor');
  assert.ok(vendor.every((f) => vendorPackage(f.rel) !== null), 'vendor files live in vendor/<pkg>/');
  assert.ok(vendor.some((f) => f.edges.some((e) => e.spec.startsWith('../'))), 'cross-directory edges inside the package are scanned');
  assert.deepEqual(violations((f) => f.group === 'vendor', allowed), []);
  // 规则自检：跨包、跳出包都不允许。
  assert.equal(vendorPackage(['vendor', 'pelican-3d', 'motion.js'].join(path.sep)), 'pelican-3d');
  assert.equal(vendorPackage(['vendor', 'x.js'].join(path.sep)), null);
});

test('architecture: 014 新文件归入正确分层（存在才校验扫描与依赖边）', () => {
  const expected: ReadonlyArray<[string, Group]> = [
    ['entities/pelican-ride.ts', 'entities'],
    ['physics/ride-probe.ts', 'physics'],
    ['render/pelican/pelican-animator.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-pose.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-skeleton.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-gait.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-gait-tuning.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-gait-head.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-gait-plan.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-ride-anim.ts', 'render/pelican-animator'],
    ['render/pelican/pelican-bike.ts', 'render'],
    ['render/pelican/pelican-follow-rig.ts', 'render'],
    ['render/pelican/pelican-legs.ts', 'render'],
    ['render/pelican/pelican-rig.ts', 'render'],
    ['vendor/pelican-3d/standing-ride/riding-pelican.js', 'vendor'],
    ['vendor/pelican-3d/standing-hub/standing-bird.js', 'vendor'],
  ];
  for (const [rel, group] of expected) assert.equal(groupOf(rel.split('/').join(path.sep)), group, rel);
  for (const [rel, group] of expected) {
    if (!existsSync(path.join(SRC, rel))) continue;
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `src/${rel} should be scanned`);
    assert.equal(f.group, group, rel);
  }
  const imports = (from: string, to: (resolved: string) => boolean): boolean =>
    FILES.find((f) => f.rel === from)?.edges.some((e) => e.resolved !== null && to(e.resolved.split(path.sep).join('/'))) ?? false;
  // rig 使用新 vendor 路径（W0 起即成立）。
  assert.ok(imports('render/pelican/pelican-rig.ts', (r) => r === 'vendor/pelican-3d/standing-hub/standing-bird.js'), 'pelican-rig imports vendor/pelican-3d/standing-hub');
  // 以下依赖边在对应文件落地后才断言（集成阶段全部成立）。
  const exists = (rel: string): boolean => existsSync(path.join(SRC, rel));
  if (exists('entities/pelican-ride.ts')) {
    assert.ok(imports('sim/sim-world.ts', (r) => r === 'entities/pelican-ride.ts'), 'sim-world resolves the ride');
  }
  if (exists('render/pelican/pelican-bike.ts')) {
    assert.ok(imports('render/pelican/pelican-bike.ts', (r) => r.startsWith('vendor/pelican-3d/standing-ride/')), 'pelican-bike builds on vendor/standing-ride');
  }
  if (exists('render/pelican/pelican-legs.ts')) {
    assert.ok(imports('render/pelican/pelican-legs.ts', (r) => r.startsWith('vendor/pelican-3d/standing-ride/')), 'pelican-legs builds on vendor/standing-ride');
  }
  if (exists('render/pelican/pelican-gait.ts') && FILES.find((f) => f.rel === 'render/pelican/pelican-animator.ts')?.code.includes('createGait')) {
    assert.ok(imports('render/pelican/pelican-animator.ts', (r) => r === 'render/pelican/pelican-gait.ts'), 'animator drives the gait');
  }
});

test('architecture: 018 远程武器文件归入正确分层，关键依赖边存在', () => {
  const expected: ReadonlyArray<[string, Group]> = [
    ['core/weapon-ids.ts', 'core'],
    ['config/weapon-rules.ts', 'config'],
    ['entities/projectile.ts', 'entities'],
    ['entities/pelican-weapons.ts', 'entities'],
    ['entities/enemy-shooter.ts', 'entities'],
    ['sim/weapon-system.ts', 'sim'],
    ['render/projectile-views.ts', 'render'],
    ['render/projectile-fx.ts', 'render'],
    ['render/particle-pool.ts', 'render'],
    ['render/pelican-weapon-view.ts', 'render'],
    ['render/pelican/pelican-pouch.ts', 'render'],
    ['render/pelican/pelican-attack-layer.ts', 'render/pelican-animator'],
    ['ui/weapon-hud.ts', 'ui'],
  ];
  for (const [rel, group] of expected) {
    assert.ok(existsSync(path.join(SRC, rel)), `src/${rel} should exist`);
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `src/${rel} should be scanned`);
    assert.equal(f.group, group, rel);
  }
  const imports = (from: string, to: string): boolean =>
    FILES.find((f) => f.rel === from)?.edges.some((e) => e.resolved?.split(path.sep).join('/') === to) ?? false;
  assert.ok(imports('sim/sim-world.ts', 'sim/weapon-system.ts'), 'sim-world drives the weapon system');
  assert.ok(imports('sim/sim-world.ts', 'entities/projectile.ts'), 'sim-world steps projectiles');
  assert.ok(imports('entities/pelican-controller.ts', 'entities/pelican-weapons.ts'), 'controller runs the weapons');
  assert.ok(imports('config/tuning.ts', 'config/weapon-rules.ts'), 'tuning validates the weapons table');
  assert.ok(imports('render/entity-views.ts', 'render/pelican/pelican-attack-layer.ts'), 'pelican view composes the attack layer');
  // 任务 019 收尾：实体视图/特效接线拆到 app/scene-wiring（组合根辅助），main 装配。
  assert.ok(imports('app/scene-wiring.ts', 'render/projectile-fx.ts') && imports('app/game-app.ts', 'app/scene-wiring.ts') && imports('app/game-app.ts', 'ui/weapon-hud.ts'), 'game app wires fx and HUD');
  assert.ok(!existsSync(path.join(SRC, 'entities/orb.ts')), 'orb merged into the generic projectile');
  // sim/weapon-system 不运行时依赖 sim-world（避免循环）。
  const ws = FILES.find((f) => f.rel === 'sim/weapon-system.ts');
  assert.deepEqual(ws?.edges.filter((e) => e.resolved?.split(path.sep).join('/') === 'sim/sim-world.ts' && !e.typeOnly).map((e) => e.spec), []);
});

test('architecture: 除 main 外没有模块依赖 main', () => {
  assert.deepEqual(violations(() => true, (e) => e.target !== 'main'), []);
});

/**
 * 任务 019 收尾：src/app/ 是从 main.ts 拆出的组合根辅助模块（设置面板接线、光照/降水接线、帧循环等）。
 * app 可依赖除 main 以外的任何层；只有 main 与 app 自身可以依赖 app。
 */
test('architecture: app（组合根辅助）只被 main/app 依赖，自身不依赖 main', () => {
  const app = FILES.filter((f) => f.group === 'app');
  assert.ok(app.length >= 2, `expected src/app/ composition helpers to be scanned, got ${app.length}`);
  assert.deepEqual(violations((f) => f.group === 'app', (e) => e.target !== 'main' && e.target !== 'external'), []);
  assert.deepEqual(violations((f) => f.group !== 'main' && f.group !== 'app', (e) => e.target !== 'app'), []);
  assert.ok(FILES.find((f) => f.rel === 'main.ts')?.edges.some((e) => e.target === 'app'), 'main wires the app helpers');
  assert.equal(groupOf(['app', 'frame-loop.ts'].join(path.sep)), 'app');
});
