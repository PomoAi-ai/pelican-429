import { openCharacterEditor } from '../../ui/panels/character-editor.tsx';
import { createCharacterPreview } from './character-editor.ts';
import type { createCharacterAppearanceStore } from './character-appearance.ts';
import { loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { TUNING } from '../../config/tuning.ts';
import type { PageContext } from '../shell/page-context.ts';
import { pageRenderer } from '../shell/page-renderer.ts';

/** 游戏已预载角色；首页传入页面，由页主渲染器（与首屏场景共用）转码后加载，预览自己的渲染器不绑定贴图。 */
export function openSavedCharacterEditor(store: ReturnType<typeof createCharacterAppearanceStore>, onClose: () => void, loadFor?: PageContext) {
  return openCharacterEditor({
    appearance: store.current(),
    onApply: value => store.save(value),
    onClose,
    createPreview: (parent, appearance, onError) => createCharacterPreview(parent, appearance, onError, loadFor ? async () => {
      pageRenderer(loadFor, 'game', TUNING);
      await loadGrassyAsset('game');
    } : undefined),
  });
}
