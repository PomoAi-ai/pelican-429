import { parseAppMode } from '../../config/app-mode.ts';
import { SITE_SECTIONS, type SiteEntry } from '../../config/site-directory.ts';

interface SceneEntryBase {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly section: 'scenes' | 'perspectives';
}
export interface PerspectiveSceneEntry extends SceneEntryBase {
  readonly kind: 'perspective';
  readonly variant: 'room' | 'settlement' | 'depth';
  readonly sectionId: string;
}
export interface ResourceSceneEntry extends SceneEntryBase {
  readonly kind: 'resource';
  readonly resourceId: string;
}
// 游戏网址一律走整页游戏，工作区只放非游戏场景。
export type SceneEntry = PerspectiveSceneEntry | ResourceSceneEntry
  | (SceneEntryBase & { readonly kind: 'sandbox' })
  | (SceneEntryBase & { readonly kind: 'landing-lab' })
  | (SceneEntryBase & { readonly kind: 'demo'; readonly demoId: string });

const sitePage = (id: string) => SITE_SECTIONS.flatMap(section => section.clusters.flat()).find(page => page.id === id)!;
const PERSPECTIVE_VARIANTS = ['room', 'settlement', 'depth'] as const;

/** 条目来自页面登记表（config/site-directory），这里只按条目编号补上挂载方式。 */
const sceneEntry = ({ id, title, href }: SiteEntry): SceneEntry => {
  const base = { id, title, href, section: 'scenes' } as const;
  if (id === 'sandbox') return { ...base, kind: 'sandbox' };
  if (id === 'transit-flight-lab') return { ...base, kind: 'landing-lab' };
  return { ...base, kind: 'demo', demoId: id };
};
const perspectiveEntry = ({ id, title, href }: SiteEntry): SceneEntry => {
  const [prefix, rest] = id.split(':') as [string, string];
  const base = { id, title, href, section: 'perspectives' } as const;
  if (prefix === 'resource') return { ...base, kind: 'resource', resourceId: rest };
  return { ...base, kind: 'perspective', variant: PERSPECTIVE_VARIANTS.find(variant => variant === prefix)!, sectionId: rest };
};

export const SCENE_ENTRIES: readonly SceneEntry[] = [
  ...sitePage('lab').entries!.map(sceneEntry),
  ...sitePage('perspective').entries!.map(perspectiveEntry),
];

/** 每个条目只认自己的规范网址：同一场景换个 mode 打开直接报错。 */
export function resolveSceneEntry(url: URL): SceneEntry {
  const params = url.searchParams;
  const mode = parseAppMode(params, false);
  let id: string;
  if (mode === 'lab') id = params.get('demo') ?? 'sandbox';
  else if (mode === 'resources') {
    const variant = params.get('scene');
    if (variant) id = `${variant}:${url.hash.slice(1) || (variant === 'depth' ? 'valley' : variant === 'room' ? 'room-slab-upper' : 'room-full')}`;
    else id = `resource:${params.get('resource') ?? 'building-kit'}`;
  } else throw new Error(`不是场景工作区地址：${url.href}`);
  const entry = SCENE_ENTRIES.find(item => item.id === id);
  if (!entry) throw new Error(`场景目录中不存在项目：${id}`);
  if (parseAppMode(new URL(entry.href, url).searchParams, false) !== mode) throw new Error(`非规范网址：${url.search}，请改用 ${entry.href}`);
  return entry;
}
