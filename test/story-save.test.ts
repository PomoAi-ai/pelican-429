import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStorySave, saveStory } from '../src/app/story-save.ts';
import { STORY_SAVE_KEY } from '../src/config/story-save.ts';
import { captureMainlineProgress } from '../src/sim/mainline-progress.ts';
import { initializeMainline, mainlineCheckpoint } from '../src/sim/mainline.ts';
import { createSimWorld, getPlayer } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('旧难度存档按剩余比例降低 Boss 血量，重新保存加载不会重复缩减', () => {
  for (const [kind, hp, expected] of [['tibo', 1850, 370], ['sam', 2625, 525]] as const) {
    const storage = memoryStorage();
    const checkpoint = { phase: kind, countdownTicks: 0 };
    storage.setItem(STORY_SAVE_KEY, JSON.stringify({ version: 2, checkpoint, destination: 'fortress',
      progress: { player: null, enemies: [], boss: { kind, hp, x: 180, y: 20, facing: 1, healAvailable: false } } }));
    const saved = loadStorySave(storage)!;
    assert.equal(saved.progress!.boss!.hp, expected);
    assert.equal(saved.progress!.boss!.healAvailable, false);
    assert.deepEqual(saved.checkpoint, checkpoint);
    saveStory(storage, saved.checkpoint, saved.destination, saved.progress);
    assert.deepEqual(loadStorySave(storage), saved);
  }
});

test('浏览器检查点往返保留倒计时与通关后的自由世界选择', () => {
  const storage = memoryStorage();
  assert.equal(loadStorySave(storage), null);
  saveStory(storage, { phase: 'countdown', countdownTicks: 123 }, 'fortress');
  assert.deepEqual(loadStorySave(storage), { version: 3, checkpoint: { phase: 'countdown', countdownTicks: 123 }, destination: 'fortress' });
  saveStory(storage, { phase: 'restored', countdownTicks: 0 }, 'free');
  assert.deepEqual(loadStorySave(storage), { version: 3, checkpoint: { phase: 'restored', countdownTicks: 0 }, destination: 'free' });
});

test('损坏或越级的浏览器存档明确报错，不假装新游戏', () => {
  const storage = memoryStorage();
  storage.setItem(STORY_SAVE_KEY, JSON.stringify({ version: 2, checkpoint: { phase: 'tibo', countdownTicks: 0 }, destination: 'free' }));
  assert.throws(() => loadStorySave(storage), /Invalid story save/);
  storage.setItem(STORY_SAVE_KEY, '{broken');
  assert.throws(() => loadStorySave(storage), SyntaxError);
  assert.throws(() => saveStory({ setItem() { throw new Error('QuotaExceeded'); } }, { phase: 'core', countdownTicks: 0 }, 'fortress'), /QuotaExceeded/);
});

// 若存储层仍只序列化检查点，真实快照将丢失；允许损坏敌人表则可能误删活着的驻军。
test('浏览器记录保留真实战斗进度，拒绝损坏快照且结局选择去除战斗数据', () => {
  const storage = memoryStorage();
  const world = createSimWorld({ level: createFacilityLevel('fortress') });
  try {
    initializeMainline(world, { phase: 'tibo', countdownTicks: 0 });
    getPlayer(world).health!.hp = 48;
    getPlayer(world).body.y = world.map.height + 10;
    world.entities.find(entity => entity.boss)!.health!.hp = 71;
    const progress = captureMainlineProgress(world);
    saveStory(storage, mainlineCheckpoint(world), 'fortress', progress);
    const saved = loadStorySave(storage)!;
    assert.deepEqual(saved.progress, progress);
    for (const broken of [
      { ...progress, player: { ...progress.player, hp: -1 } },
      { ...progress, enemies: [progress.enemies[0], progress.enemies[0]] },
      { ...progress, boss: null },
    ]) {
      storage.setItem(STORY_SAVE_KEY, JSON.stringify({ ...saved, progress: broken }));
      assert.throws(() => loadStorySave(storage), /Invalid story progress/);
    }
    saveStory(storage, { phase: 'restored', countdownTicks: 0 }, 'free');
    assert.deepEqual(loadStorySave(storage), { version: 3, checkpoint: { phase: 'restored', countdownTicks: 0 }, destination: 'free' });
  } finally { world.fluid.dispose(); }
});
