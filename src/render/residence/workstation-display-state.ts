import type { Body } from '../../physics/body.ts';

export type WorkstationDisplay = 'globe' | 'desktop' | 'holographic';
export type WorkstationPlayer = Pick<Body, 'x' | 'y' | 'halfWidth' | 'height'>;

export function isPlayerNearWorkstation(player: WorkstationPlayer, desk: { readonly x: number; readonly y: number }): boolean {
  const gapX = Math.max(desk.x - player.x - player.halfWidth, player.x - player.halfWidth - desk.x - 2, 0);
  const gapY = Math.max(desk.y - player.y - player.height, player.y - desk.y - 3, 0);
  return gapX * gapX + gapY * gapY <= 4;
}

export function createWorkstationDisplayState() {
  const cycle: readonly WorkstationDisplay[] = ['globe', 'holographic', 'desktop'];
  let nextSwitch: number | null = null;
  let index = 0;
  let softwareActive = false;
  return {
    update(time: number, near: boolean): WorkstationDisplay {
      if (near) {
        softwareActive = true;
        return 'desktop';
      }
      if (softwareActive || nextSwitch === null) {
        softwareActive = false;
        index = 0;
        nextSwitch = time + 2 + Math.random() * 3;
      } else if (time >= nextSwitch) {
        index = (index + 1) % cycle.length;
        nextSwitch = time + 2 + Math.random() * 3;
      }
      return cycle[index]!;
    },
  };
}
