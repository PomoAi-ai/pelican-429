// GLSL 子集解释器（测试用）：把顶点着色器里的标量 / vec2 函数在 JS 中求值，用于 JS 镜像与 GLSL 的逐式比对。
// 支持：float / vec2 函数定义与局部声明、if (...) return、return、赋值；+ − * /、比较、&& ||、一元负号、.x/.y 分量、
// 内建 sin cos abs pow sqrt min max clamp smoothstep normalize length vec2。遇到不支持的语法即抛（保证比对的确实是着色器源码）。
// 浮点按 JS double 求值（与 GPU float 的差异不在比对范围内：比对的是公式是否同式）。

type Value = number | readonly number[];
type Env = Map<string, Value>;
type Expr = (env: Env) => Value;
type Stmt = (env: Env) => { ret: Value } | null;

interface Token {
  readonly kind: 'num' | 'id' | 'op';
  readonly text: string;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|([A-Za-z_]\w*)|(==|!=|<=|>=|&&|\|\||[-+*/()<>{},;=.!]))/y;
  let i = 0;
  const s = src.replace(/\/\/.*$/gm, '');
  while (i < s.length) {
    if (/^\s*$/.test(s.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error(`glsl-eval: cannot tokenize near '${s.slice(i, i + 30)}'`);
    i = re.lastIndex;
    if (m[1] !== undefined) out.push({ kind: 'num', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'id', text: m[2] });
    else out.push({ kind: 'op', text: m[3] as string });
  }
  return out;
}

const isVec = (v: Value): v is readonly number[] => typeof v !== 'number';

function zip(a: Value, b: Value, f: (x: number, y: number) => number): Value {
  if (!isVec(a) && !isVec(b)) return f(a, b);
  const n = isVec(a) ? a.length : (b as readonly number[]).length;
  if (isVec(a) && isVec(b) && a.length !== b.length) throw new Error('glsl-eval: vector size mismatch');
  return Array.from({ length: n }, (_, i) => f(isVec(a) ? (a[i] as number) : a, isVec(b) ? (b[i] as number) : b));
}

const num = (v: Value, what: string): number => {
  if (isVec(v)) throw new Error(`glsl-eval: ${what} expects a scalar`);
  return v;
};

const BUILTINS: Readonly<Record<string, (...a: Value[]) => Value>> = {
  sin: (a) => zip(a as Value, 0, (x) => Math.sin(x)),
  cos: (a) => zip(a as Value, 0, (x) => Math.cos(x)),
  abs: (a) => zip(a as Value, 0, (x) => Math.abs(x)),
  sqrt: (a) => zip(a as Value, 0, (x) => Math.sqrt(x)),
  pow: (a, b) => zip(a as Value, b as Value, Math.pow),
  min: (a, b) => zip(a as Value, b as Value, Math.min),
  max: (a, b) => zip(a as Value, b as Value, Math.max),
  clamp: (v, lo, hi) => zip(zip(v as Value, lo as Value, Math.max), hi as Value, Math.min),
  smoothstep: (a, b, v) => {
    const t = Math.min(1, Math.max(0, (num(v as Value, 'smoothstep') - num(a as Value, 'smoothstep')) / (num(b as Value, 'smoothstep') - num(a as Value, 'smoothstep'))));
    return t * t * (3 - 2 * t);
  },
  length: (a) => (isVec(a as Value) ? Math.hypot(...(a as readonly number[])) : Math.abs(a as number)),
  normalize: (a) => {
    const v = a as readonly number[];
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  },
  vec2: (...a) => {
    if (a.length === 1) return [num(a[0] as Value, 'vec2'), num(a[0] as Value, 'vec2')];
    if (a.length !== 2) throw new Error('glsl-eval: vec2 expects 1 or 2 scalars');
    return [num(a[0] as Value, 'vec2'), num(a[1] as Value, 'vec2')];
  },
};

const TYPES = new Set(['float', 'vec2']);

class Parser {
  #i = 0;
  readonly #t: Token[];
  readonly fns = new Map<string, (...a: Value[]) => Value>();
  readonly #globals: Env;

  constructor(tokens: Token[], globals: Env) {
    this.#t = tokens;
    this.#globals = globals;
  }

  #peek(o = 0): Token | undefined {
    return this.#t[this.#i + o];
  }

  #next(): Token {
    const t = this.#t[this.#i++];
    if (!t) throw new Error('glsl-eval: unexpected end of source');
    return t;
  }

  #expect(text: string): void {
    const t = this.#next();
    if (t.text !== text) throw new Error(`glsl-eval: expected '${text}', got '${t.text}'`);
  }

  #accept(text: string): boolean {
    if (this.#peek()?.text === text) {
      this.#i++;
      return true;
    }
    return false;
  }

  program(): void {
    while (this.#peek()) {
      const t = this.#next();
      if (t.text === 'attribute' || t.text === 'uniform' || t.text === 'varying') {
        while (this.#next().text !== ';');
        continue;
      }
      if (!TYPES.has(t.text)) throw new Error(`glsl-eval: unsupported top-level token '${t.text}'`);
      this.#function();
    }
  }

  #function(): void {
    const name = this.#next().text;
    this.#expect('(');
    const params: string[] = [];
    while (!this.#accept(')')) {
      const type = this.#next().text;
      if (!TYPES.has(type)) throw new Error(`glsl-eval: unsupported parameter type '${type}' in ${name}`);
      params.push(this.#next().text);
      this.#accept(',');
    }
    const body = this.#block();
    const globals = this.#globals;
    this.fns.set(name, (...args) => {
      const env: Env = new Map(globals);
      params.forEach((p, k) => env.set(p, args[k] as Value));
      for (const s of body) {
        const r = s(env);
        if (r) return r.ret;
      }
      throw new Error(`glsl-eval: ${name} returned nothing`);
    });
  }

  #block(): Stmt[] {
    this.#expect('{');
    const out: Stmt[] = [];
    while (!this.#accept('}')) out.push(this.#statement());
    return out;
  }

  #statement(): Stmt {
    const t = this.#peek() as Token;
    if (t.text === 'return') {
      this.#next();
      const e = this.#expr();
      this.#expect(';');
      return (env) => ({ ret: e(env) });
    }
    if (t.text === 'if') {
      this.#next();
      this.#expect('(');
      const c = this.#expr();
      this.#expect(')');
      const then = this.#peek()?.text === '{' ? this.#block() : [this.#statement()];
      if (this.#peek()?.text === 'else') throw new Error('glsl-eval: else is not supported');
      return (env) => {
        if (!c(env)) return null;
        for (const s of then) {
          const r = s(env);
          if (r) return r;
        }
        return null;
      };
    }
    if (TYPES.has(t.text)) {
      this.#next();
      const name = this.#next().text;
      this.#expect('=');
      const e = this.#expr();
      this.#expect(';');
      return (env) => {
        env.set(name, e(env));
        return null;
      };
    }
    if (t.kind === 'id' && this.#peek(1)?.text === '=') {
      this.#next();
      this.#next();
      const e = this.#expr();
      this.#expect(';');
      return (env) => {
        env.set(t.text, e(env));
        return null;
      };
    }
    throw new Error(`glsl-eval: unsupported statement at '${t.text}'`);
  }

  #expr(): Expr {
    return this.#or();
  }

  #or(): Expr {
    let l = this.#and();
    while (this.#accept('||')) {
      const a = l;
      const b = this.#and();
      l = (env) => (a(env) || b(env) ? 1 : 0);
    }
    return l;
  }

  #and(): Expr {
    let l = this.#cmp();
    while (this.#accept('&&')) {
      const a = l;
      const b = this.#cmp();
      l = (env) => (a(env) && b(env) ? 1 : 0);
    }
    return l;
  }

  #cmp(): Expr {
    const l = this.#add();
    const op = this.#peek()?.text;
    if (op && ['==', '!=', '<', '<=', '>', '>='].includes(op)) {
      this.#next();
      const r = this.#add();
      return (env) => {
        const a = num(l(env), op);
        const b = num(r(env), op);
        const v = op === '==' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
        return v ? 1 : 0;
      };
    }
    return l;
  }

  #add(): Expr {
    let l = this.#mul();
    for (;;) {
      const op = this.#peek()?.text;
      if (op !== '+' && op !== '-') return l;
      this.#next();
      const a = l;
      const b = this.#mul();
      l = op === '+' ? (env) => zip(a(env), b(env), (x, y) => x + y) : (env) => zip(a(env), b(env), (x, y) => x - y);
    }
  }

  #mul(): Expr {
    let l = this.#unary();
    for (;;) {
      const op = this.#peek()?.text;
      if (op !== '*' && op !== '/') return l;
      this.#next();
      const a = l;
      const b = this.#unary();
      l = op === '*' ? (env) => zip(a(env), b(env), (x, y) => x * y) : (env) => zip(a(env), b(env), (x, y) => x / y);
    }
  }

  #unary(): Expr {
    if (this.#accept('-')) {
      const e = this.#unary();
      return (env) => zip(e(env), 0, (x) => -x);
    }
    return this.#postfix();
  }

  #postfix(): Expr {
    let e = this.#primary();
    while (this.#accept('.')) {
      const field = this.#next().text;
      const idx = { x: 0, y: 1, z: 2, w: 3 }[field];
      if (idx === undefined) throw new Error(`glsl-eval: unsupported swizzle .${field}`);
      const base = e;
      e = (env) => {
        const v = base(env);
        if (!isVec(v)) throw new Error(`glsl-eval: .${field} on a scalar`);
        return v[idx] as number;
      };
    }
    return e;
  }

  #primary(): Expr {
    const t = this.#next();
    if (t.kind === 'num') {
      const v = Number.parseFloat(t.text);
      return () => v;
    }
    if (t.text === '(') {
      const e = this.#expr();
      this.#expect(')');
      return e;
    }
    if (t.kind !== 'id') throw new Error(`glsl-eval: unexpected '${t.text}'`);
    if (this.#accept('(')) {
      const args: Expr[] = [];
      while (!this.#accept(')')) {
        args.push(this.#expr());
        this.#accept(',');
      }
      const name = t.text;
      return (env) => {
        const f = this.fns.get(name) ?? BUILTINS[name];
        if (!f) throw new Error(`glsl-eval: unknown function ${name}`);
        return f(...args.map((a) => a(env)));
      };
    }
    const name = t.text;
    return (env) => {
      const v = env.get(name);
      if (v === undefined) throw new Error(`glsl-eval: unbound identifier ${name}`);
      return v;
    };
  }
}

/** 解析 GLSL 源（函数定义 + 可忽略的 attribute/uniform 声明），uniforms 作为全局常量；返回函数表（参数/返回值：number 或 number[]）。 */
export function evalGlsl(src: string, uniforms: Readonly<Record<string, number>>): Map<string, (...a: Value[]) => Value> {
  const p = new Parser(tokenize(src), new Map(Object.entries(uniforms)));
  p.program();
  return p.fns;
}
