import { APP_ENGLISH } from './i18n/app.ts';
import { GAME_ENGLISH } from './i18n/game.ts';
import { HOME_ENGLISH } from './i18n/home.ts';
import { RENDER_ENGLISH } from './i18n/render.ts';
import { SITE_ENGLISH } from './i18n/site.ts';
import { SOUND_ENGLISH, translateSoundText } from './i18n/sound.ts';

/** Native language names stay readable before a player chooses a locale. */
export const LANGUAGES = [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }] as const;
export type Language = typeof LANGUAGES[number]['id'];

let language: Language = 'en';
const listeners = new Set<(language: Language) => void>();
const english: Record<string, string> = { ...HOME_ENGLISH, ...SOUND_ENGLISH, ...SITE_ENGLISH, ...GAME_ENGLISH, ...APP_ENGLISH, ...RENDER_ENGLISH };

export function getLanguage(): Language { return language; }

/** Only ui/model/language.ts calls this; it owns persistence and validation of the stored choice. */
export function setLanguage(next: Language): void {
  if (language === next) return;
  language = next;
  listeners.forEach((listener) => listener(next));
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Chinese source text is the key; a missing English entry is a copy bug, so it throws.
 * `scope` separates homographs (the skill icon 水 vs. the settings group 水): entries are keyed
 * `scope:原文` and fall back to the unscoped entry.
 */
export function t(zh: string, scope?: string): string {
  if (language === 'zh') return zh;
  // Sound patterns fall through to showcase patterns for composed labels.
  const translated = (scope === undefined ? undefined : english[`${scope}:${zh}`]) ?? english[zh] ?? translateSoundText(zh);
  if (translated === undefined) throw new Error(`Missing English translation: ${zh}`);
  return translated;
}
