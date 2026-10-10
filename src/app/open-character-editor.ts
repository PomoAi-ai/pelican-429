import { openCharacterEditor } from '../ui/character-editor.ts';
import { createCharacterPreview } from './character-editor.ts';
import type { createCharacterAppearanceStore } from './character-appearance.ts';
import { configureCharacterTextures, currentCharacterTextureRenderer } from '../render/character-model.ts';
import { loadGrassyAsset } from '../render/grassy/grassy-rig.ts';

/** 游戏已预载；首页优先使用现有解码器，尚无场景时才临时借用预览 renderer。 */
export function openSavedCharacterEditor(store: ReturnType<typeof createCharacterAppearanceStore>, onClose: () => void, loadAssets = false) {
  return openCharacterEditor({
    appearance: store.current(),
    onApply: value => store.save(value),
    onClose,
    createPreview: (parent, appearance, onError) => createCharacterPreview(parent, appearance, onError, loadAssets ? async renderer => {
      const previous = currentCharacterTextureRenderer();
      if (previous) { await loadGrassyAsset('game'); return; }
      configureCharacterTextures(renderer);
      try { await loadGrassyAsset('game'); }
      finally {
        // 首页背景可能在下载模型期间自行启动，不覆盖它新绑定的 renderer。
        if (currentCharacterTextureRenderer() === renderer) {
          configureCharacterTextures(null);
        }
      }
    } : undefined),
  });
}
