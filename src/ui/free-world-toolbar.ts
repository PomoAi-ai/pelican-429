import { FREE_WORLD_SIZES, parseFreeWorldSize, type FreeWorldSize } from '../config/free-world.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export interface FreeWorldToolbarOptions {
  seed: number;
  size: FreeWorldSize;
  gm: boolean;
  /** GM 勾选的提示：原野切换即重新加载，城区只记下设置、进入原野后生效。 */
  gmHint: 'reload' | 'wilds';
  region: string;
  regions: readonly { id: string; label: string; labelEn: string }[];
  onSeed(seed: number, size: FreeWorldSize): void;
  onGm(on: boolean): void;
  onRegion(id: string): boolean;
  /** null 表示该场景没有设置面板，不显示 GM 设置按钮。 */
  onSettings: (() => void) | null;
  onFocus(): void;
  /** 点按钮、改下拉后把焦点还给画布，键盘立即驱动角色。 */
  onFocusGame(): void;
}

/** 主世界控件片段：插进宿主场景工具条，标题、世界与天气控制由宿主工具条提供。 */
export function createFreeWorldToolbar(host: HTMLElement, options: FreeWorldToolbarOptions): { setRegion(id: string): void; dispose(): void } {
  const root = document.createElement('form');
  root.className = 'free-world-toolbar';
  const regionLabel = document.createElement('label');
  const regionName = document.createElement('span');
  const region = document.createElement('select');
  for (const entry of options.regions) {
    const item = document.createElement('option');
    item.value = entry.id;
    region.append(item);
  }
  region.value = options.region;
  let selectedRegion = options.region;
  region.addEventListener('change', () => {
    if (options.onRegion(region.value)) selectedRegion = region.value;
    else region.value = selectedRegion;
  });
  regionLabel.append(regionName, region);

  const sizeLabel = document.createElement('label');
  const sizeName = document.createElement('span');
  const size = document.createElement('select');
  size.className = 'free-world-size';
  for (const id of Object.keys(FREE_WORLD_SIZES)) {
    const item = document.createElement('option');
    item.value = id;
    size.append(item);
  }
  size.value = options.size;
  sizeLabel.append(sizeName, size);

  const seedLabel = document.createElement('label');
  const seedName = document.createElement('span');
  const seed = document.createElement('input');
  seed.className = 'free-world-seed';
  seed.type = 'number';
  seed.required = true;
  seed.min = '0';
  seed.max = '4294967295';
  seed.step = '1';
  seed.value = String(options.seed);
  seedLabel.append(seedName, seed);
  const apply = document.createElement('button');
  apply.type = 'submit';
  root.addEventListener('submit', (event) => {
    event.preventDefault();
    options.onSeed(seed.valueAsNumber, parseFreeWorldSize(size.value));
  });
  const random = document.createElement('button');
  random.type = 'button';
  random.className = 'free-world-random';
  random.addEventListener('click', () => {
    const next = crypto.getRandomValues(new Uint32Array(1))[0]!;
    seed.value = String(next);
    options.onSeed(next, parseFreeWorldSize(size.value));
  });

  const gmLabel = document.createElement('label');
  gmLabel.className = 'free-world-gm';
  const gm = document.createElement('input');
  gm.type = 'checkbox';
  gm.checked = options.gm;
  const gmName = document.createElement('span');
  gmLabel.append(gm, gmName);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.hidden = !gm.checked;
  if (options.onSettings) settings.addEventListener('click', options.onSettings);
  gm.addEventListener('change', () => {
    settings.hidden = !gm.checked;
    options.onGm(gm.checked);
  });
  const hint = document.createElement('span');
  hint.className = 'free-world-hint';
  root.append(regionLabel, sizeLabel, seedLabel, apply, random, gmLabel, ...options.onSettings ? [settings] : [], hint);
  // 监听挂在整条宿主工具条上，世界与天气控制、场景按钮同样适用。
  const events = new AbortController();
  const signal = events.signal;
  host.addEventListener('focusin', options.onFocus, { signal });
  // 冒泡到宿主时各控件自己的处理已执行完；种子输入框保留焦点以便继续输入，应用与规模留着以便看到种子的校验提示。
  host.addEventListener('click', (event) => { if (event.target instanceof Element && event.target.closest('button:not([type=submit]), summary')) options.onFocusGame(); }, { signal });
  host.addEventListener('change', (event) => { if ((event.target instanceof HTMLSelectElement && event.target !== size) || event.target === gm) options.onFocusGame(); }, { signal });
  // 表单操作保留浏览器默认行为，同时避免触发角色动作和游戏快捷键。
  for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel']) {
    host.addEventListener(type, (event) => event.stopPropagation(), { signal });
  }
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    root.setAttribute('aria-label', en ? 'Main world controls' : '主世界工具条');
    regionName.textContent = en ? 'Travel' : '快速旅行';
    region.title = en ? 'Walk between regions or travel instantly within this world. Progress is preserved.' : '可步行跨区，或在同一世界快速旅行；不会重置探索进度。';
    options.regions.forEach((entry, index) => { region.options[index]!.textContent = en ? entry.labelEn : entry.label; });
    sizeName.textContent = en ? 'Size' : '规模';
    size.title = en ? 'Choose a size, then Apply or Random world to generate it.' : '选择规模后，点击应用或随机世界才会重新生成。';
    Object.values(FREE_WORLD_SIZES).forEach((entry, index) => {
      size.options[index]!.textContent = `${en ? entry.labelEn : entry.label} · ${entry.width} × ${entry.height}`;
    });
    seedName.textContent = en ? 'Seed' : '种子';
    seed.title = en ? 'Integer from 0 to 4294967295. The same seed and size recreate the same world.' : '请输入 0–4294967295 的整数；相同种子与规模可复现世界。';
    apply.textContent = en ? 'Apply' : '应用';
    random.textContent = en ? 'Random world' : '随机世界';
    gmName.textContent = en ? 'GM tools' : 'GM 工具';
    gm.title = options.gmHint === 'reload'
      ? en ? 'Changing GM tools reloads the world.' : '切换 GM 工具会重新加载世界。'
      : en ? 'Takes effect in the wilds' : '进入原野后生效';
    settings.textContent = en ? 'GM settings' : 'GM 设置';
    hint.textContent = en ? 'Same seed + size, same world · Walk or travel without resetting' : '同种子与规模可复现 · 步行跨区 / 快速旅行不重置';
  };
  syncLanguage();
  const unsubscribe = onLanguageChange(syncLanguage);
  host.append(root);
  return {
    setRegion(id): void { selectedRegion = id; region.value = id; },
    dispose(): void {
      unsubscribe();
      events.abort();
      root.remove();
    },
  };
}
