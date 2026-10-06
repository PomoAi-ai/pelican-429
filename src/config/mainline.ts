import type { EnemyKind } from './enemy-rules.ts';

export const MAINLINE_PHASES = ['perimeter', 'core', 'tibo', 'countdown', 'sam', 'restored'] as const;
export type MainlinePhase = typeof MAINLINE_PHASES[number];
export interface MainlineCheckpoint {
  readonly phase: MainlinePhase;
  readonly countdownTicks: number;
}

export const MAINLINE_COUNTDOWN_SECONDS = 30;
export const MAINLINE_CORE = { triggerX: 164, playerX: 168, bossX: 180, y: 20 } as const;
export const MAINLINE_ENEMIES: readonly { kind: EnemyKind; x: number; y: number }[] = [
  { kind: 'gatekeeper', x: 76, y: 20 },
  { kind: 'lineHound', x: 97, y: 20 },
  { kind: 'watchWasp', x: 112, y: 24 },
  { kind: 'watchWasp', x: 123, y: 24 },
  { kind: 'loadmaster', x: 135, y: 20 },
];
