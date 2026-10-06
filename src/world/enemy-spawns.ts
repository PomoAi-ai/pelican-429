import { ENEMY_RULES, type EnemyKind } from '../config/enemy-rules.ts';
import { hashU32 } from '../core/rng.ts';
import { overlaps } from '../core/math.ts';
import type { LevelData } from './level.ts';
import { SHAPE_FULL } from './tile-shapes.ts';

export type EnemySpawn = NonNullable<LevelData['enemies']>[number];

/** 出生要容纳完整身体，地面单位还要有连续落脚面，避免刚出现就卡墙或落水。 */
export function enemySpawnFits(level: Pick<LevelData, 'map' | 'fluid' | 'lethalCoolant' | 'safeZones'>, kind: EnemyKind, x: number, y: number): boolean {
  const { map, fluid, lethalCoolant, safeZones } = level;
  const rule = ENEMY_RULES[kind];
  const body = { x: x - rule.halfWidth, y, w: rule.halfWidth * 2, h: rule.height };
  if (safeZones?.some(zone => overlaps(body, zone))) return false;
  const left = Math.floor(x - rule.halfWidth);
  const right = Math.floor(x + rule.halfWidth);
  if (left < 0 || right >= map.width || y < 1 || y + rule.height >= map.height) return false;
  if (lethalCoolant && x + rule.halfWidth > lethalCoolant.x && x - rule.halfWidth < lethalCoolant.x + lethalCoolant.w
    && y < lethalCoolant.y + lethalCoolant.h && y + rule.height > lethalCoolant.y) return false;
  for (let tx = left; tx <= right; tx++) {
    for (let ty = Math.floor(y); ty < Math.ceil(y + rule.height); ty++) {
      if (map.collisionAt(tx, ty) === 'solid' || fluid.amountAt(tx, ty) > 0) return false;
    }
    if (kind !== 'watchWasp' && (map.collisionAt(tx, y - 1) === 'none' || map.shapeAt(tx, y - 1) !== SHAPE_FULL)) return false;
  }
  return true;
}

/** 野外每段地形有一组巡逻兵；岛屿、洞室分别布防，营地保留安全范围。 */
export function populateWildEnemies(level: LevelData, seed: number): EnemySpawn[] {
  const out: EnemySpawn[] = [];
  const groundKinds = ['gatekeeper', 'lineHound', 'loadmaster'] as const;
  const add = (kind: EnemyKind, x: number, y: number): boolean => {
    if (out.some(enemy => Math.abs(enemy.x - x) < 5 && Math.abs(enemy.y - y) < 3)
      || !enemySpawnFits(level, kind, x, y)) return false;
    out.push({ kind, x, y });
    return true;
  };
  for (let block = 8; block < level.map.width - 8; block += 48) {
    const kind = groundKinds[hashU32(block, 0, seed) % groundKinds.length]!;
    const offset = hashU32(block, 1, seed) % 32;
    let placed = false;
    for (let attempt = 0; attempt < 32 && !placed; attempt++) {
      const tx = block + (offset + attempt) % 32;
      if (tx >= level.map.width - 3) continue;
      for (let y = level.surface[tx]!; y > 1; y--) {
        if (level.map.collisionAt(tx, y - 1) !== 'solid' || level.caves.mask[y * level.map.width + tx] !== 0
          || level.islands.some(island => tx >= island.x0 && tx <= island.x1 && y >= island.bottom && y <= island.top)) continue;
        if (add(kind, tx + .5, y)) {
          add('watchWasp', tx + 5.5, y + 5);
          placed = true;
          break;
        }
      }
    }
  }
  for (const island of level.islands) {
    if (island.kind !== 'island') continue;
    const kind = groundKinds[hashU32(island.x0, island.top, seed) % groundKinds.length]!;
    for (let tx = island.x0 + 2; tx < island.x1 - 1; tx++) {
      const y = island.tops[tx - island.x0]!;
      if (!add(kind, tx + .5, y)) continue;
      add('watchWasp', tx + 5.5, y + 5);
      break;
    }
  }
  for (const room of level.caves.rooms) {
    const kind = groundKinds[hashU32(room.floorX, room.floorY, seed) % groundKinds.length]!;
    let placed = false;
    for (let tx = Math.ceil(room.cx - room.rx + 2); tx <= room.cx + room.rx - 2 && !placed; tx++) {
      for (let y = Math.max(1, Math.floor(room.cy - room.ry)); y <= room.cy; y++) {
        if (level.caves.mask[y * level.map.width + tx] !== 1 || !add(kind, tx + .5, y)) continue;
        add('watchWasp', tx + 4.5, y + 4);
        placed = true;
        break;
      }
    }
  }
  return out;
}
