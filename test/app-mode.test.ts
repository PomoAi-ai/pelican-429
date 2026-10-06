import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppMode } from '../src/config/app-mode.ts';

test('发布版支持主线与场景游玩，但阻止需要本地素材的旧入口', () => {
  assert.equal(parseAppMode(new URLSearchParams(), true), 'index');
  assert.equal(parseAppMode(new URLSearchParams('mode=story'), true), 'story');
  assert.equal(parseAppMode(new URLSearchParams('level=facility&scene=fortress'), true), 'game');
  for (const mode of ['dev', 'showcase', 'compare', 'resources', 'lab', 'facility', 'sounds']) {
    const params = new URLSearchParams({ mode });
    assert.throws(() => parseAppMode(params, true));
    assert.equal(parseAppMode(params, false), mode);
  }
});

test('发布版拒绝未发布的画质资源，本地仍可对照原版', () => {
  assert.equal(parseAppMode(new URLSearchParams('mode=game&textures=ktx2-compact'), true), 'game');
  for (const textures of ['original', 'web', 'web-1k', 'ktx2', 'ktx2-256', 'ktx2-256-compact']) {
    const params = new URLSearchParams({ mode: 'game', textures });
    assert.throws(() => parseAppMode(params, true));
    assert.equal(parseAppMode(params, false), 'game');
  }
});
