import { releasedUrl } from './app-mode.ts';
import { RESOURCE_SUBJECTS } from './resource-subjects.ts';
import { SCENE_DEMOS } from './scene-demos.ts';

/**
 * 全站唯一的页面登记表：顶栏是大类，点大类直接进该类第一页；大类下的二级栏列出同类页面，一键切换；
 * 场景工作区的侧栏列出所在页面的 entries。每个页面只属于一个大类，用 match 判定当前地址落在哪一页；
 * 同类内按 clusters 分段，段间画分隔线。所有页面都是 index 的 mode。
 */
export interface SitePage {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly description: readonly [string, string];
  readonly href: string;
  readonly match: (url: URL) => boolean;
  /** 场景工作区侧栏条目。 */
  readonly entries?: readonly SiteEntry[];
}

/** 侧栏条目的标题是中文原文，显示时经 t() 翻译：同一标题也是场景页自己的标题，译文只在字典里存一份。 */
export interface SiteEntry {
  readonly id: string;
  readonly title: string;
  readonly href: string;
}

export interface SiteSection {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly clusters: readonly (readonly SitePage[])[];
}

const mode = ({ searchParams: params }: URL): string | null => params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : null);
const chapter = (scene: string) => (url: URL): boolean =>
  mode(url) === 'game' && url.searchParams.get('level') === 'facility' && (url.searchParams.get('scene') ?? 'fortress') === scene;

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
const perspectives = (variant: string, list: readonly (readonly [string, string])[], prefix = ''): SiteEntry[] =>
  list.map(([section, title]) => ({ id: `${variant}:${section}`, title: `${prefix}${title}`, href: `./?mode=resources&scene=${variant}#${section}` }));

/** 场景页（mode=lab）：搭建场、着陆测试与场景演示。 */
const SCENE_LAB_ENTRIES: readonly SiteEntry[] = [
  { id: 'sandbox', title: '自由搭建场', href: './?mode=lab&demo=sandbox' },
  { id: 'transit-flight-lab', title: '星舰飞行 · 着陆测试', href: './?mode=lab&demo=transit-flight-lab' },
  ...SCENE_DEMOS.map(demo => ({ id: demo.id, title: demo.title.replace(/^\d+\s*·\s*/, ''), href: `./?mode=lab&demo=${demo.id}` })),
];

/** 场景透视页（mode=resources）：房间、城镇、分层透视与真实游戏资源检视。 */
const PERSPECTIVE_ENTRIES: readonly SiteEntry[] = [
  ...perspectives('room', room), ...perspectives('settlement', settlement, '城镇 · '), ...perspectives('depth', depth, '分层 · '),
  ...RESOURCE_SUBJECTS.map(subject => ({ id: `resource:${subject.id}`, title: subject.name, href: `./?mode=resources&resource=${subject.id}` })),
  { id: 'resource:building-kit', title: '建筑构件四类对照', href: './?mode=resources&resource=building-kit' },
];

export const SITE_SECTIONS: readonly SiteSection[] = [
  {
    id: 'play', label: ['游玩', 'Play'], clusters: [[
      { id: 'free-world', label: ['主世界', 'Main world'], description: ['从 AI 城区出发，左有星舰交通中心，向右走进按种子生成的原野。', 'Start in the AI city: the Starship transit hub on the left, seeded wilds to the right.'], href: './?mode=game',
        match: url => mode(url) === 'game' && url.searchParams.get('level') === null },
      { id: 'story', label: ['主线', 'Story'], description: ['序章到山体算力堡垒，含守卫与首领战。', 'From the prelude to the Mountain Compute Fortress, with guards and boss fights.'], href: './?mode=story', match: url => mode(url) === 'story' },
      { id: 'homestead', label: ['家园', 'Homestead'], description: ['家园概念版：人形探索、机器人生产、电力与算力。', 'Homestead concept: exploration, robots, power and compute.'], href: './?mode=homestead', match: url => mode(url) === 'homestead' && url.searchParams.get('scene') !== 'residence' },
      { id: 'residence', label: ['住宅建造', 'Home building'], description: ['用白蓝建筑格、能量门与生活设施搭建自己的 AI 住宅。', 'Build an AI home with white and blue blocks, energy doors and furnishings.'], href: './?mode=homestead&scene=residence', match: url => mode(url) === 'homestead' && url.searchParams.get('scene') === 'residence' },
    ], [
      { id: 'fortress', label: ['01 山体算力堡垒', '01 Mountain Compute Fortress'], description: ['三层机房与屋顶冷却阵列。', 'Server floors and rooftop cooling.'], href: './?mode=game&level=facility&scene=fortress', match: chapter('fortress') },
      { id: 'cathedral', label: ['02 算力大教堂', '02 Compute Cathedral'], description: ['五组算力塔围绕中央大厅。', 'Five compute towers around a central hall.'], href: './?mode=game&level=facility&scene=cathedral', match: chapter('cathedral') },
      { id: 'abyss', label: ['03 光纤深渊', '03 Fiber Abyss'], description: ['悬空主桥、冷却深井与网络核心。', 'Suspended bridges, cooling shafts and the network core.'], href: './?mode=game&level=facility&scene=abyss', match: chapter('abyss') },
      { id: 'boss-arena', label: ['Boss 场', 'Boss arena'], description: ['单独练习首领战。', 'Practise the boss fights on their own.'], href: './?mode=game&level=boss-arena', match: url => mode(url) === 'game' && url.searchParams.get('level') === 'boss-arena' },
    ], [
      { id: 'intro', label: ['序章动画', 'Prelude'], description: ['AGI 降智风暴的开场动画。', 'The opening animation of the AGI storm.'], href: './?mode=intro&opening=finale', match: url => mode(url) === 'intro' },
      { id: 'controls', label: ['手机操控测试', 'Mobile controls test'], description: ['固定测试关卡，检查手机操控。', 'A fixed test level for mobile controls.'], href: './?mode=controls&level=test', match: url => mode(url) === 'controls' },
    ]],
  },
  {
    id: 'world', label: ['世界与场景', 'World & scenes'], clusters: [[
      { id: 'lab', label: ['场景', 'Scenes'], description: ['自由搭建场、星舰飞行着陆测试与场景组合。', 'Building sandbox, starship flight and landing tests, and scene samples.'], href: './?mode=lab&demo=sandbox', match: url => mode(url) === 'lab', entries: SCENE_LAB_ENTRIES },
      { id: 'perspective', label: ['场景透视', 'Scene perspectives'], description: ['房间、城镇、分层场景与真实游戏资源的透视检查。', 'Inspect rooms, settlements, depth layers and game resources.'], href: './?mode=resources&scene=room#room-slab-upper', match: url => mode(url) === 'resources', entries: PERSPECTIVE_ENTRIES },
    ]],
  },
  {
    // 当前角色的 3D 展示单列一段；头发预览与渲染实验是同一角色的发型与渲染对照（头发卡片直接打开渲染实验）；历史模型与画质对比都是对照留档。
    id: 'characters', label: ['角色与模型', 'Characters & models'], clusters: [[
      { id: 'showcase', label: ['角色展示场', 'Character showcase'], description: ['实时 3D 角色与动作，最多 8 张卡并排比较。', 'Live 3D characters and actions, up to eight side by side.'], href: './?mode=showcase', match: url => mode(url) === 'showcase' && url.searchParams.get('library') !== 'history' },
    ], [
      { id: 'hair-gallery', label: ['头发预览', 'Hair preview'], description: ['全部候选头发在同一光照与视角下对照。', 'Every candidate hairstyle under the same light and angle.'], href: './?mode=hair-gallery', match: url => mode(url) === 'hair-gallery' },
      { id: 'render-lab', label: ['渲染实验', 'Render lab'], description: ['D1 角色的独立渲染、眼睛与头发版本对照。', 'Standalone D1 rendering with eye and hair versions side by side.'], href: './?mode=render-lab', match: url => mode(url) === 'render-lab' },
    ], [
      { id: 'history', label: ['历史模型', 'Historical models'], description: ['归档的旧模型与建模方法对照。', 'Archived models and modelling methods.'], href: './?mode=showcase&library=history', match: url => mode(url) === 'showcase' && url.searchParams.get('library') === 'history' },
      { id: 'compare', label: ['画质对比', 'Visual comparison'], description: ['同一模型在不同贴图档位下的效果。', 'One model across texture quality tiers.'], href: './?mode=compare', match: url => mode(url) === 'compare' },
    ]],
  },
  {
    id: 'reference', label: ['资料', 'Reference'], clusters: [[
      { id: 'concepts', label: ['基础概念', 'Basic concepts'], description: ['世界、尺度、场景构件、植物与经济系统的定义文档。', 'Definitions for the world, scale, scenery, plants and economy.'], href: './?mode=concepts', match: url => mode(url) === 'concepts' },
      { id: 'catalog', label: ['原画资料库', 'Concept art library'], description: ['角色、敌人、装备、场景与分镜原画。', 'Character, enemy, equipment, scene and storyboard artwork.'], href: './?mode=catalog', match: url => mode(url) === 'catalog' },
      { id: 'sounds', label: ['声音目录', 'Sound library'], description: ['游戏音效逐项试听。', 'Browse and play every sound effect.'], href: './?mode=sounds', match: url => mode(url) === 'sounds' },
    ]],
  },
  {
    id: 'lab', label: ['实验室', 'Lab'], clusters: [[
      { id: 'maglev', label: ['磁悬浮', 'Maglev'], description: ['晴空线磁悬浮试车场。', 'The Skyline maglev test track.'], href: './?mode=maglev', match: url => mode(url) === 'maglev' },
    ]],
  },
];

/** 当前地址所在的大类与页面；首页、帮助等不在两级导航里的页面返回 null。 */
export function findSitePage(url: URL): { section: SiteSection; page: SitePage } | null {
  for (const section of SITE_SECTIONS) {
    for (const page of section.clusters.flat()) if (page.match(url)) return { section, page };
  }
  return null;
}

/** 发布版去掉打不开的页面（实验页、原画库、历史与对比等），整类都打不开时大类也不显示。 */
export function siteSections(release: boolean): readonly SiteSection[] {
  if (!release) return SITE_SECTIONS;
  return SITE_SECTIONS
    .map(section => ({ ...section, clusters: section.clusters.map(cluster => cluster.filter(page => releasedUrl(new URL(page.href, 'https://release.invalid/')))).filter(cluster => cluster.length > 0) }))
    .filter(section => section.clusters.length > 0);
}
