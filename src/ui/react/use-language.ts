import { useSyncExternalStore } from 'react';
import { getLanguage, onLanguageChange, type Language } from '../../config/i18n.ts';

/** 订阅当前语言；语言切换时组件重渲染，文案经 t() 重新取值。 */
export function useLanguage(): Language {
  return useSyncExternalStore(onLanguageChange, getLanguage);
}
