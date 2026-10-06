import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMobileAim } from '../src/app/mobile-aim.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createDummyEntity, createPelicanEntity } from '../src/entities/entity.ts';

test('手机瞄准最近的屏内存活敌人，排除队友、死亡和移除目标', () => {
  const player = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
  const friend = createPelicanEntity(2, { x: 5, y: 3 }, TUNING);
  const dead = createDummyEntity(3, { x: 5, y: 3 }, TUNING);
  dead.health!.hp = 0;
  const removed = createDummyEntity(4, { x: 5, y: 3 }, TUNING);
  removed.removed = true;
  const outside = createDummyEntity(5, { x: 4, y: 3 }, TUNING);
  const near = createDummyEntity(6, { x: 8, y: 5 }, TUNING);
  const far = createDummyEntity(7, { x: 15, y: 3 }, TUNING);
  const visible = { x: 5, y: 0, w: 20, h: 15 };
  const excluded = [player, friend, dead, removed, outside];
  assert.deepEqual(selectMobileAim(player, [...excluded, far, near], visible), {
    x: near.body.x, y: near.body.y + near.body.height / 2,
  });
  assert.equal(selectMobileAim(player, excluded, visible), null);
});
