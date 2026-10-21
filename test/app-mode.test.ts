import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRoute, parseAppMode, parseDevCamera, parsePageParams } from '../src/config/app-mode.ts';
import { SCENE_ENTRIES, resolveSceneEntry } from '../src/app/workspace/scene-catalog.ts';
import { SITE_SECTIONS, findSitePage, siteSections } from '../src/config/site-directory.ts';
import { RESIDENCE_VARIANTS } from '../src/config/residence.ts';
import { parseGameLaunch } from '../src/app/game/game-level.ts';

test('发布版开放游玩与轻量资料页，阻止原画库、历史模型、画质对比与开发场景', () => {
  assert.equal(parseAppMode(new URLSearchParams(), true), 'index');
  assert.equal(parseAppMode(new URLSearchParams('mode=story'), true), 'story');
  assert.equal(parseAppMode(new URLSearchParams('mode=about'), true), 'about');
  // 全部开发场景已由两级导航取代。
  assert.throws(() => parseAppMode(new URLSearchParams('mode=dev'), false));
  assert.equal(parseAppMode(new URLSearchParams('level=facility&scene=fortress'), true), 'game');
  for (const mode of ['concepts', 'sounds', 'resources', 'showcase']) assert.equal(parseAppMode(new URLSearchParams({ mode }), true), mode);
  for (const query of ['mode=catalog', 'mode=compare', 'mode=lab', 'mode=homestead', 'mode=showcase&library=history', 'mode=render-lab', 'mode=hair-gallery', 'mode=maglev']) {
    const params = new URLSearchParams(query);
    assert.throws(() => parseAppMode(params, true), /本地完整版/, query);
    assert.equal(parseAppMode(params, false), params.get('mode'));
  }
  // 机房只剩游戏网址一个入口。
  for (const release of [false, true]) assert.throws(() => parseAppMode(new URLSearchParams('mode=facility&scene=fortress'), release), /mode=game&level=facility/);
  // 独立交通中心页与住宅页的旧网址同样报错并给出新网址。
  for (const query of ['mode=transit', 'mode=game&level=transit&flight=abyss']) assert.throws(() => parseAppMode(new URLSearchParams(query), false), /mode=game&from=transit/, query);
  assert.throws(() => parseAppMode(new URLSearchParams('mode=residence'), false), /mode=homestead&scene=residence/);
});

test('自由镜头是开发开关：本地可开，发布版与未知取值都报错', () => {
  assert.equal(parseDevCamera(new URLSearchParams('mode=game'), true), false);
  assert.equal(parseDevCamera(new URLSearchParams('level=facility&cam=free'), false), true);
  assert.throws(() => parseDevCamera(new URLSearchParams('cam=free'), true), /本地完整版/);
  assert.throws(() => parseDevCamera(new URLSearchParams('cam=orbit'), false), /cam=orbit/);
});

test('发布版顶栏只列能打开的页面：保留概念、声音、透视与展示场，去掉原画库、历史、对比与实验室', () => {
  const pages = siteSections(true).flatMap(section => section.clusters.flat());
  const ids = pages.map(page => page.id);
  for (const id of ['concepts', 'sounds', 'perspective', 'showcase']) assert.ok(ids.includes(id), id);
  for (const id of ['catalog', 'history', 'compare', 'lab', 'render-lab', 'hair-gallery', 'maglev']) assert.ok(!ids.includes(id), id);
  for (const page of pages) {
    const url = new URL(page.href, 'http://x/');
    assert.equal(url.pathname, '/', page.href);
    assert.doesNotThrow(() => parseAppMode(url.searchParams, true), page.href);
  }
  assert.ok(siteSections(false).flatMap(section => section.clusters.flat()).some(page => page.id === 'render-lab'));
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

test('网址按入口条件依次分派：站点页、场景工作区与展示场；城区、原野、交通中心与家园一律是整页游戏', () => {
  const route = (query: string, release = false) => pageRoute(new URLSearchParams(query), release);
  assert.equal(route(''), 'index');
  for (const mode of ['catalog', 'about', 'concepts', 'story', 'compare', 'sounds', 'intro', 'showcase', 'render-lab', 'hair-gallery', 'maglev'] as const) assert.equal(route(`mode=${mode}`), mode);
  for (const mode of ['lab', 'resources']) assert.equal(route(`mode=${mode}`), 'workspace');
  assert.equal(route('mode=game'), 'game');
  assert.equal(route('mode=game&from=transit&flight=abyss'), 'game');
  assert.equal(route('mode=game&free=1'), 'game');
  assert.equal(route('mode=game&level=facility&scene=abyss'), 'game');
  assert.equal(route('mode=game&level=boss-arena'), 'game');
  assert.equal(route('mode=game&bench=1'), 'game');
  assert.equal(route('mode=game', true), 'game');
  for (const scene of ['residence', 'residence-3', 'residence-4']) assert.equal(route(`mode=homestead&scene=${scene}`), 'game');
  assert.equal(route('mode=homestead'), 'game');
  assert.equal(route('mode=controls'), 'game');
  assert.throws(() => route('mode=lab', true));
});

test('两级导航：每个入口地址都落回自己，同一页的其他参数也归到同一入口', () => {
  for (const page of SITE_SECTIONS.flatMap(section => section.clusters.flat())) {
    assert.equal(findSitePage(new URL(page.href, 'http://x/'))?.page.id, page.id, page.href);
  }
  const page = (query: string) => findSitePage(new URL(`http://x/?${query}`))?.page.id;
  assert.equal(page('mode=resources&scene=room'), 'perspective');
  assert.equal(page('mode=game&free=1&seed=7'), 'free-world');
  assert.equal(page('level=facility'), 'fortress');
  assert.equal(page('mode=render-lab&hair=showcase&framing=head'), 'render-lab');
  assert.equal(page('mode=hair-gallery&environment=studio'), 'hair-gallery');
  assert.equal(page('mode=showcase&demo=sam'), 'showcase');
  assert.equal(page('mode=catalog'), 'catalog');
  assert.equal(page('mode=homestead'), 'homestead');
  assert.equal(page('mode=homestead&scene=wilds'), 'homestead');
  assert.equal(page(''), undefined);
  assert.equal(page('mode=about'), undefined);
});

test('场景工作区只认非游戏场景，游戏网址交给整页游戏', () => {
  const entry = (query: string) => resolveSceneEntry(new URL(`http://x/?${query}`)).id;
  assert.equal(entry('mode=lab'), 'sandbox');
  assert.equal(entry('mode=lab&demo=transit-flight-lab'), 'transit-flight-lab');
  assert.equal(entry('mode=resources&scene=room#walls'), 'room:walls');
  for (const query of ['mode=game', 'mode=game&free=1', 'mode=game&level=facility&scene=abyss']) assert.throws(() => entry(query), /不是场景工作区地址/, query);
  // 侧栏条目来自页面登记表，每条的网址都要落回它自己。
  for (const item of SCENE_ENTRIES) assert.equal(resolveSceneEntry(new URL(item.href, 'http://x/')).id, item.id, item.href);
});

// 导航按场景名判定住宅页，与变体表各自维护：任一边改了 scene，入口就会进错城区或落到家园页。
test('家园页的住宅场景按变体表选城区变体，导航入口与之一致；其余家园场景不进城区', () => {
  const launch = (query: string) => parseGameLaunch(new URLSearchParams(query)).city;
  assert.equal(launch('mode=game'), 'harbor');
  for (const [variant, { scene }] of Object.entries(RESIDENCE_VARIANTS)) {
    if (scene === null) continue;
    assert.equal(launch(`mode=homestead&scene=${scene}`), variant);
    assert.equal(findSitePage(new URL(`http://x/?mode=homestead&scene=${scene}`))?.page.href, `./?mode=homestead&scene=${scene}`);
  }
  assert.equal(launch('mode=homestead'), null);
  assert.equal(launch('mode=homestead&scene=wilds'), null);
});
