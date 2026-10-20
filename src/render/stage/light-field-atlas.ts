/**
 * 1/4 光场的镜头窗口图集：光场按条带存储，图集只驻留镜头附近 slots 个条带，条带按下标取模放进固定槽位，
 * 镜头移动时只补进新条带，大世界的光照纹理大小与世界宽度无关。槽位按行排开（每行不超过 4096 纹素宽），
 * 每槽左右各留一列相邻条带的边列，线性过滤跨槽无缝；纵向夹在场高内，不串到下一行。
 * 着色器把世界 x 夹进驻留窗口再换算槽位（LIGHT_FIELD_ATLAS_GLSL / webgpu-light-map 同式）。
 * 条带算完才打包进槽；变化只上传改动的行段（首次与改动行数过多时整张上传）。
 */
import * as THREE from 'three';
import type { Rect } from '../../core/math.ts';
import { LIGHT_STRIP, MEDIUM_DOOR, MEDIUM_SOLID, type LightField, type LightRect } from '../../world/light-field.ts';

/** 游戏的驻留条带数：镜头宽约 2 个条带，16 条（512 格）留足补算余量。 */
export const GAME_LIGHT_SLOTS = 16;
export const LIGHT_SLOT_WIDTH = LIGHT_STRIP + 2;
const MAX_ATLAS_WIDTH = 4096;

export interface LightFieldAtlas {
  readonly field: LightField;
  /** RGB = 灯光（平方根编码），A = 天空光。 */
  readonly light: THREE.DataTexture;
  /** 城区遮挡（R：非门实心为 255，高光遮挡用；G：遮挡度 5×5 平均，太阳遮挡用）；未开启为 null。 */
  readonly occlusion: THREE.DataTexture | null;
  /** xy = 场左下角世界坐标，z = 每格子格数，w = 子格高。 */
  readonly bounds: THREE.Vector4;
  /** 驻留子格列 [x, y)。 */
  readonly window: THREE.Vector2;
  /** x = 槽数，y = 每行槽数，z、w = 图集宽高。 */
  readonly layout: THREE.Vector4;
  /** 让世界 x 区间落在驻留窗口里（未算的条带交给光场 sync，算完经 apply 打包）。 */
  focus(view: Readonly<Rect>): void;
  /** 把光场 sync 返回的变化矩形重新打包。 */
  apply(rects: readonly LightRect[]): void;
  dispose(): void;
}

export const LIGHT_FIELD_ATLAS_GLSL = /* glsl */ `
uniform sampler2D uLightField;
uniform vec4 uLightFieldBounds;
uniform vec2 uLightFieldWindow;
uniform vec4 uLightFieldLayout;
// 世界点 → 子格坐标（x 夹进驻留窗口，y 夹进场高），越界取边缘。
vec2 lfCell(vec2 p) {
  vec2 c = (p - uLightFieldBounds.xy) * uLightFieldBounds.z;
  return vec2(clamp(c.x, uLightFieldWindow.x + .5, uLightFieldWindow.y - .5), clamp(c.y, .5, uLightFieldBounds.w - .5));
}
// 子格坐标 → 图集纹素坐标（未归一化）。
vec2 lfAtlasTexel(vec2 c) {
  float strip = floor(c.x / ${LIGHT_STRIP}.0);
  float slot = mod(strip, uLightFieldLayout.x);
  float row = floor(slot / uLightFieldLayout.y);
  float col = slot - row * uLightFieldLayout.y;
  return vec2(col * ${LIGHT_SLOT_WIDTH}.0 + 1.0 + c.x - strip * ${LIGHT_STRIP}.0, row * uLightFieldBounds.w + c.y);
}
vec2 lfAtlasUv(vec2 c) { return lfAtlasTexel(c) / uLightFieldLayout.zw; }
vec4 lfLight(vec2 p) { return texture2D(uLightField, lfAtlasUv(lfCell(p))); }
`;

/**
 * three 的 WebGL 分区上传只认 RGBA、每段限一行（每段一次 texSubImage2D）；一帧超过这么多行时整张上传反而省调用。
 * WebGPU 后端不看分段，总是整张上传。
 */
const MAX_UPLOAD_ROWS = 256;

/** 纹理只上传标记过的行段；首次上传与超量时整张。 */
export function createRowUploads(texture: THREE.DataTexture) {
  let full = true;
  let rows = 0;
  texture.onUpdate = () => {
    full = false;
    rows = 0;
    texture.clearUpdateRanges();
  };
  return {
    all(): void {
      full = true;
      texture.clearUpdateRanges();
      texture.needsUpdate = true;
    },
    /** 第 row 行从第 column 纹素起的 count 个纹素。 */
    row(row: number, column: number, count: number): void {
      texture.needsUpdate = true;
      if (full) return;
      if (++rows > MAX_UPLOAD_ROWS) {
        full = true;
        texture.clearUpdateRanges();
        return;
      }
      texture.addUpdateRange((row * texture.image.width + column) * 4, count * 4);
    },
  };
}

/** 驻留窗口外按“仍在窗口内”的余量（条带）才重新居中，镜头小幅移动不反复补条带。 */
const RECENTER_MARGIN = 2;
/** 释放驻留窗口两侧超过该条数的已算条带。 */
const KEEP_STRIPS = 4;

/** slots：驻留条带数（超过光场条带数时取光场条带数）；occlusion：同时打包城区用的遮挡图。 */
export function createLightFieldAtlas(field: LightField, options: { readonly slots: number; readonly occlusion: boolean }): LightFieldAtlas {
  const { height } = field;
  const slots = Math.min(options.slots, field.strips);
  const perRow = Math.min(slots, Math.floor(MAX_ATLAS_WIDTH / LIGHT_SLOT_WIDTH));
  const rows = Math.ceil(slots / perRow);
  const atlasWidth = perRow * LIGHT_SLOT_WIDTH, atlasHeight = rows * height;
  const lightData = new Uint8Array(atlasWidth * atlasHeight * 4);
  const light = new THREE.DataTexture(lightData, atlasWidth, atlasHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
  light.name = 'light-field';
  // 遮挡图也用 RGBA：分区上传只认 RGBA；高光遮挡按纹素直接取，与线性过滤的遮挡度共用一张。
  const occlusionData = options.occlusion ? new Uint8Array(atlasWidth * atlasHeight * 4) : null;
  const occlusion = occlusionData ? new THREE.DataTexture(occlusionData, atlasWidth, atlasHeight, THREE.RGBAFormat, THREE.UnsignedByteType) : null;
  if (occlusion) occlusion.name = 'light-field-occlusion';
  for (const t of [light, occlusion]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.colorSpace = THREE.NoColorSpace;
  }
  const uploads = [light, occlusion].filter((t): t is THREE.DataTexture => t !== null).map(createRowUploads);
  const bounds = new THREE.Vector4(field.minX, field.minY, 1 / field.cellSize, height);
  const window = new THREE.Vector2(0, 0);
  const layout = new THREE.Vector4(slots, perRow, atlasWidth, atlasHeight);
  let first = -1;

  /** 子格列 x 所在已算条带；未算返回 null。 */
  const stripAt = (x: number) => {
    const s = Math.floor(x / LIGHT_STRIP);
    return x >= 0 && x < field.width && field.isLoaded(s) ? field.strip(s) : null;
  };
  /** 遮挡度：空气 0、门 1、实心 2；世界外与未算条带按空气。 */
  const OPACITY_PAD = 3;
  const opacity = new Uint8Array((LIGHT_STRIP + OPACITY_PAD * 2) * height);
  /** 填遮挡度缓冲的列 [i0,i1]、行 [ya,yb)（缓冲第 0 列是世界子格列 x0）。 */
  const opacityColumns = (x0: number, i0: number, i1: number, ya: number, yb: number): void => {
    const w = LIGHT_STRIP + OPACITY_PAD * 2;
    for (let i = i0; i <= i1; i++) {
      const strip = stripAt(x0 + i);
      for (let y = ya; y < yb; y++) {
        const m = strip ? strip.medium[y * strip.width + x0 + i - strip.x0]! : 0;
        opacity[y * w + i] = m & MEDIUM_SOLID ? (m & MEDIUM_DOOR ? 1 : 2) : 0;
      }
    }
  };

  /**
   * 条带 s 的子格行 [y0,y1)、槽内列 [j0,j1]（−1 与 LIGHT_STRIP 是边列）写进它的槽并标记上传：
   * 左右边列取相邻已算条带，没有就重复本条带边列。
   */
  const pack = (s: number, y0: number, y1: number, j0 = -1, j1 = LIGHT_STRIP): void => {
    const own = field.strip(s);
    const slot = s % slots, row = Math.floor(slot / perRow);
    const base = (slot - row * perRow) * LIGHT_SLOT_WIDTH, rowBase = row * height;
    const padX0 = own.x0 - OPACITY_PAD, padW = LIGHT_STRIP + OPACITY_PAD * 2;
    // 5×5 平均要用到写入列两侧各 2 列、写入行上下各 2 行。
    if (occlusionData) opacityColumns(padX0, Math.max(0, j0 + 1), Math.min(padW - 1, j1 + 5), Math.max(0, y0 - 2), Math.min(height, y1 + 2));
    for (let y = y0; y < y1; y++) for (const upload of uploads) upload.row(rowBase + y, base + 1 + j0, j1 - j0 + 1);
    for (let j = j0; j <= j1; j++) {
      const strip = stripAt(own.x0 + j) ?? own;
      const x = Math.min(strip.x0 + strip.width - 1, Math.max(strip.x0, own.x0 + j));
      const column = base + 1 + j;
      for (let y = y0; y < y1; y++) {
        const from = y * strip.width + x - strip.x0, to = (rowBase + y) * atlasWidth + column;
        lightData[to * 4] = strip.lamp[from * 3]!;
        lightData[to * 4 + 1] = strip.lamp[from * 3 + 1]!;
        lightData[to * 4 + 2] = strip.lamp[from * 3 + 2]!;
        lightData[to * 4 + 3] = strip.sky[from]!;
        if (!occlusionData) continue;
        const m = strip.medium[from]!;
        // 灯具高光只被实心挡住，半透明的能量门后仍能看到。
        occlusionData[to * 4] = m & MEDIUM_SOLID && !(m & MEDIUM_DOOR) ? 255 : 0;
        // 遮挡度 5×5 盒式平均，世界之外按空气计；约 1.25 格的半影与方块尺度相当，不因光场格细而变硬。
        let sum = 0;
        for (let dy = Math.max(0, y - 2); dy <= Math.min(height - 1, y + 2); dy++) {
          const row = dy * padW + x - padX0;
          sum += opacity[row - 2]! + opacity[row - 1]! + opacity[row]! + opacity[row + 1]! + opacity[row + 2]!;
        }
        occlusionData[to * 4 + 1] = Math.round(sum * 255 / 50);
      }
    }
  };

  /** 重打包子格矩形 [x0,x1)×[y0,y1) 覆盖的驻留且已算条带（含落在边列上的相邻条带）。 */
  const repack = (x0: number, x1: number, y0: number, y1: number): void => {
    const s0 = Math.floor((x0 - 1) / LIGHT_STRIP), s1 = Math.floor(x1 / LIGHT_STRIP) + 1;
    for (let s = Math.max(first, s0); s < Math.min(first + slots, s1); s++) {
      if (!field.isLoaded(s)) continue;
      const own = s * LIGHT_STRIP;
      pack(s, y0, y1, Math.max(-1, x0 - own), Math.min(LIGHT_STRIP, x1 - 1 - own));
    }
  };

  const stripSpan = LIGHT_STRIP * field.cellSize;
  return {
    field, light, occlusion, bounds, window, layout,
    focus(view) {
      const a = Math.floor((view.x - field.minX) / stripSpan), b = Math.floor((view.x + view.w - field.minX) / stripSpan);
      // 窗口贴世界边时那一侧不需要余量。
      const lo = first > 0 ? first + RECENTER_MARGIN : 0, hi = first + slots < field.strips ? first + slots - RECENTER_MARGIN : field.strips;
      if (first >= 0 && a >= lo && b < hi) return;
      const centered = Math.min(field.strips - slots, Math.max(0, Math.round((a + b + 1) / 2 - slots / 2)));
      // 镜头仍在驻留窗口内时每帧只挪一条：新条带的计算摊到多帧，不在横穿世界时集中卡一帧；跳出窗口（传送）才一次补齐。
      const inside = first >= 0 && a >= first && b < first + slots;
      const next = inside ? first + Math.sign(centered - first) : centered;
      if (next === first) return;
      const previous = first;
      first = next;
      field.view(first, first + slots, KEEP_STRIPS);
      window.set(first * LIGHT_STRIP, Math.min(field.width, (first + slots) * LIGHT_STRIP));
      // 环形槽位：留在窗口内的条带不动，只打包新进来的已算条带与它们两侧（边列随之变化）；未算的算完由 apply 打包。
      for (let s = first; s < first + slots; s++) {
        if (previous >= 0 && s - 1 >= previous && s + 1 < previous + slots) continue;
        if (field.isLoaded(s)) pack(s, 0, height);
      }
    },
    apply(rects) {
      if (first < 0) return;
      // 边列与遮挡度的 5×5 邻域会跨到相邻条带，矩形外扩 2 子格。
      for (const rect of rects) repack(rect.x0 - 2, rect.x1 + 2, Math.max(0, rect.y0 - 2), Math.min(height, rect.y1 + 2));
    },
    dispose() {
      light.dispose();
      occlusion?.dispose();
    },
  };
}
