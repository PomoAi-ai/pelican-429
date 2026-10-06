import type { Vec2 } from '../core/math.ts';
import { FACILITY_CHAPTERS, FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { LevelData } from './level.ts';

export interface FreeWorldRegion {
  readonly id: string;
  readonly label: string;
  readonly labelEn: string;
  readonly position: Vec2;
}

/** 目的地来自实际生成结果，种子变化时区域位置也随之变化。 */
export function freeWorldRegions(level: LevelData, ground: Int16Array): FreeWorldRegion[] {
  const regions: FreeWorldRegion[] = [{ id: 'wilds', label: '渔屋营地 · Sam 与 Tibo', labelEn: 'Camp · Sam & Tibo', position: level.spawn }];
  const forest = level.trees.find(tree => tree.kind !== 'palm' && tree.baseY === ground[tree.x]);
  if (forest) regions.push({ id: 'forest', label: '林间漫游', labelEn: 'Woodland', position: { x: forest.x + .5, y: forest.baseY + 3 } });
  level.lakes.filter(lake => !lake.perched).forEach((lake, i) => regions.push({
    id: `lake-${i}`, label: `湖畔湿地 ${i + 1}`, labelEn: `Lakeside ${i + 1}`,
    position: { x: lake.x0 + .5, y: lake.level + 1 },
  }));
  level.deserts.forEach((desert, i) => {
    const x = Math.floor((desert.x0 + desert.x1) / 2);
    regions.push({ id: `desert-${i}`, label: `沙丘荒原 ${i + 1}`, labelEn: `Dunes ${i + 1}`, position: { x: x + .5, y: ground[x]! + 1 } });
  });
  level.caves.rooms.forEach((room, i) => regions.push({
    id: `cave-${i}`, label: `荧光洞穴 ${i + 1}`, labelEn: `Glow cave ${i + 1}`, position: { x: room.floorX + .5, y: room.floorY },
  }));
  level.islands.filter(island => island.kind === 'island').forEach((island, i) => {
    const offset = Math.floor((island.x1 - island.x0) / 2);
    regions.push({ id: `island-${i}`, label: `空中群岛 ${i + 1}`, labelEn: `Sky island ${i + 1}`, position: { x: island.x0 + offset + .5, y: island.tops[offset]! + 1 } });
  });
  for (const facility of level.facilities ?? []) {
    const spawn = FACILITY_CHAPTERS[facility.id].spawn;
    const labelEn = { fortress: 'Mountain Fortress', cathedral: 'Compute Cathedral', abyss: 'Fiber Abyss' }[facility.id];
    regions.push({ id: facility.id, label: FACILITY_SCENES[facility.id].name, labelEn,
      position: { x: facility.x + spawn.x, y: facility.y + spawn.y } });
  }
  return regions;
}
