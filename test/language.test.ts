import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage, t } from '../src/config/i18n.ts';
import { AI_CITY_LAYERS } from '../src/config/ai-city-look.ts';
import { CHARACTER_ASSETS, GRASSY_HISTORY_ASSETS, GRASSY_HISTORY_DOWNLOADS } from '../src/config/character-assets.ts';
import { TILE_SHAPE_DEFINITIONS, WALL_DEFINITIONS } from '../src/config/definition-kit.ts';
import { DEPTH_LAYERS } from '../src/config/depth-layers.ts';
import { ENEMY_RULES } from '../src/config/enemy-rules.ts';
import { FACILITY_SCENES } from '../src/config/facility-scenes.ts';
import { FORTRESS_STRUCTURE } from '../src/config/facility-structure.ts';
import { FISH_SPECIES } from '../src/config/fish-appearance.ts';
import { FREE_WORLD_SIZES } from '../src/config/free-world.ts';
import { SETTING_DEFS, SETTING_GROUPS } from '../src/config/game-settings.ts';
import * as GRASSY from '../src/config/grassy.ts';
import { LUMA, LUMA_ACTIONS } from '../src/config/luma.ts';
import { NPCS, NPC_ACTIONS } from '../src/config/npc.ts';
import { RESIDENCE_MATERIALS, RESIDENCE_RESOURCES, RESIDENCE_SEGMENTS, RESIDENCE_VARIANTS } from '../src/config/residence.ts';
import { ROCK_TERRAIN_SCENES } from '../src/config/rock-terrain.ts';
import { SCENE_DEMOS } from '../src/config/scene-demos.ts';
import { CHARACTER_CATALOG, CHARACTER_HISTORY_CATALOG, MODEL_SHOWCASE_VIEWS } from '../src/config/showcase.ts';
import { RESOURCE_CAMERA_VIEWS } from '../src/config/showcase-camera.ts';
import { SOUND_LABELS, SOUND_NOTES } from '../src/config/sound-catalog.ts';
import { TERRAIN_COMPOSITIONS } from '../src/config/terrain-compositions.ts';
import { TRANSIT_DESTINATIONS } from '../src/config/transit.ts';
import { DEFAULT_WEAPONS } from '../src/config/weapon-rules.ts';
import { SCENE_WEATHER_LABELS, WIND_LABELS } from '../src/config/weather-rules.ts';
import { WORLD_MUSIC } from '../src/config/world-music.ts';
import { MOON_PHASE_NAMES, SEASON_NAMES } from '../src/core/calendar.ts';
import { pieceLabel } from '../src/app/residence/residence-text.ts';
import { SCENE_ENTRIES } from '../src/app/workspace/scene-catalog.ts';
import { PLANT_ATTACHMENT_DESCRIPTIONS, PLANT_ATTACHMENT_LABELS } from '../src/render/flora/plant-attachments.ts';
import { LAB_CATALOG, RESOURCE_CATALOG } from '../src/render/resource/resource-catalog.ts';
import * as RESOURCE_LABELS from '../src/render/resource/resource-labels.ts';
import { CONCEPT_DOCUMENTS } from '../src/ui/site/concept-documents.ts';

let instance = 0;

test('英文模式下 t() 递归处理角色名称与多段状态，并优先匹配完整的变体操作', () => {
  setLanguage('en');
  assert.equal(t('鹈鹕 · 精细版 · 呼吸'), 'Pelican · Detailed · Breathe');
  for (const limit of [3, 8]) {
    assert.equal(t(`查看鹈鹕全部变体，每批最多 ${limit} 张（替换当前预览）`), `View all Pelican variants, up to ${limit} per batch (replaces current previews)`);
  }
  assert.equal(t('正在播放 · 服务器超载 · 蓄力'), 'Playing · Server overload · Charging');
  assert.equal(t('场景组合 · 空旷 · 种子 429 · 微风'), 'Scene composition · Open · Seed 429 · Breeze');
  assert.equal(t('独立预览 · 2 个画面可见 · 离屏自动暂停'), 'Independent previews · 2 views visible · Paused when offscreen');
  assert.equal(t('10 种 · 第 1 / 2 批 · 1–8'), '10 variants · Batch 1 / 2 · 1–8');
});

test('英文模式下没有译文的中文文本让 t() 抛错，中文模式原样返回', () => {
  setLanguage('en');
  assert.throws(() => t('不存在的文案'), /不存在的文案/);
  setLanguage('zh');
  assert.equal(t('不存在的文案'), '不存在的文案');
});

test('英文模式下同形中文按语境取译文，语境缺条目时回落到通用译文', () => {
  setLanguage('en');
  assert.equal(t('水', 'skill'), 'W');
  assert.equal(t('水'), 'Water');
  assert.equal(t('关闭', 'setting'), 'Off');
  assert.equal(t('关闭'), 'Close');
  assert.equal(t('天气', 'setting'), 'Weather');
});

/** 递归取出数据里这些字段的字符串值（数组与嵌套对象一并展开）。 */
function fields(value: unknown, keys: readonly string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => fields(item, keys));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? (keys.includes(key) ? [item] : []) : fields(item, keys));
}

test('英文模式下所有界面数据文本都有译文', () => {
  setLanguage('en');
  // [数据集, 显示文本, 显示处使用的语境]
  const sets: ReadonlyArray<readonly [string, readonly string[], string?]> = [
    ['facility-scenes name', Object.values(FACILITY_SCENES).map((scene) => scene.name), 'facility'],
    ['facility-scenes shots', fields(Object.values(FACILITY_SCENES).map((scene) => scene.shots), ['label'])],
    ['facility-structure doors', fields(FORTRESS_STRUCTURE.doors, ['label'])],
    ['terrain-compositions', fields(TERRAIN_COMPOSITIONS, ['label', 'description'])],
    ['showcase-camera', fields(RESOURCE_CAMERA_VIEWS, ['label'])],
    ['showcase views', fields(MODEL_SHOWCASE_VIEWS, ['label'])],
    ['showcase catalogs', fields([CHARACTER_CATALOG, CHARACTER_HISTORY_CATALOG], ['title', 'name', 'label', 'group', 'description'])],
    ['weather-rules', [...Object.values(WIND_LABELS), ...Object.values(SCENE_WEATHER_LABELS)]],
    ['ai-city-look', fields(AI_CITY_LAYERS, ['label'])],
    ['residence materials', Object.values(RESIDENCE_MATERIALS)],
    ['residence variants', Object.values(RESIDENCE_VARIANTS).map((variant) => variant.title)],
    // 资源选择器按组显示，实体砖组名去掉“块”字（ui/panels/resource-picker.tsx）。
    ['residence groups', RESIDENCE_RESOURCES.flatMap((resource) => resource.kind === 'solid' ? [resource.group, resource.group.replace(/块$/, '')] : [resource.group])],
    ['residence segments', RESIDENCE_SEGMENTS.map((segment) => segment.label)],
    ['residence segment templates', RESIDENCE_SEGMENTS.map(({ index }) => index === 0 ? '主院区 · {from}–{to} 格' : index < 0 ? '左侧第 {n} 段 · {from}–{to} 格' : '右侧第 {n} 段 · {from}–{to} 格')],
    ['definition-kit', fields([TILE_SHAPE_DEFINITIONS, WALL_DEFINITIONS], ['label'])],
    ['character-assets', fields([CHARACTER_ASSETS, GRASSY_HISTORY_ASSETS, GRASSY_HISTORY_DOWNLOADS], ['label', 'group'])],
    ['calendar', [...SEASON_NAMES, ...MOON_PHASE_NAMES]],
    ['scene-catalog', fields(SCENE_ENTRIES, ['title'])],
    ['concept-documents', fields(CONCEPT_DOCUMENTS, ['group', 'title'])],
    ['scene-demos', fields(SCENE_DEMOS, ['title'])],
    ['depth-layers', fields(DEPTH_LAYERS, ['label', 'description'])],
    ['rock-terrain', [...fields(ROCK_TERRAIN_SCENES, ['title', 'description']), ...ROCK_TERRAIN_SCENES.flatMap((scene) => scene.items)]],
    ['transit name', TRANSIT_DESTINATIONS.map((destination) => destination.name), 'place'],
    ['transit detail', TRANSIT_DESTINATIONS.map((destination) => destination.detail)],
    ['game-settings', [...SETTING_GROUPS.map((group) => group.title), ...SETTING_DEFS.map((def) => def.title)]],
    ['game-settings options', fields(SETTING_DEFS.map((def) => 'options' in def ? def.options : []), ['label']), 'setting'],
    ['resource-labels', Object.values(RESOURCE_LABELS).flatMap((labels) => Object.values(labels))],
    ['plant-attachments', [...Object.values(PLANT_ATTACHMENT_LABELS), ...Object.values(PLANT_ATTACHMENT_DESCRIPTIONS)]],
    ['resource-catalog', fields([RESOURCE_CATALOG, LAB_CATALOG], ['title', 'name', 'label', 'group', 'description'])],
    ['characters', fields([ENEMY_RULES, NPCS, NPC_ACTIONS, GRASSY, LUMA, LUMA_ACTIONS, FISH_SPECIES, FREE_WORLD_SIZES], ['name', 'label'])],
    ['sounds', [...Object.values(SOUND_LABELS), ...Object.values(SOUND_NOTES), ...fields(WORLD_MUSIC, ['title', 'notes'])]],
    ['weapon icons', Object.values(DEFAULT_WEAPONS).flatMap((weapon) => 'icon' in weapon ? [weapon.icon] : []), 'skill'],
  ];
  // 组合标签由生产代码的组合函数直接生成英文，只检查结果。
  const untranslated = RESIDENCE_RESOURCES.map(pieceLabel).filter((label) => /[\u3400-\u9fff]/.test(label)).map((label) => `residence pieces: ${label}`);
  for (const [set, texts, scope] of sets) {
    for (const text of texts) {
      try {
        if (/[\u3400-\u9fff]/.test(t(text, scope))) untranslated.push(`${set}: ${text}`);
      } catch {
        untranslated.push(`${set}: ${text}`);
      }
    }
  }
  assert.deepEqual(untranslated, []);
});

async function languageSession(t: TestContext, languages: string[], stored: string | null) {
  const values = new Map<string, string>();
  if (stored !== null) values.set('pelican-language', stored);
  for (const [name, value] of Object.entries({
    navigator: { languages },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const reload = (): Promise<typeof import('../src/ui/model/language.ts')> => import(`../src/ui/model/language.ts?session=${instance++}`);
  return { language: await reload(), values, reload };
}

test('语言识别遵循已存选择和浏览器偏好顺序，未支持的语言回到英语', async (t) => {
  for (const [languages, stored, expected] of [
    [['en-US', 'zh-CN'], 'zh', 'zh'],
    [['zh-TW'], 'en', 'en'],
    [['fr-FR', 'zh-Hant', 'en-US'], null, 'zh'],
    [['fr-FR', 'en-GB', 'zh-CN'], null, 'en'],
    [['ja-JP'], null, 'en'],
  ] as const) {
    await t.test(`${languages.join(',')} / ${stored}`, async (child) => {
      const { language } = await languageSession(child, [...languages], stored);
      assert.equal(language.getLanguage(), expected);
    });
  }
});

test('选择自动识别的当前语言仍持久化，浏览器语言改变后刷新保持玩家选择', async (t) => {
  const preferred = ['zh-CN'];
  const { language, values, reload } = await languageSession(t, preferred, null);
  language.setLanguage('zh');
  assert.equal(values.get('pelican-language'), 'zh');
  preferred.splice(0, 1, 'en-US');
  assert.equal((await reload()).getLanguage(), 'zh');
  language.setLanguage('en');
  assert.equal((await reload()).getLanguage(), 'en');
});
