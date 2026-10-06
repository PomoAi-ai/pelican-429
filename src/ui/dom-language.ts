import { LANGUAGES, getLanguage, onLanguageChange, setLanguage, type Language } from './language.ts';
import { translateShowcaseText } from './showcase-language.ts';
import { HOME_ENGLISH } from './homepage-language.ts';
import { SOUND_ENGLISH, translateSoundText } from './sound-language.ts';

const english: Record<string, string> = {
  ...HOME_ENGLISH,
  ...SOUND_ENGLISH,
  '世界地形定位': 'World terrain locations',
  '重载当前种子的同一世界，并从所选地形旁开始': 'Reload the same world seed and start beside the selected terrain',
  '返回出生点': 'Return to spawn',
  '重头开始': 'Start over',
  '鹈鹕 429 / Pelican 429': 'Pelican 429',
  '功能入口': 'Explore sections', '开发导航': 'Development navigation',
  '山体算力堡垒的实时场景': 'Live view of the mountain compute fortress',
  'Grassy 在雨雪夜的房间里编程': 'Grassy coding in a rainy, snowy room',
  '游戏中的鹈鹕': 'The pelican in the game', '训练假人': 'Training dummy',
  '小鱼角色': 'Fish character', '游戏瓦片和花草': 'Game tiles and flowers',
  '游戏中的树木资源': 'Game tree assets',
  '游戏画面': 'Game view', 'M 地图': 'M Map',
  '水': 'W', '鱼': 'F', '光': 'O', '吞': 'S',
  '今天，从哪里开始？': 'Where shall we begin today?',
  '探索世界，检查关卡，或近距离观察角色动作与场景资源。': 'Explore the world, inspect levels, or take a closer look at characters and scene assets.',
  '机房自由探索': 'Explore the facility',
  '自由查看山体堡垒、算力大教堂与光纤深渊。走动、跳跃和飞行，探索设备与检修通道。': 'Explore the mountain fortress, compute cathedral, and fiber abyss. Walk, jump, and fly through the equipment and service corridors.',
  'AGI 降智风暴 · 序章': 'AGI Brain-Drain Storm · Prelude',
  '四个音符把 AGI 推到 99%，一道 429 劈下，全场降智。黑暗里重新敲响，所有模型回归——前沿模型，人人有权使用。': "Four notes push AGI to 99%. A 429 strikes and every model gets dumbed down. Play it again in the dark and they all come back. Frontier AI is everyone's right.",
  '自由世界': 'Free world',
  '自由世界 · 鹈鹕 429': 'Free world · Pelican 429',
  '演示场景 · 鹈鹕 429': 'Demo scene · Pelican 429',
  '切换鹈鹕与人形 Grassy，查看移动、飞行、游泳与战斗表现。': 'Switch between Pelican and human Grassy to inspect movement, flight, swimming, and combat.',
  '测试关卡': 'Test level',
  '手机操控': 'Mobile controls', '场景测试': 'Scene tests', 'Boss 场': 'Boss arena',
  '进入固定小关卡，检查移动、物理与攻击效果。': 'Enter a fixed level to inspect movement, physics, and combat.',
  '角色卡': 'Character cards',
  '选择角色与动作，最多 8 张卡并排比较地上和地下效果。': 'Choose characters and actions; compare up to eight cards above and below ground.',
  '场景功能展示': 'Scene lab',
  '瓦片形状、材质拼接、植被分层与全部游戏资源。': 'Tile shapes, material transitions, vegetation layers, and all game assets.',
  '场景资源': 'Scene assets',
  '泥土瓦片、自然花草、树木与建筑，切换材质、变体和环境并排对照。': 'Compare terrain, flowers, trees, and buildings across materials, variants, and environments.',
  '全局开发导航可随时切换入口 · 页面切换会重新开始场景': 'Use the global navigation to switch pages · Switching pages restarts the scene',
  '首页': 'Home', '序章动画': 'Prelude', '01 山体堡垒': '01 Mountain fortress',
  '02 算力大教堂': '02 Compute cathedral', '03 光纤深渊': '03 Fiber abyss',
  '机房预览': 'Facility preview', '游戏': 'Game', '角色展示场': 'Character showcase',
  'AGI 降临…': 'AGI arrives…', '游戏出错了': 'An error occurred',
};

/** Translate DOM copy after each UI render, keeping the original text for switching back. */
export function attachDomLanguage(): void {
  const originals = new WeakMap<Text, string>();
  const attributes = new WeakMap<Element, Map<string, string>>();
  const rendered = (source: string): string => {
    const next = english[source.trim()] ?? translateSoundText(source.trim()) ?? translateShowcaseText(source.trim());
    return next ? source.replace(source.trim(), next) : source;
  };
  const translate = (root: Node): void => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      if (node.parentElement?.closest('script, style, input, textarea')) continue;
      const current = node.data;
      const original = originals.get(node);
      if (!original || (current !== original && current !== rendered(original))) originals.set(node, current);
      const source = originals.get(node)!;
      const result = getLanguage() === 'en' ? rendered(source) : source;
      if (current !== result) node.data = result;
    }
    const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : root instanceof Document ? [...root.querySelectorAll('*')] : [];
    for (const element of elements) {
      for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
        const current = element.getAttribute(name);
        if (current === null) continue;
        let saved = attributes.get(element);
        if (!saved) { saved = new Map(); attributes.set(element, saved); }
        const old = saved.get(name);
        if (!old || (current !== old && current !== rendered(old))) saved.set(name, current);
        const source = saved.get(name)!;
        const next = getLanguage() === 'en' ? rendered(source) : source;
        if (current !== next) element.setAttribute(name, next);
      }
    }
  };
  translate(document);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translate(record.target);
      else if (record.type === 'attributes') translate(record.target);
      else for (const node of record.addedNodes) translate(node);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder', 'alt'] });
  onLanguageChange(() => translate(document));

  const picker = document.createElement('select');
  picker.className = 'site-language';
  picker.setAttribute('aria-label', '语言 / Language');
  for (const { id, label } of LANGUAGES) picker.add(new Option(label, id));
  picker.value = getLanguage();
  picker.addEventListener('change', () => setLanguage(picker.value as Language));
  // The settings panel can also switch language, so keep the menu in sync.
  onLanguageChange((language) => { picker.value = language; });
  document.getElementById('dev-navigation')!.append(picker);
}
