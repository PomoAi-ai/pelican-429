import { LANGUAGES, getLanguage, setLanguageState, type Language } from '../core/language.ts';
export { LANGUAGES, getLanguage, onLanguageChange, type Language } from '../core/language.ts';

const isLanguage = (value: unknown): value is Language => LANGUAGES.some((item) => item.id === value);

const key = 'pelican-language';
setLanguageState(readLanguage());

function readLanguage(): Language {
  const stored = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage.getItem(key) : null;
  if (isLanguage(stored)) return stored;
  if (typeof navigator !== 'undefined') {
    for (const locale of navigator.languages) {
      const candidate = locale.toLowerCase().split('-')[0];
      if (isLanguage(candidate)) return candidate;
    }
  }
  return 'en';
}

if (typeof document !== 'undefined') document.documentElement.lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';

export function setLanguage(next: Language): void {
  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem(key, next);
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  setLanguageState(next);
}
