import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { translateShowcaseText } from '../src/ui/showcase-language.ts';
import { translateSoundText } from '../src/ui/sound-language.ts';

let instance = 0;

test('动态翻译递归处理角色名称与多段状态，并优先匹配完整的变体操作', () => {
  assert.equal(translateShowcaseText('鹈鹕 · 精细版 · 呼吸'), 'Pelican · Detailed · Breathe');
  for (const limit of [3, 8]) {
    assert.equal(translateShowcaseText(`查看鹈鹕全部变体，每批最多 ${limit} 张（替换当前预览）`), `View all Pelican variants, up to ${limit} per batch (replaces current previews)`);
  }
  assert.equal(translateSoundText('正在播放 · 服务器超载 · 蓄力'), 'Playing · Server overload · Charging');
  assert.equal(translateSoundText('场景组合 · 空旷 · 种子 429 · 微风'), 'Scene composition · Open · Seed 429 · Breeze');
  assert.equal(translateSoundText('独立预览 · 2 个画面可见 · 离屏自动暂停'), 'Independent previews · 2 views visible · Paused when offscreen');
  assert.equal(translateSoundText('10 种 · 第 1 / 2 批 · 1–8'), '10 variants · Batch 1 / 2 · 1–8');
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
  const reload = (): Promise<typeof import('../src/ui/language.ts')> => import(`../src/ui/language.ts?session=${instance++}`);
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
