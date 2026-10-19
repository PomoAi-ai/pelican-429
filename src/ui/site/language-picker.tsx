import { t } from '../../config/i18n.ts';
import { Menu } from '../controls/menu.tsx';
import { LANGUAGES, setLanguage } from '../model/language.ts';
import { useLanguage } from '../react/use-language.ts';

// 语言名用各自的母语书写，选择前就能读懂。
const ITEMS = LANGUAGES.map(({ id, label }) => ({ value: id, label: <span lang={id === 'zh' ? 'zh-CN' : 'en'}>{label}</span> }));

/** 语言选择：选中即切换并保存，所有用 t() 的界面随之重绘。 */
export function LanguagePicker({ className }: { className?: string }) {
  const language = useLanguage();
  return <Menu label={t('语言')} value={language} items={ITEMS} onValueChange={setLanguage} className={className} />;
}
