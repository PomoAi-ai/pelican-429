export type Language = 'zh' | 'en';

const key = 'pelican-language';
const listeners = new Set<(language: Language) => void>();
let language: Language = readLanguage();

function readLanguage(): Language {
  const stored = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage.getItem(key) : null;
  return stored === 'en' ? 'en' : 'zh';
}

if (typeof document !== 'undefined') document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

export function getLanguage(): Language { return language; }

export function setLanguage(next: Language): void {
  if (language === next) return;
  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem(key, next);
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach((listener) => listener(next));
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
