import { useState, useSyncExternalStore } from 'react';
import { FREE_WORLD_SIZES, type FreeWorldSize } from '../../config/free-world.ts';
import { t } from '../../config/i18n.ts';
import { Select } from '../controls/select.tsx';
import { Switch } from '../controls/switch.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './free-world.css';

interface FreeWorldToolbarOptions {
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
  onFocus(): void;
  /** 点按钮、改下拉后把焦点还给画布，键盘立即驱动角色。 */
  onFocusGame(): void;
}

const SIZES = Object.keys(FREE_WORLD_SIZES) as FreeWorldSize[];

function FreeWorldToolbarView({ options, region: regionStore }: { options: FreeWorldToolbarOptions; region: Store<string> }) {
  const en = useLanguage() === 'en';
  const region = useSyncExternalStore(regionStore.subscribe, regionStore.get);
  const [size, setSize] = useState(options.size);
  const [seed, setSeed] = useState(String(options.seed));
  const [gm, setGm] = useState(options.gm);
  return (
    <form className="free-world-toolbar" aria-label={t('主世界工具条')} onSubmit={(event) => {
      event.preventDefault();
      // 表单校验（required、0–4294967295 的整数）通过后才会提交。
      options.onSeed(Number(seed), size);
    }}>
      <label title={t('可步行跨区，或在同一世界快速旅行；不会重置探索进度。')}>
        <span>{t('快速旅行')}</span>
        <Select
          label={t('快速旅行')}
          value={region}
          items={options.regions.map((entry) => ({ value: entry.id, label: en ? entry.labelEn : entry.label }))}
          onValueChange={(id) => {
            if (options.onRegion(id)) regionStore.set(id);
            options.onFocusGame();
          }}
        />
      </label>
      {/* 改规模不还焦点：留着以便接着点应用或随机世界。 */}
      <label className="free-world-size" title={t('选择规模后，点击应用或随机世界才会重新生成。')}>
        <span>{t('规模')}</span>
        <Select
          label={t('规模')}
          value={size}
          items={SIZES.map((id) => ({ value: id, label: `${en ? FREE_WORLD_SIZES[id].labelEn : FREE_WORLD_SIZES[id].label} · ${FREE_WORLD_SIZES[id].width} × ${FREE_WORLD_SIZES[id].height}` }))}
          onValueChange={setSize}
        />
      </label>
      <label>
        <span>{t('种子')}</span>
        <input
          className="free-world-seed"
          type="number"
          required
          min="0"
          max="4294967295"
          step="1"
          title={t('请输入 0–4294967295 的整数；相同种子与规模可复现世界。')}
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
        />
      </label>
      <button type="submit">{t('应用')}</button>
      <button type="button" className="free-world-random" onClick={() => {
        const next = crypto.getRandomValues(new Uint32Array(1))[0]!;
        setSeed(String(next));
        options.onSeed(next, size);
      }}>{t('随机世界')}</button>
      <span className="free-world-gm" title={options.gmHint === 'reload' ? t('切换 GM 工具会重新加载世界。') : t('进入原野后生效')}>
        <Switch checked={gm} onCheckedChange={(on) => {
          setGm(on);
          options.onGm(on);
          options.onFocusGame();
        }}>{t('GM 工具')}</Switch>
      </span>
      <span className="free-world-hint">{t('同种子与规模可复现 · 步行跨区 / 快速旅行不重置')}</span>
    </form>
  );
}

/** 主世界控件片段：插进宿主场景工具条，标题、世界与天气控制由宿主工具条提供。 */
export function createFreeWorldToolbar(host: HTMLElement, options: FreeWorldToolbarOptions): { setRegion(id: string): void; dispose(): void } {
  const region = createStore(options.region);
  // display: contents 让片段里的控件直接排进宿主工具条的弹性布局。
  const container = document.createElement('div');
  container.style.display = 'contents';
  host.append(container);
  const unmount = mountReact(container, <FreeWorldToolbarView options={options} region={region} />);
  // 监听挂在整条宿主工具条上，世界与天气控制、场景按钮同样适用。
  const events = new AbortController();
  const signal = events.signal;
  host.addEventListener('focusin', options.onFocus, { signal });
  // 冒泡到宿主时各控件自己的处理已执行完；种子输入框保留焦点以便继续输入，应用留着以便看到种子的校验提示。
  // 弹出列表的按钮（下拉、菜单）此时刚打开弹层，不能抢走焦点。
  host.addEventListener('click', (event) => { if (event.target instanceof Element && event.target.closest('button:not([type=submit]):not([aria-haspopup]), summary')) options.onFocusGame(); }, { signal });
  host.addEventListener('change', (event) => { if (event.target instanceof HTMLSelectElement) options.onFocusGame(); }, { signal });
  // 表单操作保留浏览器默认行为，同时避免触发角色动作和游戏快捷键。
  for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel']) {
    host.addEventListener(type, (event) => event.stopPropagation(), { signal });
  }
  return {
    setRegion(id): void { region.set(id); },
    dispose(): void {
      events.abort();
      unmount();
      container.remove();
    },
  };
}
