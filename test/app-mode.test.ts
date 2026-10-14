import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppMode } from '../src/config/app-mode.ts';
import { SITE_SECTIONS, findSitePage } from '../src/config/site-directory.ts';

test('发布版支持主线与场景游玩，但阻止需要本地素材的旧入口', () => {
  assert.equal(parseAppMode(new URLSearchParams(), true), 'index');
  assert.equal(parseAppMode(new URLSearchParams('mode=story'), true), 'story');
  assert.equal(parseAppMode(new URLSearchParams('mode=catalog'), true), 'catalog');
  assert.equal(parseAppMode(new URLSearchParams('mode=about'), true), 'about');
  // 原画资料库就是 mode=catalog，旧模式名不再存在。
  assert.throws(() => parseAppMode(new URLSearchParams('mode=art-library'), false));
  // 全部开发场景已由两级导航取代。
  assert.throws(() => parseAppMode(new URLSearchParams('mode=dev'), false));
  assert.equal(parseAppMode(new URLSearchParams('level=facility&scene=fortress'), true), 'game');
  for (const mode of ['concepts', 'showcase', 'compare', 'resources', 'lab', 'facility', 'sounds']) {
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

test('两级导航：每个入口地址都落回自己，同一页的其他参数也归到同一入口', () => {
  for (const page of SITE_SECTIONS.flatMap(section => section.clusters.flat())) {
    assert.equal(findSitePage(new URL(page.href, 'http://x/').searchParams)?.page.id, page.id, page.href);
  }
  const page = (query: string) => findSitePage(new URLSearchParams(query))?.page.id;
  assert.equal(page('mode=resources&scene=room'), 'perspective');
  assert.equal(page('mode=game&level=facility&scene=abyss&free=1'), 'free-world');
  assert.equal(page('level=facility'), 'fortress');
  assert.equal(page('mode=showcase&demo=sam'), 'showcase');
  assert.equal(page('mode=catalog'), 'art-library');
  assert.equal(page(''), undefined);
  assert.equal(page('mode=about'), undefined);
});
