import type { EnemyKind } from './enemy-rules.ts';

export const ENEMY_MODEL_DIRS: Readonly<Record<EnemyKind, string>> = {
  gatekeeper: './characters/enemies/gatekeeper',
  lineHound: './characters/enemies/line-hound',
  watchWasp: './characters/enemies/watch-wasp',
  loadmaster: './characters/enemies/loadmaster',
};

export const ENEMY_KINDS = Object.keys(ENEMY_MODEL_DIRS) as EnemyKind[];
export function isEnemyKind(kind: string): kind is EnemyKind { return Object.hasOwn(ENEMY_MODEL_DIRS, kind); }
