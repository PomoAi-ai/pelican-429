import { DEFAULT_CHARACTER_APPEARANCE, parseCharacterAppearance, type CharacterAppearance } from '../config/character-appearance.ts';

export const CHARACTER_APPEARANCE_STORAGE_KEY = 'pelican-character-appearance';

/** 保存成功后再发布新外观；配额错误不能让游戏和已保存角色分叉。 */
export function createCharacterAppearanceStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const raw = storage.getItem(CHARACTER_APPEARANCE_STORAGE_KEY);
  let current = raw === null ? structuredClone(DEFAULT_CHARACTER_APPEARANCE) : parseCharacterAppearance(JSON.parse(raw));
  return {
    current: (): CharacterAppearance => current,
    save(value: CharacterAppearance): void {
      const next = parseCharacterAppearance(value);
      storage.setItem(CHARACTER_APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      current = next;
    },
  };
}
