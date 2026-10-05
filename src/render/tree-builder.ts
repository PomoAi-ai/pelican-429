/**
 * 树网格累加器（纯 three 计算，node 下可测）：顶点直接写入可增长的 TypedArray，最后一次性切出带索引的 BufferGeometry，
 * 避免逐部件建几何再合并、以及 number[] 增长与转换产生的垃圾（GC 停顿会让分帧预算失真）。
 * reset() 后可复用同一实例（tree-geometry 复用模块级实例，单线程、不可重入）。
 * 属性：position / normal / uv / color / aSway / aBend / aBranch（+ 树皮的 aBark 通道号）。
 * aBend / aBranch（树风，见 tree-wind）新顶点为 0，由 setBend / setBranch 按顶点区间填写。
 */
import * as THREE from 'three';

export class MeshBuilder {
  readonly withBark: boolean;
  #cap = 0;
  #n = 0;
  #t = 0;
  #pos = new Float32Array(0);
  #nrm = new Float32Array(0);
  #uv = new Float32Array(0);
  #col = new Float32Array(0);
  #sway = new Float32Array(0);
  #bark = new Float32Array(0);
  #bend = new Float32Array(0);
  #branch = new Float32Array(0);
  #idx = new Uint32Array(0);

  constructor(withBark: boolean, capacity = 4096) {
    this.withBark = withBark;
    this.#grow(capacity);
    this.#idx = new Uint32Array(capacity * 6);
  }

  /** 底层数组（长度 ≥ 实际用量；有效部分为前 vertexCount×分量 / triangleCount×3 个）。 */
  get pos(): Float32Array {
    return this.#pos;
  }
  get nrm(): Float32Array {
    return this.#nrm;
  }
  get col(): Float32Array {
    return this.#col;
  }
  get idx(): Uint32Array {
    return this.#idx.subarray(0, this.#t);
  }

  get vertexCount(): number {
    return this.#n;
  }

  get triangleCount(): number {
    return this.#t / 3;
  }

  reset(): void {
    this.#n = 0;
    this.#t = 0;
  }

  #grow(cap: number): void {
    const re = <T extends Float32Array>(a: T, k: number): T => {
      const b = new Float32Array(cap * k) as T;
      b.set(a.subarray(0, this.#n * k));
      return b;
    };
    this.#pos = re(this.#pos, 3);
    this.#nrm = re(this.#nrm, 3);
    this.#uv = re(this.#uv, 2);
    this.#col = re(this.#col, 3);
    this.#sway = re(this.#sway, 1);
    if (this.withBark) this.#bark = re(this.#bark, 1);
    this.#bend = re(this.#bend, 4);
    this.#branch = re(this.#branch, 4);
    this.#cap = cap;
  }

  /** 追加顶点，返回其下标。法线不必归一（toGeometry 时统一归一）。 */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, r: number, g: number, b: number, sway: number, bark = 0): number {
    if (this.#n >= this.#cap) this.#grow(this.#cap * 2);
    const i = this.#n++;
    this.#pos[3 * i] = x;
    this.#pos[3 * i + 1] = y;
    this.#pos[3 * i + 2] = z;
    this.#nrm[3 * i] = nx;
    this.#nrm[3 * i + 1] = ny;
    this.#nrm[3 * i + 2] = nz;
    this.#uv[2 * i] = u;
    this.#uv[2 * i + 1] = v;
    this.#col[3 * i] = r;
    this.#col[3 * i + 1] = g;
    this.#col[3 * i + 2] = b;
    this.#sway[i] = sway;
    if (this.withBark) this.#bark[i] = bark;
    this.#bend.fill(0, 4 * i, 4 * i + 4);
    this.#branch.fill(0, 4 * i, 4 * i + 4);
    return i;
  }

  #range(start: number, end: number, what: string): void {
    if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= end && end <= this.#n)) throw new Error(`tree-builder: ${what} range [${start}, ${end}) outside 0..${this.#n}`);
  }

  /** [start, end) 顶点的主弯曲属性 aBend = (树根 x, 树根 y, 树高, 柔度)。 */
  setBend(start: number, end: number, rootX: number, rootY: number, height: number, flex: number): void {
    this.#range(start, end, 'aBend');
    for (let i = start; i < end; i++) {
      this.#bend[4 * i] = rootX;
      this.#bend[4 * i + 1] = rootY;
      this.#bend[4 * i + 2] = height;
      this.#bend[4 * i + 3] = flex;
    }
  }

  /** [start, end) 顶点的枝组 aBranch.xyz = (基点 x, 基点 y, 有符号枝柔度)；第 4 分量（频率）不变。 */
  setBranch(start: number, end: number, anchorX: number, anchorY: number, amp: number): void {
    this.#range(start, end, 'aBranch');
    for (let i = start; i < end; i++) {
      this.#branch[4 * i] = anchorX;
      this.#branch[4 * i + 1] = anchorY;
      this.#branch[4 * i + 2] = amp;
    }
  }

  /** [start, end) 顶点的固有频率（aBranch.w）。 */
  setFrequency(start: number, end: number, freq: number): void {
    this.#range(start, end, 'aBranch.w');
    for (let i = start; i < end; i++) this.#branch[4 * i + 3] = freq;
  }

  /** [start, end) 顶点 y 的最大值（空区间为 −∞）。 */
  maxY(start = 0, end = this.#n): number {
    let m = -Infinity;
    for (let i = start; i < end; i++) m = Math.max(m, this.#pos[3 * i + 1] as number);
    return m;
  }

  tri(a: number, b: number, c: number): void {
    if (this.#t + 3 > this.#idx.length) {
      const next = new Uint32Array(this.#idx.length * 2);
      next.set(this.#idx);
      this.#idx = next;
    }
    this.#idx[this.#t++] = a;
    this.#idx[this.#t++] = b;
    this.#idx[this.#t++] = c;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.#n;
    const nrm = this.#nrm.slice(0, n * 3);
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i] as number, nrm[i + 1] as number, nrm[i + 2] as number) || 1;
      nrm[i] = (nrm[i] as number) / l;
      nrm[i + 1] = (nrm[i + 1] as number) / l;
      nrm[i + 2] = (nrm[i + 2] as number) / l;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.#pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.#uv.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.#col.slice(0, n * 3), 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(this.#sway.slice(0, n), 1));
    if (this.withBark) g.setAttribute('aBark', new THREE.BufferAttribute(this.#bark.slice(0, n), 1));
    g.setAttribute('aBend', new THREE.BufferAttribute(this.#bend.slice(0, n * 4), 4));
    g.setAttribute('aBranch', new THREE.BufferAttribute(this.#branch.slice(0, n * 4), 4));
    const idx = this.#idx.subarray(0, this.#t);
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? idx.slice() : Uint16Array.from(idx), 1));
    return g;
  }
}

/** 网格三角形数（有索引按索引，否则按顶点）。 */
export function triangleCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/**
 * 拼接同属性集的带索引几何（TypedArray.set + 索引偏移）：比 mergeGeometries 快一个量级，桶合并上屏的主要成本。
 * 属性集不一致或无索引 fail-fast。
 */
export function concatGeometries(list: readonly THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  if (list.length === 0) throw new Error(`${label}: nothing to concatenate`);
  const first = list[0] as THREE.BufferGeometry;
  const names = Object.keys(first.attributes).sort();
  let verts = 0;
  let indices = 0;
  for (const g of list) {
    const own = Object.keys(g.attributes).sort();
    if (own.join() !== names.join()) throw new Error(`${label}: attribute sets differ (${own.join()} vs ${names.join()})`);
    if (!g.index) throw new Error(`${label}: geometry without index`);
    verts += g.getAttribute('position').count;
    indices += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = first.getAttribute(name).itemSize;
    const arr = new Float32Array(verts * size);
    let o = 0;
    for (const g of list) {
      const src = g.getAttribute(name).array as Float32Array;
      arr.set(src, o);
      o += src.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const idx = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let o = 0;
  let base = 0;
  for (const g of list) {
    const src = (g.index as THREE.BufferAttribute).array;
    for (let i = 0; i < src.length; i++) idx[o + i] = (src[i] as number) + base;
    o += src.length;
    base += g.getAttribute('position').count;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
