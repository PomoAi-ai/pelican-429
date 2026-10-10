import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_PRESETS, parseCharacterAppearance } from '../src/config/character-appearance.ts';
import { createCharacterAppearanceStore } from '../src/app/character-appearance.ts';

// 若先发布新状态再写存储，保存失败会让游戏外观与刷新后的角色不一致。
test('外观保存失败保留已应用角色，重试成功后可重新读取', () => {
  let raw: string | null = null;
  let fail = true;
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => {
    if (fail) throw new Error('quota'); raw = value;
  } };
  const store = createCharacterAppearanceStore(storage);
  const before = structuredClone(store.current());
  const draft = structuredClone(CHARACTER_PRESETS[2]!.appearance);
  draft.face.eyeSpacing = .35;
  draft.colors.top = '#874623';
  assert.throws(() => store.save(draft), /quota/);
  assert.deepEqual(store.current(), before);
  fail = false;
  store.save(draft);
  draft.face.eyeSpacing = -.9;
  assert.equal(store.current().face.eyeSpacing, .35);
  assert.deepEqual(createCharacterAppearanceStore(storage).current(), store.current());
});

// 若存档越界值进入运行时，形变极值会突破经校准的脸部范围。
test('存档中超出范围的脸部参数明确报错', () => {
  const saved = structuredClone(CHARACTER_PRESETS[1]!.appearance);
  saved.face.faceWidth = 12;
  assert.throws(() => parseCharacterAppearance(JSON.parse(JSON.stringify(saved))), /faceWidth/);
});
