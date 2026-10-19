/**
 * 站点两级导航：顶栏是大类，点大类直接进该类第一页；大类下的二级栏列出同类页面，一键切换。
 * 每个页面只属于一个大类，用 match 判定当前地址落在哪一页；同类内按 clusters 分段，段间画分隔线。
 */
export interface SitePage {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly description: readonly [string, string];
  readonly href: string;
  readonly match: (params: URLSearchParams) => boolean;
}

export interface SiteSection {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly clusters: readonly (readonly SitePage[])[];
}

const mode = (params: URLSearchParams): string | null => params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : null);
const chapter = (scene: string) => (params: URLSearchParams): boolean =>
  mode(params) === 'game' && params.get('level') === 'facility' && params.get('free') !== '1' && (params.get('scene') ?? 'fortress') === scene;

export const SITE_SECTIONS: readonly SiteSection[] = [
  {
    id: 'play', label: ['游玩', 'Play'], clusters: [[
      { id: 'free-world', label: ['主世界', 'Main world'], description: ['从 AI 城区出发，左有星舰交通中心，向右走进按种子生成的原野。', 'Start in the AI city: the starship transit center on the left, seeded wilds to the right.'], href: './?mode=game',
        match: params => mode(params) === 'game' && (params.get('level') === null || (params.get('level') === 'facility' && params.get('free') === '1')) },
      { id: 'story', label: ['主线', 'Story'], description: ['序章到山体堡垒，含守卫与首领战。', 'From the prelude to the mountain fortress.'], href: './?mode=story', match: params => mode(params) === 'story' },
      { id: 'homestead', label: ['家园', 'Homestead'], description: ['家园概念版：人形探索、机器人生产、电力与算力。', 'Homestead concept: exploration, robots, power and compute.'], href: './?mode=homestead', match: params => mode(params) === 'homestead' && params.get('scene') !== 'residence' },
      { id: 'residence', label: ['住宅建造', 'Home building'], description: ['用白蓝建筑格、能量门与生活设施搭建自己的 AI 住宅。', 'Build an AI home with white and blue blocks, energy doors and furnishings.'], href: './?mode=homestead&scene=residence', match: params => mode(params) === 'homestead' && params.get('scene') === 'residence' },
    ], [
      { id: 'fortress', label: ['01 山体堡垒', '01 Mountain fortress'], description: ['三层机房与屋顶冷却阵列。', 'Server floors and rooftop cooling.'], href: './?mode=game&level=facility&scene=fortress', match: chapter('fortress') },
      { id: 'cathedral', label: ['02 算力大教堂', '02 Compute cathedral'], description: ['五组算力塔围绕中央大厅。', 'Five compute towers around a central hall.'], href: './?mode=game&level=facility&scene=cathedral', match: chapter('cathedral') },
      { id: 'abyss', label: ['03 光纤深渊', '03 Fiber abyss'], description: ['悬空主桥、冷却深井与网络核心。', 'Suspended bridges, cooling shafts and the network core.'], href: './?mode=game&level=facility&scene=abyss', match: chapter('abyss') },
      { id: 'boss-arena', label: ['Boss 场', 'Boss arena'], description: ['单独练习首领战。', 'Practise the boss fights on their own.'], href: './?mode=game&level=boss-arena', match: params => mode(params) === 'game' && params.get('level') === 'boss-arena' },
    ], [
      { id: 'intro', label: ['序章动画', 'Prelude'], description: ['AGI 降智风暴的开场动画。', 'The opening animation of the AGI storm.'], href: './?mode=intro&opening=finale', match: params => mode(params) === 'intro' },
      { id: 'controls', label: ['手机操控测试', 'Mobile controls test'], description: ['固定测试关卡，检查手机操控。', 'A fixed test level for mobile controls.'], href: './?mode=controls&level=test', match: params => mode(params) === 'controls' },
    ]],
  },
  {
    // 角色分两个一级：当前角色的 3D 展示单独一页；历史模型与画质对比都是对照留档，归进“模型档案”。
    id: 'characters', label: ['角色展示场', 'Character showcase'], clusters: [[
      { id: 'showcase', label: ['角色展示场', 'Character showcase'], description: ['实时 3D 角色与动作，最多 8 张卡并排比较。', 'Live 3D characters and actions, up to eight side by side.'], href: './?mode=showcase', match: params => mode(params) === 'showcase' && params.get('library') !== 'history' },
    ]],
  },
  {
    id: 'model-archive', label: ['模型档案', 'Model archive'], clusters: [[
      { id: 'history', label: ['历史模型', 'Historical models'], description: ['归档的旧模型与建模方法对照。', 'Archived models and modelling methods.'], href: './?mode=showcase&library=history', match: params => mode(params) === 'showcase' && params.get('library') === 'history' },
      { id: 'compare', label: ['画质对比', 'Visual comparison'], description: ['同一模型在不同贴图档位下的效果。', 'One model across texture quality tiers.'], href: './?mode=compare', match: params => mode(params) === 'compare' },
    ]],
  },
  {
    id: 'scenes', label: ['场景', 'Scenes'], clusters: [[
      { id: 'lab', label: ['场景', 'Scenes'], description: ['AI住宅、场景组合与四个机房，使用正式游戏视角游玩。', 'Playable residence, scene samples and four facilities.'], href: './?mode=lab&demo=residence', match: params => mode(params) === 'lab' || mode(params) === 'facility' },
    ]],
  },
  {
    id: 'perspectives', label: ['场景透视', 'Scene perspectives'], clusters: [[
      { id: 'perspective', label: ['场景透视', 'Scene perspectives'], description: ['房间、城镇、分层场景与真实游戏资源的透视检查。', 'Inspect rooms, settlements, depth layers and game resources.'], href: './?mode=resources&scene=room#room-slab-upper', match: params => mode(params) === 'resources' },
    ]],
  },
  // 基础概念与原画资料库各自是一级入口，单页大类不显示二级栏。
  {
    id: 'concepts', label: ['基础概念', 'Basic concepts'], clusters: [[
      { id: 'concepts', label: ['基础概念', 'Basic concepts'], description: ['世界、尺度、场景构件、植物与经济系统的定义文档。', 'Definitions for the world, scale, scenery, plants and economy.'], href: './?mode=concepts', match: params => mode(params) === 'concepts' },
    ]],
  },
  {
    id: 'art-library', label: ['原画资料库', 'Concept art library'], clusters: [[
      { id: 'art-library', label: ['原画资料库', 'Concept art library'], description: ['角色、敌人、装备、场景与分镜原画。', 'Character, enemy, equipment, scene and storyboard artwork.'], href: './?mode=catalog', match: params => mode(params) === 'catalog' },
    ]],
  },
  {
    id: 'sounds', label: ['声音', 'Sounds'], clusters: [[
      { id: 'sounds', label: ['声音目录', 'Sound library'], description: ['游戏音效逐项试听。', 'Browse and play every sound effect.'], href: './?mode=sounds', match: params => mode(params) === 'sounds' },
    ]],
  },
];

/** 当前地址所在的大类与页面；首页、帮助等不在两级导航里的页面返回 null。 */
export function findSitePage(params: URLSearchParams): { section: SiteSection; page: SitePage } | null {
  for (const section of SITE_SECTIONS) {
    for (const page of section.clusters.flat()) if (page.match(params)) return { section, page };
  }
  return null;
}
