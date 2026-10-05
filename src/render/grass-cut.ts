/**
 * 草叶割断与再生（纯渲染）：在已加载瓦片区块的花草/地被 InstancedMesh 里找到落在判定区内的实例，
 * 按确定性哈希（实例序号 + 位置 + 事件序号）以给定概率“割断”——实例局部 y 缩到 keep，随后在 regrow 秒内平滑长回原矩阵。
 * 只改实例矩阵（不占顶点属性；瓦片网格属性已到上限，flora 材质也无需新增）。区块卸载/重建后旧网格的记录自动丢弃。
 * 可割：草丛/高草/芦苇/野花/蕨/三叶草/草皮，地被里的三叶草/幼蕨/草芽/莲座/小苗；不可割：卵石、蘑菇、灌木、蝴蝶、垂草与苔藓地衣落叶。
 */
import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';
import type { Rect } from '../core/math.ts';
import { COVER_KINDS } from './flora-cover.ts';
import type { CoverKind } from './flora-cover.ts';
import type { FloraSpecies } from './flora.ts';
import { GRASS_DISTURB } from './grass-disturb.ts';

export const CUTTABLE_FLORA: ReadonlySet<FloraSpecies> = new Set<FloraSpecies>(['turf', 'tuft', 'tallgrass', 'reed', 'clover', 'daisy', 'poppy', 'bluebell', 'dandelion', 'sunflower', 'lavender', 'fern']);
export const CUTTABLE_COVER: ReadonlySet<CoverKind> = new Set<CoverKind>(['clover', 'fiddlehead', 'sprout', 'rosette', 'seedling']);
/** 草皮割后保留更多（整格草带，割太短会露出光秃顶面）。 */
const TURF_KEEP = 0.7;
/** 开花物种：碎屑带花瓣色。 */
const PETAL_SPECIES: ReadonlySet<string> = new Set(['daisy', 'poppy', 'bluebell', 'dandelion', 'sunflower', 'lavender']);

export interface CutPiece {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 碎屑颜色（草绿 / 花瓣实例色）。 */
  readonly color: number;
}

interface CutRecord {
  readonly mesh: THREE.InstancedMesh;
  readonly index: number;
  readonly base: THREE.Matrix4;
  t0: number;
  readonly regrow: number;
  readonly keep: number;
}

export interface GrassCutter {
  /** 判定区内（区内实例根部）按概率割断；返回被割实例的碎屑生成点（≤ GRASS_DISTURB.cut.maxPerEvent）。 */
  cut(area: Readonly<Rect>, chance: number, time: number): CutPiece[];
  /** 推进再生；返回仍在再生中的实例数。 */
  update(time: number): number;
  /** 某实例当前高度比例（1 = 未割/已长回；测试/调试用）。 */
  heightOf(mesh: THREE.InstancedMesh, index: number, time: number): number;
  readonly active: number;
}

const GRASS_DEBRIS = [0x7cb84c, 0x9ccc58, 0x5e9a3a];
const _m = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _c = new THREE.Color();

const smooth = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** 再生进度 → 高度比例：keep → 1（smoothstep）。 */
export function regrowScale(keep: number, age: number, regrow: number): number {
  if (!(regrow > 0)) throw new Error(`grass-cut: invalid regrow ${regrow}`);
  return keep + (1 - keep) * smooth(age / regrow);
}

function kindOf(mesh: THREE.InstancedMesh, index: number): { cuttable: boolean; petal: boolean; turf: boolean } {
  if (mesh.name.startsWith('tiles-cover-')) {
    const v = mesh.geometry.getAttribute('aVariant');
    const kind = COVER_KINDS[v ? Math.round(v.getX(index)) : -1];
    return { cuttable: kind !== undefined && CUTTABLE_COVER.has(kind), petal: false, turf: false };
  }
  const species = mesh.userData.species as FloraSpecies | undefined;
  return { cuttable: species !== undefined && CUTTABLE_FLORA.has(species), petal: species !== undefined && PETAL_SPECIES.has(species), turf: species === 'turf' };
}

/** 在 tilesRoot（tile-view.root）下的花草/地被网格上割草。 */
export function createGrassCutter(tilesRoot: THREE.Object3D): GrassCutter {
  if (!tilesRoot) throw new Error('grass-cut: tiles root is required');
  const records = new Map<THREE.InstancedMesh, Map<number, CutRecord>>();
  let seq = 0;
  const cfg = GRASS_DISTURB.cut;

  const apply = (r: CutRecord, scale: number): void => {
    r.mesh.setMatrixAt(r.index, _m.copy(r.base).multiply(_s.makeScale(1, scale, 1)));
    r.mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    cut(area, chance, time) {
      if (![area.x, area.y, area.w, area.h, chance, time].every(Number.isFinite) || area.w < 0 || area.h < 0) throw new Error('grass-cut: invalid cut area');
      if (!(chance >= 0 && chance <= 1)) throw new Error(`grass-cut: chance must be in [0,1], got ${chance}`);
      seq++;
      const out: CutPiece[] = [];
      const x1 = area.x + area.w;
      const y1 = area.y + area.h;
      tilesRoot.traverse((node) => {
        const mesh = node as THREE.InstancedMesh;
        if (!mesh.isInstancedMesh || !(mesh.name.startsWith('tiles-flora-') || mesh.name.startsWith('tiles-cover-'))) return;
        const bs = mesh.boundingSphere;
        if (bs && (bs.center.x + bs.radius < area.x || bs.center.x - bs.radius > x1 || bs.center.y + bs.radius < area.y || bs.center.y - bs.radius > y1)) return;
        const arr = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count && out.length < cfg.maxPerEvent; i++) {
          const x = arr[i * 16 + 12] as number;
          const y = arr[i * 16 + 13] as number;
          if (x < area.x || x > x1 || y < area.y || y > y1) continue;
          const kind = kindOf(mesh, i);
          if (!kind.cuttable) continue;
          if (hash01(i, Math.round(x * 64) + Math.round(y * 8) * 7919, 9100 + seq) >= chance) continue;
          let per = records.get(mesh);
          if (!per) records.set(mesh, (per = new Map()));
          const prev = per.get(i);
          const regrow = cfg.regrow[0] + (cfg.regrow[1] - cfg.regrow[0]) * hash01(i, Math.round(x * 16), 9200);
          const base = prev ? prev.base : new THREE.Matrix4().fromArray(arr, i * 16);
          const rec: CutRecord = { mesh, index: i, base, t0: time, regrow: prev ? prev.regrow : regrow, keep: kind.turf ? TURF_KEEP : cfg.keep };
          per.set(i, rec);
          apply(rec, rec.keep);
          let color = GRASS_DEBRIS[i % GRASS_DEBRIS.length] as number;
          if (kind.petal && mesh.instanceColor) {
            mesh.getColorAt(i, _c);
            color = _c.getHex();
          }
          out.push({ x, y: y + 0.25, z: arr[i * 16 + 14] as number, color });
        }
      });
      return out;
    },
    update(time) {
      if (!Number.isFinite(time)) throw new Error(`grass-cut: invalid time ${time}`);
      let n = 0;
      for (const [mesh, per] of records) {
        if (!mesh.parent) {
          // 区块已卸载/重建：网格作废，记录丢弃。
          records.delete(mesh);
          continue;
        }
        for (const [i, r] of per) {
          const age = time - r.t0;
          if (age >= r.regrow) {
            apply(r, 1);
            per.delete(i);
            continue;
          }
          apply(r, regrowScale(r.keep, age, r.regrow));
          n++;
        }
        if (per.size === 0) records.delete(mesh);
      }
      return n;
    },
    heightOf(mesh, index, time) {
      const r = records.get(mesh)?.get(index);
      if (!r) return 1;
      return time - r.t0 >= r.regrow ? 1 : regrowScale(r.keep, time - r.t0, r.regrow);
    },
    get active() {
      let n = 0;
      for (const per of records.values()) n += per.size;
      return n;
    },
  };
}
