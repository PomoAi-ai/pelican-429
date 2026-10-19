import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../config/i18n.ts';
import { ART_LIBRARY_GROUPS, type ArtLibraryGroup, type ArtLibraryImage } from '../../config/art-library.ts';
import { buildClassicsGroup, buildRosterGroup, type ClassicsDefinitions, type RosterDefinitions } from '../../config/art-library-sets.ts';
import { getLanguage } from '../model/language.ts';
import { guidedImageUrl } from '../hud/ruler-guides.ts';
import { useLanguage } from '../react/use-language.ts';
import '../panels/showcase.css';
import '../panels/character-stage.css';
import './art-library.css';

type ArtEntry = ArtLibraryGroup['entries'][number];

const statusLabel = (status: ArtEntry['status']): string =>
  status === 'confirmed' ? t('已确认原画') : status === 'derived' ? t('确认稿派生') : t('待核对');
const text = (value: readonly [string, string]): string => value[getLanguage() === 'en' ? 1 : 0];

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} 读取失败：${response.status}`);
  return response.json() as Promise<T>;
}

/** 24 款与古典角色的条目来自 public 下的定义 JSON；读取一次，排在角色设定之后。 */
export async function loadArtLibraryGroups(): Promise<readonly ArtLibraryGroup[]> {
  const [roster, classics] = await Promise.all([
    fetchJson<RosterDefinitions>('./art-library/roster-24/definitions/roster.json'),
    fetchJson<ClassicsDefinitions>('./art-library/classics-7/definitions.json'),
  ]);
  const [characters, ...rest] = ART_LIBRARY_GROUPS;
  return [characters!, buildRosterGroup(roster), buildClassicsGroup(classics, roster.common.proportion.targetHeads), ...rest];
}

/** 原画资料库页（?mode=catalog）：顶部标签切换分组，每组是一张长页，左侧目录按锚点跳转。 */
export function ArtLibrary({ groups }: { groups: readonly ArtLibraryGroup[] }) {
  useLanguage();
  const entries = groups.flatMap(group => group.entries);
  const groupOf = (entry: ArtEntry): ArtLibraryGroup => groups.find(group => group.entries.includes(entry))!;
  // 地址锚点可以是条目 id（切到所在分组并滚到该条）或分组 id（只切标签）；未知锚点忽略。
  const fromHash = (): ArtEntry | undefined => {
    const id = decodeURIComponent(location.hash.slice(1));
    return groups.find(group => group.id === id)?.entries[0] ?? entries.find(entry => entry.id === id);
  };
  const [current, setCurrent] = useState<ArtEntry>(() => fromHash() ?? entries[0]!);
  const [tab, setTab] = useState(() => groupOf(current));
  const [query, setQuery] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const detail = useRef<HTMLDivElement>(null);
  const directory = useRef<HTMLElement>(null);
  const tabs = useRef<HTMLElement>(null);
  // 跳转目标在下一次提交后滚到顶部（切换标签时条目要先渲染出来）。
  const scrollTarget = useRef<ArtEntry | null>(current);
  const sectionOf = (entry: ArtEntry): HTMLElement => detail.current!.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`)!;

  const title = t('原画资料库');
  useEffect(() => { document.title = `${title} · ${t('鹈鹕')} 429`; }, [title]);

  const show = (entry: ArtEntry): void => {
    setTab(groupOf(entry));
    setCurrent(entry);
    history.replaceState(null, '', `#${entry.id}`);
    scrollTarget.current = entry;
    setDirectoryOpen(false);
  };

  useLayoutEffect(() => {
    const entry = scrollTarget.current;
    if (!entry) return;
    scrollTarget.current = null;
    sectionOf(entry).scrollIntoView({ block: 'start' });
  });
  useLayoutEffect(() => {
    tabs.current!.querySelector('[aria-selected="true"]')!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  useLayoutEffect(() => {
    directory.current!.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, tab, query]);

  // 长页阅读位置：取最后一个顶边越过阅读线的条目，同步目录高亮与地址锚点。
  const spy = useRef(() => {});
  spy.current = () => {
    const line = detail.current!.getBoundingClientRect().top + 80;
    let next = tab.entries[0]!;
    for (const entry of tab.entries) if (sectionOf(entry).getBoundingClientRect().top <= line) next = entry;
    if (next === current) return;
    setCurrent(next);
    history.replaceState(null, '', `#${next.id}`);
  };
  useEffect(() => {
    const element = detail.current!;
    let frame = 0;
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; spy.current(); });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => { element.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  const onHash = useRef(() => {});
  onHash.current = () => {
    const entry = fromHash();
    if (entry && entry !== current) show(entry);
  };
  useEffect(() => {
    const listener = (): void => onHash.current();
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);

  const search = query.trim().toLocaleLowerCase();
  // 不搜索时只列当前标签；搜索时跨全部分组，点结果会切到对应标签。
  const visible = (search ? groups : [tab]).map(group => ({
    ...group,
    entries: group.entries.filter(entry => [...group.label, ...entry.title, ...entry.description].join(' ').toLocaleLowerCase().includes(search)),
  })).filter(group => group.entries.length > 0);
  const count = visible.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <section className={`showcase-app sc-character-stage art-library${directoryOpen ? ' sc-directory-open' : ''}`}>
      <aside className="sc-sidebar" id="art-library-directory">
        <div className="sc-brand"><span className="sc-brand-mark" aria-hidden="true">P</span><div><h1>{title}</h1><span>PELICAN 429 · ART ARCHIVE</span></div></div>
        <div className="sc-search"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜索全部原画…')} aria-label={t('搜索原画目录')} /></div>
        <div className="sc-directory-heading"><span>{t('本页目录')}</span><span className="art-library-count">{count}</span></div>
        <nav ref={directory} className="sc-stage-directory" aria-label={t('原画目录')}>
          {count === 0 ? <p className="sc-no-results">{t('没有匹配的原画')}</p> : visible.map(group => (
            <div key={group.id} className="art-library-group">
              {search && <h3>{text(group.label)}<span>{group.entries.length}</span></h3>}
              {group.entries.map((entry, index) => {
                const on = entry.id === current.id;
                const subgroup = entry.subgroup && entry.subgroup[0] !== group.entries[index - 1]?.subgroup?.[0] ? entry.subgroup : null;
                return [
                  subgroup && <h4 key={`${entry.id}-subgroup`} className="art-library-subgroup">{text(subgroup)}<span>{group.entries.filter(item => item.subgroup?.[0] === subgroup[0]).length}</span></h4>,
                  <div key={entry.id} className={`sc-stage-directory-row${on ? ' sc-selected' : ''}`}>
                    <button type="button" className="sc-stage-select" aria-current={String(on) as 'true' | 'false'} onClick={() => show(entry)}>
                      <img src={entry.images[0]!.path} alt="" loading="lazy" decoding="async" />
                      <span className="sc-stage-subject"><strong>{text(entry.title)}</strong><span className="sc-stage-subject-count" data-status={entry.status}>{statusLabel(entry.status)} · {entry.images.length} {t('张')}</span></span>
                    </button>
                  </div>,
                ];
              })}
            </div>
          ))}
        </nav>
        <div className="sc-stage-sidebar-bottom"><a className="art-library-source" href="./art-library/SOURCE.md" target="_blank" rel="noopener">{t('查看完整来源记录')} ↗</a></div>
      </aside>
      <div className="sc-stage-main">
        <header className="sc-stage-toolbar">
          <button type="button" className="sc-stage-directory-toggle" aria-controls="art-library-directory" aria-expanded={directoryOpen} onClick={() => setDirectoryOpen(open => !open)}>☰ {t('目录')}</button>
          <nav ref={tabs} className="art-library-tabs" role="tablist" aria-label={t('原画分类')}>
            {groups.map(group => (
              <button key={group.id} type="button" role="tab" aria-selected={group === tab} onClick={() => {
                setTab(group);
                setCurrent(group.entries[0]!);
                history.replaceState(null, '', `#${group.id}`);
                detail.current!.scrollTop = 0;
              }}>{text(group.label)}<span>{group.entries.length}</span></button>
            ))}
          </nav>
        </header>
        <div ref={detail} className="art-library-detail">
          {tab.entries.map((entry, index) => <ArtEntrySection key={entry.id} entry={entry} first={index === 0} subgroup={entry.subgroup && entry.subgroup[0] !== tab.entries[index - 1]?.subgroup?.[0] ? entry.subgroup : null} />)}
        </div>
      </div>
    </section>
  );
}

function ArtEntrySection({ entry, first, subgroup }: { entry: ArtEntry; first: boolean; subgroup: readonly [string, string] | null }) {
  return (
    <section className="art-library-entry" id={entry.id} aria-labelledby={`${entry.id}-title`}>
      {subgroup && <p className="art-library-entry-subgroup">{text(subgroup)}</p>}
      <header className="art-library-entry-heading">
        <span className="art-library-status" data-status={entry.status}>{statusLabel(entry.status)}</span>
        <h2 id={`${entry.id}-title`}>{text(entry.title)}</h2>
        <p>{text(entry.description)}</p>
      </header>
      <div className="art-library-evidence"><strong>{t('确认与来源')}</strong><p>{text(entry.evidence)}</p></div>
      {entry.facts && <dl className="art-library-facts">{entry.facts.map(([label, value]) => [<dt key={`${label[0]}-term`}>{text(label)}</dt>, <dd key={`${label[0]}-value`}>{value}</dd>])}</dl>}
      {entry.files && <p className="art-library-files"><strong>{t('附件')}</strong>{entry.files.map(file => <a key={file.path} href={file.path} target="_blank" rel="noopener">{text(file.label)} ↗</a>)}</p>}
      <div className="art-library-images">
        {entry.images.map((image, index) => <ArtFigure key={image.path} image={image} eager={first && index === 0} />)}
      </div>
    </section>
  );
}

/** 标尺图的虚线由程序叠画，默认显示；一页可能有几十张大图，滚到附近才叠线，避免进页时全部解码。 */
function ArtFigure({ image, eager }: { image: ArtLibraryImage; eager: boolean }) {
  const [guides, setGuides] = useState(image.guides !== undefined);
  const [guided, setGuided] = useState<string | null>(null);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    if (image.guides === undefined || !guides || guided !== null) return;
    let alive = true;
    const observer = new IntersectionObserver((records) => {
      if (!records.some(record => record.isIntersecting)) return;
      observer.disconnect();
      void guidedImageUrl(image.path, image.guides!).then((url) => { if (alive) setGuided(url); });
    }, { rootMargin: '600px 0px' });
    observer.observe(figure.current!);
    return () => { alive = false; observer.disconnect(); };
  }, [image, guides, guided]);
  const label = text(image.label);
  return (
    <figure ref={figure}>
      <a href={image.path} target="_blank" rel="noopener" aria-label={`${label} · ${t('新标签打开原图')}`}>
        <img src={guides && guided !== null ? guided : image.path} alt={label} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      </a>
      <figcaption><span>{label}</span><span className="art-library-figure-actions">
        {image.guides !== undefined && <button type="button" aria-pressed={guides} onClick={() => setGuides(on => !on)}>{guides ? t('隐藏虚线') : t('显示虚线')}</button>}
        <a href={image.path} target="_blank" rel="noopener">{t('查看原图')} ↗</a>
      </span></figcaption>
    </figure>
  );
}
