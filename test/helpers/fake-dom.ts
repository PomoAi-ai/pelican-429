// 测试用最小伪 DOM（HUD 测试共用）：只实现 hud.ts 用到的 createElement/append/classList/style 等。

export class FakeClassList {
  private readonly set = new Set<string>();
  private readonly owner: FakeElement;
  constructor(owner: FakeElement) {
    this.owner = owner;
  }
  add(c: string): void {
    this.set.add(c);
  }
  remove(c: string): void {
    this.set.delete(c);
  }
  toggle(c: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  contains(c: string): boolean {
    return this.set.has(c) || this.owner.className.split(/\s+/).includes(c);
  }
}

export class FakeElement {
  className = '';
  textContent: string | null = '';
  hidden = false;
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  readonly classList = new FakeClassList(this);
  readonly offsetWidth = 0;
  readonly tagName: string;
  /** 表单/属性（设置面板测试用）。 */
  value = '';
  type = '';
  title = '';
  disabled = false;
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, Array<(e: unknown) => void>>();
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  append(...nodes: FakeElement[]): void {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  remove(): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  replaceChildren(): void {
    for (const c of [...this.children]) c.remove();
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  focus(): void {}
  blur(): void {}
  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type);
    if (list) this.listeners.set(type, list.filter((f) => f !== fn));
  }
  /** 派发事件（只到本元素，不冒泡）；返回是否被 preventDefault / stopPropagation。 */
  dispatch(type: string, init: Record<string, unknown> = {}): { prevented: boolean; stopped: boolean } {
    const out = { prevented: false, stopped: false };
    const e = { type, target: this, currentTarget: this, ...init, preventDefault: () => void (out.prevented = true), stopPropagation: () => void (out.stopped = true) };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(e);
    return out;
  }
  find(cls: string): FakeElement | null {
    if (this.classList.contains(cls)) return this;
    for (const c of this.children) {
      const f = c.find(cls);
      if (f) return f;
    }
    return null;
  }
}

export function withFakeDocument<T>(fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = { createElement: (tag: string) => new FakeElement(tag) };
  try {
    return fn();
  } finally {
    g.document = prev;
  }
}
