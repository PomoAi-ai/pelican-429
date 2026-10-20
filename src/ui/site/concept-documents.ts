/** Navigation only; all concept prose lives in public/concepts/<id>.md. */
export interface ConceptDocument {
  readonly id: string;
  readonly title: string;
  readonly group: string;
}

export const CONCEPT_DOCUMENTS: readonly ConceptDocument[] = [
  {
    "id": "core-glossary",
    "title": "基础术语表",
    "group": "资源基础"
  },
  {
    "id": "resource-classification",
    "title": "资源分类与命名",
    "group": "资源基础"
  },
  {
    "id": "core-coordinates",
    "title": "坐标与尺度约定",
    "group": "资源基础"
  },
  {
    "id": "material-library",
    "title": "材料与构件库",
    "group": "材料与构件库"
  },
  {
    "id": "world-overview",
    "title": "世界设定与适用范围",
    "group": "基础设定"
  },
  {
    "id": "character-ruler-standard",
    "title": "角色标尺标准",
    "group": "基础设定"
  },
  {
    "id": "character-proportions",
    "title": "玩家角色、伙伴与人物比例",
    "group": "基础设定"
  },
  {
    "id": "scene-composition",
    "title": "场景由哪些部分组成",
    "group": "基础设定"
  },
  {
    "id": "world-time",
    "title": "时间、历法与日月",
    "group": "基础设定"
  },
  {
    "id": "terrain-combinations",
    "title": "地形瓦片与组合",
    "group": "基础设定"
  },
  {
    "id": "world-regions",
    "title": "自然区域与算力设施",
    "group": "基础设定"
  },
  {
    "id": "artwork-sources",
    "title": "原图与设定资料来源",
    "group": "基础设定"
  },
  {
    "id": "depth-definitions",
    "title": "深度定义与线框透视说明",
    "group": "场景与建筑"
  },
  {
    "id": "liquid-definitions",
    "title": "液体定义与水体透视",
    "group": "场景与建筑"
  },
  {
    "id": "liquid-display-definitions",
    "title": "液体透视展示",
    "group": "场景与建筑"
  },
  {
    "id": "building-overview",
    "title": "建筑与格子定义 · 新规则",
    "group": "场景与建筑"
  },
  {
    "id": "wall-window-definitions",
    "title": "背景墙形态与窗口定义",
    "group": "场景与建筑"
  },
  {
    "id": "tile-shape-definitions",
    "title": "格子形态与支持范围定义",
    "group": "场景与建筑"
  },
  {
    "id": "tile-connections",
    "title": "03 格子互相结合方式",
    "group": "场景与建筑"
  },
  {
    "id": "platform-definitions",
    "title": "平台定义",
    "group": "场景与建筑"
  },
  {
    "id": "room-layout-definitions",
    "title": "单间房屋布置说明",
    "group": "场景与建筑"
  },
  {
    "id": "door-definitions",
    "title": "门组件与深蓝合金能量门",
    "group": "场景与建筑"
  },
  {
    "id": "furniture-definitions",
    "title": "当前家具与设施定义",
    "group": "场景与建筑"
  },
  {
    "id": "building-legacy",
    "title": "旧实现与历史图对照",
    "group": "历史资料"
  },
  {
    "id": "natural-resource-definitions",
    "title": "植物、生长物与矿脉定义",
    "group": "自然资源"
  },
  {
    "id": "natural-spatial-definitions",
    "title": "自然资源：附着位置、前沿、树木占格与矿脉剖面",
    "group": "自然资源"
  },
  {
    "id": "natural-grass-definitions",
    "title": "地被与草丛：整格覆盖与逐状态透视",
    "group": "自然资源"
  },
  {
    "id": "natural-flower-definitions",
    "title": "花卉与草本：各阶段独立定义与透视图",
    "group": "自然资源"
  },
  {
    "id": "natural-shrub-definitions",
    "title": "灌木与野果丛：各阶段独立定义与透视图",
    "group": "自然资源"
  },
  {
    "id": "natural-bonsai-definitions",
    "title": "盆景与盆栽：各阶段独立定义与透视图",
    "group": "自然资源"
  },
  {
    "id": "natural-tree-definitions",
    "title": "树木：物种、冠团平台、空间与生长定义",
    "group": "自然资源"
  },
  {
    "id": "natural-vine-definitions",
    "title": "藤蔓与贴面植物：正面、背面和绕边透视",
    "group": "自然资源"
  },
  {
    "id": "natural-drooping-definitions",
    "title": "下垂植物：草裙、苔须、垂藤、垂花、悬崖盆景与垂枝树",
    "group": "自然资源"
  },
  {
    "id": "natural-rock-definitions",
    "title": "岩土地形组合与岩石占格定义",
    "group": "自然资源"
  },
  {
    "id": "natural-ore-definitions",
    "title": "矿脉：各阶段独立定义与透视图",
    "group": "自然资源"
  },
  {
    "id": "economy",
    "title": "经济与生存系统设计",
    "group": "系统设定"
  },
  {
    "id": "ui-controls",
    "title": "界面与操作",
    "group": "系统设定"
  },
  {
    "id": "chapter-1",
    "title": "第一章 · 拯救 GPT-6 Astra",
    "group": "剧情设计"
  }
];
