import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSceneGameLevel, opensSceneGame, pageRoute, parseAppMode, parsePageParams } from '../src/config/app-mode.ts';
import { resolveSceneEntry } from '../src/app/workspace/scene-catalog.ts';
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
  assert.deepEqual(parsePageParams(new URLSearchParams('mode=game'), true), { textures: 'ktx2-compact', debug: false });
  assert.equal(parsePageParams(new URLSearchParams('mode=game&textures=ktx2-compact'), true).textures, 'ktx2-compact');
  for (const textures of ['original', 'web', 'web-1k', 'ktx2', 'ktx2-256', 'ktx2-256-compact']) {
    const params = new URLSearchParams({ mode: 'game', textures });
    assert.throws(() => parsePageParams(params, true), /在线版仅提供优化画质/);
    assert.equal(parsePageParams(params, false).textures, textures);
  }
  assert.deepEqual(parsePageParams(new URLSearchParams('textures=original&debug'), false), { textures: 'original', debug: true });
  for (const release of [false, true]) assert.throws(() => parsePageParams(new URLSearchParams('textures=4k'), release), /未知角色资源规格：4k/);
});

test('网址按入口条件依次分派：站点页、场景工作区、交通中心、城区与原野、家园与展示场', () => {
  const desktop = { release: false, embedded: false, coarsePointer: false };
  const phone = { ...desktop, coarsePointer: true };
  const route = (query: string, host = desktop) => pageRoute(new URLSearchParams(query), host);
  assert.equal(route(''), 'index');
  for (const mode of ['catalog', 'about', 'concepts', 'story', 'compare', 'sounds', 'intro', 'showcase'] as const) assert.equal(route(`mode=${mode}`), mode);
  for (const mode of ['lab', 'resources', 'facility']) assert.equal(route(`mode=${mode}`), 'workspace');
  assert.equal(route('mode=game&level=transit'), 'workspace');
  assert.equal(route('mode=game&level=transit', phone), 'transit');
  assert.equal(route('mode=game', phone), 'harbor');
  assert.equal(route('seed=7&level=harbor', phone), 'harbor');
  assert.equal(route('mode=game&free=1', phone), 'game');
  assert.equal(route('mode=game&level=facility', phone), 'game');
  assert.equal(route('mode=game&level=boss-arena'), 'game');
  assert.equal(route('mode=game&bench=1'), 'harbor');
  assert.equal(route('mode=game', { ...desktop, release: true }), 'harbor');
  assert.equal(route('mode=homestead&scene=residence'), 'residence');
  assert.equal(route('mode=homestead'), 'game');
  assert.equal(route('mode=controls'), 'game');
  assert.throws(() => route('mode=lab', { ...desktop, release: true }));
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

test('场景工作区认主世界游戏网址：城区、原野、交通中心与机房关卡各落到自己的目录条目', () => {
  const entry = (query: string) => resolveSceneEntry(new URL(`http://x/?${query}`)).id;
  assert.equal(entry('mode=game'), 'city');
  assert.equal(entry('seed=7&level=harbor'), 'city');
  assert.equal(entry('mode=game&free=1&seed=7&region=fortress'), 'wilds');
  assert.equal(entry('mode=game&level=transit&flight=fortress'), 'transit');
  assert.equal(entry('mode=game&level=facility&scene=abyss&landing=1'), 'facility:abyss');
  assert.throws(() => entry('mode=game&level=boss-arena'));
  for (const level of [null, 'harbor', 'facility', 'transit']) assert.equal(isSceneGameLevel(new URLSearchParams(level === null ? '' : { level })), true, String(level));
  for (const level of ['boss-arena', 'test', 'composition']) assert.equal(isSceneGameLevel(new URLSearchParams({ level })), false, level);
});

test('只有开发版桌面顶层页把主世界游戏网址交给场景工作区，手机、内嵌、发布版与渲染基准仍整页游戏', () => {
  const desktop = { release: false, embedded: false, coarsePointer: false };
  const opens = (query: string, host = desktop) => opensSceneGame(new URLSearchParams(query), host);
  assert.equal(opens('mode=game&free=1'), true);
  assert.equal(opens('level=facility&scene=abyss'), true);
  assert.equal(opens('mode=game&free=1', { ...desktop, coarsePointer: true }), false);
  assert.equal(opens('mode=game&level=facility', { ...desktop, embedded: true }), false);
  assert.equal(opens('mode=game', { ...desktop, release: true }), false);
  assert.equal(opens('mode=game&free=1&bench=1'), false);
  assert.equal(opens('mode=game&level=boss-arena'), false);
  assert.equal(opens('mode=lab&demo=transit'), false);
});
