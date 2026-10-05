import { FACILITY_CHAPTERS, FACILITY_PLATFORMS, FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { FacilityChapterId } from '../config/facility-scenes.ts';
import { FORTRESS_COOLANT, FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import { worldToView } from './minimap-model.ts';
import type { MinimapSource, WorldRect } from './minimap-model.ts';
import { getLanguage } from './language.ts';

export const FACILITY_MAP_LEGEND = '白色：角色 · 青色：门禁 · 金色：出口 · 绿线：可下穿平台';
export const FACILITY_MAP_LEGEND_EN = 'White: player · cyan: gate · gold: exit · green: drop-through platform';

/** 底图沿用关卡碰撞与平台配置；建筑立面只作背景，避免把机柜误画成可站立面。 */
export function drawFacilityMapBase(ctx: CanvasRenderingContext2D, source: MinimapSource, chapter: FacilityChapterId, pixel: number): void {
  const { width, height } = source.tiles;
  ctx.fillStyle = '#091722';
  ctx.fillRect(0, 0, width * pixel, height * pixel);
  const box = (x: number, y: number, w: number, h: number): void => {
    ctx.fillRect(x * pixel, (height - y - h) * pixel, w * pixel, h * pixel);
  };
  if (chapter === 'fortress') {
    const b = FORTRESS_STRUCTURE.bounds;
    ctx.fillStyle = '#163039';
    box(b.left, b.bottom, b.right - b.left, b.roofY - b.bottom);
  }
  ctx.strokeStyle = '#1c3440';
  ctx.lineWidth = 0.3 * pixel;
  ctx.beginPath();
  for (let x = 0; x < width; x += 10) {
    ctx.moveTo(x * pixel, 0);
    ctx.lineTo(x * pixel, height * pixel);
  }
  for (let y = 0; y < height; y += 10) {
    ctx.moveTo(0, y * pixel);
    ctx.lineTo(width * pixel, y * pixel);
  }
  ctx.stroke();
  ctx.fillStyle = '#1c3a40';
  for (const [left, right, y] of FACILITY_PLATFORMS[chapter]) box(left, y, right - left, 7);

  const colors: Array<string | null> = [];
  for (const tile of source.tiles.registry.all()) colors[tile.id] = tile.collision === 'solid' ? '#80918d' : tile.collision === 'oneWay' ? '#699589' : null;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const id = source.tiles.get(x, y);
      const start = x++;
      while (x < width && source.tiles.get(x, y) === id) x++;
      const color = colors[id];
      if (color) {
        ctx.fillStyle = color;
        box(start, y, x - start, 1);
      }
    }
  }
  ctx.fillStyle = '#24748a';
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (source.fluid.cells[y * width + x]! > 0) box(x, y, 1, source.fluid.cells[y * width + x]! / 255);
  }
  if (chapter === 'fortress') {
    const pool = FORTRESS_COOLANT;
    ctx.fillStyle = 'rgba(58, 139, 128, 0.4)';
    box(pool.x, pool.y, pool.w, pool.h);
    ctx.fillStyle = '#6dd5b6';
    box(pool.x, pool.y + pool.h - 0.5, pool.w, 0.5);
  }
  ctx.strokeStyle = '#7fd9ad';
  ctx.lineWidth = 1.45 * pixel;
  ctx.beginPath();
  for (const [left, right, y] of FACILITY_PLATFORMS[chapter]) {
    let x = left;
    while (x < right) {
      if (source.tiles.registry.byId(source.tiles.get(x, y - 1)).collision !== 'oneWay') { x++; continue; }
      const start = x++;
      while (x < right && source.tiles.registry.byId(source.tiles.get(x, y - 1)).collision === 'oneWay') x++;
      ctx.moveTo(start * pixel, (height - y) * pixel);
      ctx.lineTo(x * pixel, (height - y) * pixel);
    }
  }
  ctx.stroke();
}

export function drawFacilityMapMarkers(ctx: CanvasRenderingContext2D, chapter: FacilityChapterId, rect: WorldRect, scale: number, expanded: boolean): void {
  const label = (text: string, x: number, y: number, color: string): void => {
    const p = worldToView(rect, scale, x, y);
    ctx.font = `${expanded ? 12 : 9}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#091722';
    ctx.fillStyle = color;
    ctx.strokeText(text, p.x, p.y);
    ctx.fillText(text, p.x, p.y);
  };
  ctx.save();
  if (chapter === 'fortress') {
    if (expanded) {
      const pool = FORTRESS_COOLANT;
      label(getLanguage() === 'en' ? 'Lethal coolant' : '致命冷却液', pool.x + pool.w / 2, pool.y + pool.h / 2, '#e9b97a');
    }
    for (const door of FORTRESS_STRUCTURE.doors) {
      const p = worldToView(rect, scale, door.x, door.y + door.h);
      ctx.fillStyle = '#3dcac2';
      ctx.fillRect(p.x - 1, p.y, Math.max(4, door.w * scale), Math.max(4, door.h * scale));
      if (expanded) label(getLanguage() === 'en' ? 'Fortress gate' : door.label, door.x + door.w / 2, door.y + door.h + 2, '#a0fff0');
    }
  }
  if (expanded) {
    for (const [index, shot] of FACILITY_SCENES[chapter].shots.entries()) {
      if (chapter === 'fortress' && shot.label === '堡垒门禁') continue;
      label(getLanguage() === 'en' ? FACILITY_EN[chapter].shots[index]![0] : shot.label === '网络核心' ? 'InfiniBand 网络交换区' : shot.label, shot.x, shot.y + shot.height * 0.25, '#8eb6c0');
    }
    const rows = [...new Set(FACILITY_PLATFORMS[chapter].filter(([left, right, y]) => right - left > 20 && y >= FACILITY_SCENES[chapter].floorY).map(([, , y]) => y))].sort((a, b) => a - b);
    for (const [i, y] of rows.entries()) {
      const left = Math.min(...FACILITY_PLATFORMS[chapter].filter((p) => p[2] === y).map((p) => p[0]));
      label(`L${i + 1}`, left + 4, y + 2, '#a2e1bd');
    }
  }
  const { spawn, exit } = FACILITY_CHAPTERS[chapter];
  const start = worldToView(rect, scale, spawn.x, spawn.y);
  ctx.strokeStyle = '#92cbc2';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(start.x - 3, start.y - 6, 6, 6);
  if (expanded) label(getLanguage() === 'en' ? 'Start' : '出发点', spawn.x, spawn.y - 5, '#92cbc2');
  const end = worldToView(rect, scale, exit.x, exit.y + 2);
  ctx.fillStyle = '#ffd076';
  ctx.strokeStyle = '#091722';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y - 6);
  ctx.lineTo(end.x + 5, end.y);
  ctx.lineTo(end.x, end.y + 6);
  ctx.lineTo(end.x - 5, end.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (expanded) label(getLanguage() === 'en' ? 'Exit' : '出口', exit.x, exit.y - 5, '#ffd076');
  ctx.restore();
}

export const FACILITY_EN = {
  fortress: { name: 'Mountain Compute Fortress', subtitle: 'Black hole outpost · three data center levels · rooftop cooling arrays', overview: 'Mountain Compute Fortress', shots: [
    ['Black hole outpost', 'Accretion disk · coolant chasm · stepping stones'], ['Fortress access gate', 'Exterior cooling · giant access gate'], ['Multilevel data center', 'GB300 compute arrays · InfiniBand network'], ['Rooftop facilities', 'Cooling units and overhead cable trays'],
  ] },
  cathedral: { name: 'Compute Cathedral', subtitle: 'Grand final hall · five compute towers · central battlefield', overview: 'Compute Cathedral', shots: [
    ['Central battlefield', 'Wide combat floor · core control device'], ['Compute towers', 'GB300 arrays and NVLink interconnect'], ['Side galleries', 'Three-level platforms and maintenance route'],
  ] },
  abyss: { name: 'Fiber Abyss', subtitle: 'Suspended combat bridge · deep shaft · network control core', overview: 'Fiber Abyss', shots: [
    ['Main combat bridge', 'Bridge across the shaft · broken-span jump'], ['Cooling shaft', 'Supports and circulating cooling below'], ['Network core', 'InfiniBand switching fabric · control facility'],
  ] },
  original: { name: 'Basic Data Center', subtitle: 'Compute center in the forest · original scene', overview: 'Forest and compute center', shots: [
    ['Forest stream', 'Forest approach'], ['Data center perimeter', 'Access gate and cooling facilities'], ['Server hall', 'Servers and maintenance walkways'], ['GB300 core', 'Heavy compute core'],
  ] },
} as const;
