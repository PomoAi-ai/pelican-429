/** Navigation only; all concept prose lives in public/concepts/*.md. */
export interface ConceptDocument {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly file: string;
}

export const CONCEPT_DOCUMENTS: readonly ConceptDocument[] = [
  {
    "id": "core-glossary",
    "title": "基础术语表",
    "group": "资源基础",
    "file": "core-glossary.md"
  },
  {
    "id": "resource-classification",
    "title": "资源分类与命名",
    "group": "资源基础",
    "file": "resource-classification.md"
  },
  {
    "id": "material-library",
    "title": "材料与构件库",
    "group": "资源基础",
    "file": "material-library.md"
  },
  {
    "id": "core-coordinates",
    "title": "坐标与尺度约定",
    "group": "资源基础",
    "file": "core-coordinates.md"
  },
  {
    "id": "concept-overview",
    "title": "世界设定与适用范围",
    "group": "基础设定",
    "file": "world-overview.md"
  },
  {
    "id": "concept-scale",
    "title": "角色标尺标准",
    "group": "基础设定",
    "file": "character-ruler-standard.md"
  },
  {
    "id": "concept-character",
    "title": "玩家角色、伙伴与人物比例",
    "group": "基础设定",
    "file": "character-proportions.md"
  },
  {
    "id": "concept-scene",
    "title": "场景由哪些部分组成",
    "group": "基础设定",
    "file": "scene-composition.md"
  },
  {
    "id": "concept-tiles",
    "title": "地形瓦片与组合",
    "group": "基础设定",
    "file": "terrain-combinations.md"
  },
  {
    "id": "concept-regions",
    "title": "自然区域与算力设施",
    "group": "基础设定",
    "file": "world-regions.md"
  },
  {
    "id": "concept-sources",
    "title": "原图与设定资料来源",
    "group": "基础设定",
    "file": "artwork-sources.md"
  },
  {
    "id": "building-depth",
    "title": "深度定义与线框透视说明",
    "group": "场景与建筑",
    "file": "depth-definitions.md"
  },
  {
    "id": "concept-liquids",
    "title": "液体定义与水体透视",
    "group": "场景与建筑",
    "file": "liquid-definitions.md"
  },
  {
    "id": "liquid-display",
    "title": "液体透视展示",
    "group": "场景与建筑",
    "file": "liquid-display-definitions.md"
  },
  {
    "id": "concept-building",
    "title": "建筑与格子定义 · 新规则",
    "group": "场景与建筑",
    "file": "building-overview.md"
  },
  {
    "id": "building-walls",
    "title": "背景墙形态与窗口定义",
    "group": "场景与建筑",
    "file": "wall-window-definitions.md"
  },
  {
    "id": "building-shapes",
    "title": "格子形态与支持范围定义",
    "group": "场景与建筑",
    "file": "tile-shape-definitions.md"
  },
  {
    "id": "building-joins",
    "title": "03 格子互相结合方式",
    "group": "场景与建筑",
    "file": "tile-connections.md"
  },
  {
    "id": "building-platforms",
    "title": "平台定义",
    "group": "场景与建筑",
    "file": "platform-definitions.md"
  },
  {
    "id": "building-house",
    "title": "单间房屋布置说明",
    "group": "场景与建筑",
    "file": "room-layout-definitions.md"
  },
  {
    "id": "building-door",
    "title": "门组件与深蓝合金能量门",
    "group": "场景与建筑",
    "file": "door-definitions.md"
  },
  {
    "id": "building-furniture",
    "title": "当前家具与设施定义",
    "group": "场景与建筑",
    "file": "furniture-definitions.md"
  },
  {
    "id": "building-legacy",
    "title": "旧实现与历史图对照",
    "group": "历史资料",
    "file": "building-legacy.md"
  },
  {
    "id": "natural-resources",
    "title": "植物、生长物与矿脉定义",
    "group": "自然资源",
    "file": "natural-resource-definitions.md"
  },
  {
    "id": "natural-space",
    "title": "自然资源：附着位置、前沿、树木占格与矿脉剖面",
    "group": "自然资源",
    "file": "natural-spatial-definitions.md"
  },
  {
    "id": "natural-grass",
    "title": "地被与草丛：整格覆盖与逐状态透视",
    "group": "自然资源",
    "file": "natural-grass-definitions.md"
  },
  {
    "id": "natural-flower",
    "title": "花卉与草本：各阶段独立定义与透视图",
    "group": "自然资源",
    "file": "natural-flower-definitions.md"
  },
  {
    "id": "natural-shrub",
    "title": "灌木与野果丛：各阶段独立定义与透视图",
    "group": "自然资源",
    "file": "natural-shrub-definitions.md"
  },
  {
    "id": "natural-bonsai",
    "title": "盆景与盆栽：各阶段独立定义与透视图",
    "group": "自然资源",
    "file": "natural-bonsai-definitions.md"
  },
  {
    "id": "natural-tree",
    "title": "树木：物种、冠团平台、空间与生长定义",
    "group": "自然资源",
    "file": "natural-tree-definitions.md"
  },
  {
    "id": "natural-vine",
    "title": "藤蔓与贴面植物：正面、背面和绕边透视",
    "group": "自然资源",
    "file": "natural-vine-definitions.md"
  },
  {
    "id": "natural-drooping",
    "title": "下垂植物：草裙、苔须、垂藤、垂花、悬崖盆景与垂枝树",
    "group": "自然资源",
    "file": "natural-drooping-definitions.md"
  },
  {
    "id": "natural-rock",
    "title": "岩土地形组合与岩石占格定义",
    "group": "自然资源",
    "file": "natural-rock-definitions.md"
  },
  {
    "id": "natural-ore",
    "title": "矿脉：各阶段独立定义与透视图",
    "group": "自然资源",
    "file": "natural-ore-definitions.md"
  },
  {
    "id": "concept-economy",
    "title": "经济与生存系统设计",
    "group": "系统设定",
    "file": "economy.md"
  }
];
