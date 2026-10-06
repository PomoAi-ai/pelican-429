import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNpcDialoguePicker, NPC_DIALOGUES } from '../src/config/npc-dialogue.ts';

test('居民交谈轮内不重复，换轮时不接着重复上一个话题', () => {
  for (const seed of [1, 429, 392740869]) for (const kind of ['sam', 'tibo'] as const) {
    const pick = createNpcDialoguePicker(seed);
    let previous;
    for (let round = 0; round < 4; round++) {
      const seen = new Set();
      for (let i = 0; i < NPC_DIALOGUES[kind].length; i++) {
        const conversation = pick(kind);
        assert.notEqual(conversation, previous);
        assert.equal(seen.has(conversation), false);
        seen.add(conversation);
        previous = conversation;
      }
      assert.equal(seen.size, NPC_DIALOGUES[kind].length);
    }
  }
});

test('同种子话题顺序可复现，与另一位居民交谈不消耗本人的话题', () => {
  const a = createNpcDialoguePicker(429), b = createNpcDialoguePicker(429);
  for (let i = 0; i < 20; i++) {
    a('tibo');
    assert.equal(a('sam'), b('sam'));
  }
});
