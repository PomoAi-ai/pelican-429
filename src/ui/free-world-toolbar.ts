import { FREE_WORLD_SIZES, parseFreeWorldSize, type FreeWorldSize } from '../config/free-world.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export interface FreeWorldToolbarOptions {
  seed: number;
  size: FreeWorldSize;
  gm: boolean;
  region: string;
  regions: readonly { id: string; label: string; labelEn: string }[];
  onSeed(seed: number, size: FreeWorldSize): void;
  onGm(on: boolean): void;
  onRegion(id: string): boolean;
  onSettings(): void;
  onFocus(): void;
}

export function createFreeWorldToolbar(parent: HTMLElement, options: FreeWorldToolbarOptions): { setRegion(id: string): void; dispose(): void } {
  const root = document.createElement('form');
  root.className = 'free-world-toolbar';
  const title = document.createElement('strong');
  title.className = 'free-world-title';
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
  settings.addEventListener('click', options.onSettings);
  gm.addEventListener('change', () => {
    settings.hidden = !gm.checked;
    options.onGm(gm.checked);
  });
  const hint = document.createElement('span');
  hint.className = 'free-world-hint';
  root.append(title, regionLabel, sizeLabel, seedLabel, apply, random, gmLabel, settings, hint);
  root.addEventListener('focusin', options.onFocus);
  // 表单操作保留浏览器默认行为，同时避免触发角色动作和游戏快捷键。
  for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    title.textContent = en ? 'Free world' : '自由世界';
    root.setAttribute('aria-label', en ? 'Free world controls' : '自由世界工具条');
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
    gm.title = en ? 'Changing GM tools reloads the world.' : '切换 GM 工具会重新加载世界。';
    settings.textContent = en ? 'GM settings' : 'GM 设置';
    hint.textContent = en ? 'Same seed + size, same world · Walk or travel without resetting' : '同种子与规模可复现 · 步行跨区 / 快速旅行不重置';
  };
  syncLanguage();
  const unsubscribe = onLanguageChange(syncLanguage);
  document.body.classList.add('free-world');
  parent.append(root);
  return {
    setRegion(id): void { selectedRegion = id; region.value = id; },
    dispose(): void {
      unsubscribe();
      root.remove();
      document.body.classList.remove('free-world');
    },
  };
}
