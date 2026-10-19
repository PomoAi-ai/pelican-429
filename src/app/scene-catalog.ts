import { parseAppMode } from '../config/app-mode.ts';
import { FACILITY_SCENES, FACILITY_SCENE_IDS, parseFacilityChapter, type FacilitySceneId } from '../config/facility-scenes.ts';
import { SCENE_DEMOS } from '../config/scene-demos.ts';
import type { ResidenceVariant } from '../config/residence.ts';
import { RESOURCE_CATALOG } from '../render/resource-catalog.ts';

interface SceneEntryBase {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly section: 'world' | 'scenes' | 'perspectives';
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
export type SceneEntry = PerspectiveSceneEntry | ResourceSceneEntry
  // 主世界的城区、原野与关卡条目网址就是游戏网址，场景间切换都留在工作区里。
  | (SceneEntryBase & { readonly kind: 'main-world' })
  | (SceneEntryBase & { readonly kind: 'wilds' })
  | (SceneEntryBase & { readonly kind: 'sandbox' })
  | (SceneEntryBase & { readonly kind: 'transit' })
  | (SceneEntryBase & { readonly kind: 'landing-lab' })
  | (SceneEntryBase & { readonly kind: 'residence'; readonly variant: ResidenceVariant })
  | (SceneEntryBase & { readonly kind: 'demo'; readonly demoId: string })
  | (SceneEntryBase & { readonly kind: 'facility'; readonly sceneId: FacilitySceneId });

const room = [
  ['tile-depth', '普通与加深格 · 深2 / 深3'],
  ['depth-walk', '长廊全建筑展示'], ['room-full', '整砖单间'], ['room-half', '半砖单间'],
  ['room-classic', '整砖两层 · 13格'], ['room-slab-full', '层间组合A · 整砖'],
  ['room-slab-upper', '层间组合C · 上半砖'], ['room-slab-lower', '层间组合B + H'],
  ['shapes', '全部33种实体轮廓'], ['joins', '全部11组明确拼接'], ['walls', '墙窗全形态 · 25 + 3'],
  ['wall-assembly', '墙体完整装配与跨格开窗'], ['platforms', '全部12组平台组合'],
  ['furniture', '全部12类家具 · 16件'], ['doors', '左右门与屋顶太阳能'],
  ['solar', '一整排太阳能 · 踩踏与追光'], ['liquids', '液体 · 水位与透明度'],
  ['rock-soil', '土中岩层'], ['rock-island', '空岛底岩'], ['rock-ore', '含矿岩层'],
] as const;
const settlement = [
  ['room-full', '整砖旅舍'], ['room-half', '半砖茶室'], ['room-classic', '整砖工坊'],
  ['room-slab-full', 'A楼板书院'], ['room-slab-upper', 'C楼板公馆'], ['room-slab-lower', 'B + H客栈'],
  ['solar', '旅舍屋顶 · 整排太阳能'], ['liquids', '湖岸 · 三水栈桥'], ['rock-soil', '土岩台地 · 矿道西井'],
  ['rock-ore', '含矿洞厅 · 地下回路'], ['harbor', '海岸驿站 · 服务屋顶'], ['ruins', '遗迹庭院 · 观景门楼'],
  ['rock-island', '空岛花园 · 高处回路'], ['arcade', '窗廊 · 屋顶设备间'],
] as const;
const depth = [
  ['valley', '花园山谷'], ['lake', '湖畔松林'], ['coast', '海岸小镇'],
  ['buildings', '层叠城镇'], ['ruins', '月夜遗迹'], ['cave', '晶石洞厅'], ['skyline', 'AI 天际线'],
] as const;
const perspectives = (variant: PerspectiveSceneEntry['variant'], entries: readonly (readonly [string, string])[], prefix = ''): PerspectiveSceneEntry[] =>
  entries.map(([sectionId, title]) => ({ id: `${variant}:${sectionId}`, title: `${prefix}${title}`,
    section: 'perspectives', kind: 'perspective', variant, sectionId, href: `./?mode=resources&scene=${variant}#${sectionId}` }));

export const SCENE_ENTRIES: readonly SceneEntry[] = [
  { id: 'city', title: '城区', href: './?mode=game', section: 'world', kind: 'main-world' },
  { id: 'wilds', title: '原野', href: './?mode=game&free=1', section: 'world', kind: 'wilds' },
  ...FACILITY_SCENE_IDS.map(sceneId => ({ id: `facility:${sceneId}`, title: FACILITY_SCENES[sceneId].name, sceneId, kind: 'facility' as const,
    ...sceneId === 'original' ? { href: `./?mode=facility&scene=${sceneId}`, section: 'scenes' as const }
      : { href: `./?mode=game&level=facility&scene=${sceneId}`, section: 'world' as const } })),
  { id: 'sandbox', title: '自由搭建场', href: './?mode=lab&demo=sandbox', section: 'scenes', kind: 'sandbox' },
  { id: 'transit', title: '星舰交通中心', href: './?mode=lab&demo=transit', section: 'scenes', kind: 'transit' },
  { id: 'transit-flight-lab', title: '星舰飞行 · 着陆测试', href: './?mode=lab&demo=transit-flight-lab', section: 'scenes', kind: 'landing-lab' },
  { id: 'residence', title: 'AI 住宅', href: './?mode=lab&demo=residence', section: 'scenes', kind: 'residence', variant: 'original' },
  { id: 'residence-2', title: 'AI 住宅 2', href: './?mode=lab&demo=residence-2', section: 'scenes', kind: 'residence', variant: 'harbor' },
  { id: 'residence-3', title: 'AI 住宅 3', href: './?mode=lab&demo=residence-3', section: 'scenes', kind: 'residence', variant: 'three' },
  ...SCENE_DEMOS.map(demo => ({ id: demo.id, title: demo.title.replace(/^\d+\s*·\s*/, ''),
    href: `./?mode=lab&demo=${demo.id}`, section: 'scenes' as const, kind: 'demo' as const, demoId: demo.id })),
  ...perspectives('room', room), ...perspectives('settlement', settlement, '城镇 · '), ...perspectives('depth', depth, '分层 · '),
  ...RESOURCE_CATALOG.subjects.map(subject => ({ id: `resource:${subject.id}`, title: subject.name,
    href: `./?mode=resources&resource=${subject.id}`, section: 'perspectives' as const, kind: 'resource' as const, resourceId: subject.id })),
  { id: 'resource:building-kit', title: '建筑构件四类对照', href: './?mode=resources&demo=building-kit', section: 'perspectives', kind: 'resource', resourceId: 'building-kit' },
];

export function resolveSceneEntry(url: URL): SceneEntry {
  const params = url.searchParams;
  const mode = parseAppMode(params, false);
  let id: string;
  if (mode === 'game') {
    const level = params.get('level');
    if (params.get('free') === '1') id = 'wilds';
    else if (level === null || level === 'harbor') id = 'city';
    else if (level === 'transit') id = 'transit';
    else if (level === 'facility') id = `facility:${parseFacilityChapter(params)}`;
    else throw new Error(`场景工作区不挂载此游戏关卡：${level}`);
  } else if (mode === 'lab') id = params.get('demo') ?? 'residence';
  else if (mode === 'facility') id = `facility:${params.get('scene') ?? 'fortress'}`;
  else if (mode === 'resources') {
    const variant = params.get('scene');
    if (url.hash === '#ai-residence') id = 'residence';
    else if (variant) id = `${variant}:${url.hash.slice(1) || (variant === 'depth' ? 'valley' : variant === 'room' ? 'room-slab-upper' : 'room-full')}`;
    else id = `resource:${params.get('resource') ?? params.get('demo') ?? 'building-kit'}`;
  } else throw new Error(`不是场景工作区地址：${url.href}`);
  const entry = SCENE_ENTRIES.find(item => item.id === id);
  if (!entry) throw new Error(`场景目录中不存在项目：${id}`);
  return entry;
}
