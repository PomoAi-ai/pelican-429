/** Native language names stay readable before a player chooses a locale. */
export const LANGUAGES = [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }] as const;
export type Language = typeof LANGUAGES[number]['id'];

let language: Language = 'en';
const listeners = new Set<(language: Language) => void>();

export function getLanguage(): Language { return language; }

export function setLanguageState(next: Language): void {
  if (language === next) return;
  language = next;
  listeners.forEach((listener) => listener(next));
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
