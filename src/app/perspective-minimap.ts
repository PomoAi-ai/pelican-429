import { definitionColliderSection, type DefinitionCollision } from '../physics/definition-collision.ts';

interface WorldRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

const TILE_PX = 4;
// 玩家站立需要的净高；落点上方被实体占住时换下一个落脚面。
const CLEARANCE = 1.7;

/** 大场景小地图：按碰撞体画出地形，点击传送到所点位置下方最近的可站立面。 */
export function createPerspectiveMinimap(host: HTMLElement, collision: DefinitionCollision, world: WorldRect,
  onTeleport: (x: number, y: number) => void) {
  const width = world.maxX - world.minX;
  const height = world.maxY - world.minY;
  const root = document.createElement('div');
  root.className = 'room-preview-minimap';
  root.title = '点击小地图传送';
  root.style.aspectRatio = `${width} / ${height}`;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * TILE_PX);
  canvas.height = Math.ceil(height * TILE_PX);
  const marker = document.createElement('i');
  root.append(canvas, marker);
  host.append(root);

  const context = canvas.getContext('2d')!;
  const toPixel = (x: number, y: number): [number, number] => [(x - world.minX) * TILE_PX, (world.maxY - y) * TILE_PX];
  context.fillStyle = '#9fb3a8';
  for (const solid of collision.solids) {
    context.beginPath();
    for (const [x, y] of solid.points) context.lineTo(...toPixel(x, y));
    context.closePath();
    context.fill();
  }
  context.fillStyle = '#d09c52';
  for (const platform of collision.platforms) {
    const [x, y] = toPixel(platform.left, platform.top);
    context.fillRect(x, y, (platform.right - platform.left) * TILE_PX, 2);
  }

  const landing = (x: number, y: number): number => {
    const spans = collision.solids.map(solid => definitionColliderSection(solid, 0, x - .3, x + .3))
      .filter((span): span is [number, number] => span !== null);
    const tops = [...spans.map(([, top]) => top), ...collision.platforms.filter(p => p.left <= x && x <= p.right).map(p => p.top)];
    const free = tops.filter(top => top <= y + .5 && !spans.some(([low, high]) => low < top + CLEARANCE && high > top + .05));
    // 所点一列没有落脚面时照常传送，角色下落后由游玩逻辑送回当前分区。
    return free.length > 0 ? Math.max(...free) : y;
  };
  const onClick = (event: MouseEvent): void => {
    const rect = root.getBoundingClientRect();
    const x = world.minX + (event.clientX - rect.left) / rect.width * width;
    const y = world.maxY - (event.clientY - rect.top) / rect.height * height;
    onTeleport(x, landing(x, y));
  };
  root.addEventListener('click', onClick);

  return {
    update(x: number, y: number): void {
      marker.style.left = `${(x - world.minX) / width * 100}%`;
      marker.style.top = `${(world.maxY - y) / height * 100}%`;
    },
    dispose(): void {
      root.removeEventListener('click', onClick);
      root.remove();
    },
  };
}
