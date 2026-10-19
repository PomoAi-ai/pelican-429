// 分层规则（DESIGN.md §2）：扫描 src 下全部 .ts/.tsx/.js 的 import/export-from，按模块归属断言依赖方向。
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
  | 'three' | 'external' | 'style';

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
    else if (/\.(ts|tsx|js)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
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
export function stripComments(src: string, maskQuotedText = false): string {
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
      // 文档路径和说明里的 window/self 不是运行时全局访问；模板保留以检查插值表达式。
      out += maskQuotedText && c !== '`' ? src.slice(i, j + 1).replace(/[^\n]/g, ' ') : src.slice(i, j + 1);
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
  // 样式表不属于任何分层，只要求文件存在。
  return { target: rel.endsWith('.css') ? 'style' : groupOf(rel), resolved: rel };
}

/** React 与 Base UI 只允许出现在 ui。 */
const REACT_SPEC = /^(react|react-dom)(\/.*)?$|^@base-ui\/react(\/.*)?$/;

function dynamicImportEdges(code: string, rel: string): Edge[] {
  const edges: Edge[] = [];
  for (const match of code.matchAll(DYNAMIC_IMPORT)) {
    const literal = /^\s*(['"])([^'"\\\r\n]+)\1\s*\)/.exec(code.slice(match.index + match[0].length));
    if (literal === null) throw new Error(`architecture: dynamic import() in src/${rel} requires a literal path`);
    const spec = literal[2]!;
    const { target, resolved } = targetOf(rel, spec);
    const group = groupOf(rel);
    if ((group !== 'main' && group !== 'app') || (target !== 'app' && target !== 'ui' && target !== 'render')) {
      throw new Error(`architecture: dynamic import() in src/${rel} is only allowed from main/app to app/ui/render`);
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
  assert.doesNotMatch(stripComments('const label = "self-researched window";', true), /\b(self|window)\b/);
  assert.match(stripComments('const label = "window"; window.location;', true), /window\.location/);
  assert.match(stripComments('const label = `${window.location}`;', true), /window\.location/);
  assert.deepEqual(dynamicImportEdges(`const a = import('./app/game/game-app.ts'); const b = import("./render/webgpu/webgpu-stage.ts");`, 'main.ts'), [
    { spec: './app/game/game-app.ts', target: 'app', typeOnly: false, resolved: path.join('app', 'game', 'game-app.ts') },
    { spec: './render/webgpu/webgpu-stage.ts', target: 'render', typeOnly: false, resolved: path.join('render', 'webgpu', 'webgpu-stage.ts') },
  ]);
  assert.throws(() => dynamicImportEdges('import(route)', 'main.ts'), /requires a literal path/);
  assert.throws(() => dynamicImportEdges("import('../app/game/game-app.ts')", 'world/level.ts'), /only allowed from main\/app to app\/ui\/render/);
  assert.throws(() => dynamicImportEdges("import('./world/level.ts')", 'main.ts'), /only allowed from main\/app to app\/ui\/render/);
});

test('architecture: 相对导入均指向存在的文件且带扩展名', () => {
  const bad: string[] = [];
  for (const f of FILES) {
    for (const e of f.edges) {
      if (e.resolved === null) continue;
      if (!/\.(ts|tsx|js|css)$/.test(e.spec)) bad.push(`src/${f.rel} → '${e.spec}' (missing .ts/.tsx/.js/.css extension)`);
      else if (!existsSync(path.join(SRC, e.resolved))) bad.push(`src/${f.rel} → '${e.spec}' (file not found)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('architecture: 外部依赖限于 three、概念文档的 Markdown 转换器与 ui 内的 React/Base UI', () => {
  assert.deepEqual(violations(() => true, (e, f) => e.target !== 'external'
    || f.rel === 'ui/site/concept-markdown.ts' && e.spec === 'marked'
    || f.group === 'ui' && REACT_SPEC.test(e.spec)), []);
});

test('architecture: .tsx 文件与 React/Base UI 导入只出现在 ui', () => {
  assert.deepEqual(FILES.filter((f) => f.rel.endsWith('.tsx') && f.group !== 'ui').map((f) => `src/${f.rel}`), []);
  assert.deepEqual(violations((f) => f.group !== 'ui', (e) => !REACT_SPEC.test(e.spec)), []);
  assert.ok(['react', 'react-dom/client', 'react/jsx-runtime', '@base-ui/react/dialog'].every((spec) => REACT_SPEC.test(spec)));
  assert.ok(!REACT_SPEC.test('react-three') && !REACT_SPEC.test('@base-ui/reactive'));
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
    for (const [name, re] of forbidden) if (re.test(stripComments(f.code, true))) bad.push(`src/${f.rel} uses ${name}`);
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
  const allowed = (e: Edge, f: SourceFile): boolean =>
    (f.rel === 'ui/site/concept-markdown.ts' && e.spec === 'marked') ||
    (e.target === 'external' && REACT_SPEC.test(e.spec)) ||
    e.target === 'style' ||
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
  assert.equal(groupOf(['app', 'game', 'frame-loop.ts'].join(path.sep)), 'app');
});
