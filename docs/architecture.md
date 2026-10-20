# 架构原则

本页记录代码结构的原则与理由。坐标、深度、形态、景别、术语与角色尺寸以标准文档为准，本页只引用、不重定义：[core-coordinates](../public/concepts/core-coordinates.md)、[depth-definitions](../public/concepts/depth-definitions.md)、[tile-shape-definitions](../public/concepts/tile-shape-definitions.md)、[tile-connections](../public/concepts/tile-connections.md)、[resource-classification](../public/concepts/resource-classification.md)、[material-library](../public/concepts/material-library.md)、[scene-composition](../public/concepts/scene-composition.md)、[core-glossary](../public/concepts/core-glossary.md)、[character-ruler-standard](../public/concepts/character-ruler-standard.md)。

## 1. 一个游戏，一个实现

- 3D 渲染、2D 横版视角：移动、占格、碰撞只在玩法平面计算，Z 只用于表现（core-coordinates §1）。
- 城区、原野、交通中心、机房章节、Boss 场、家园、主线、测试关都是同一实现的世界数据，由游戏网址解析选出。不存在第二个游戏帧循环、游戏相机或游戏 HUD 装配。理由：两套装配会在手感、光照、存档上各自漂移，修复只落在其中一边。
- 特别入口只用网址参数组合，非法值或非法组合在网址边界抛错。解析在 `config/app-mode.ts`（页面与通用参数）、`app/game/game-level.ts`（世界）、`app/city/city-launch.ts`（城区入口与直接发射）和 `app/game/game-app.ts`（其余开关）：

  | 参数 | 取值 | 作用 |
  | --- | --- | --- |
  | `mode` | `game`、`homestead`、`story`、`controls` 等 | 选页面；不带 `mode` 但带 `level` 或 `seed` 时按 `game` |
  | `level` | `test`、`composition`、`facility`、`boss-arena` | 选世界；`mode=game` 不带 `level` 是主世界城区。`composition` 另需 `composition`，可带 `material`、`environment` |
  | `free=1` | — | 主世界原野，不能与 `level` 同用 |
  | `scene` | 机房章节；原野区域；`mode=homestead` 下的 `residence` | 机房章节、原野出生区域（也可写 `region`），或家园页的原版住宅城区 |
  | `seed`、`size`、`gm` | 种子；`small`/`medium`/`large`；`0`/`1` | 主世界的种子、规模与 GM，城区与原野之间往返时保留 |
  | `inspect` | 地形组合的起点 x | 原野出生在该地形定位点 |
  | `from` | `wilds`、`transit` | 城区入口：右端或交通中心街面 |
  | `flight` | 交通中心目的地 | 城区交通中心跳过登舱直接发射 |
  | `landing=1` | — | 机房关卡与城区以着陆舱开场，用后从网址去掉 |
  | `renderer` | `webgl`、`webgpu` | 渲染后端 |
  | `bench` | 基准场景 | 原野性能基准，只能配 `mode=game&free=1` |
  | `cam=free` | — | 开发用自由镜头与预设视角，发布版拒绝 |
  | `debug`、`textures` | `debug` 不带值；`textures` 为贴图档位 | 各页通用的调试开关与角色贴图档位 |

  已移除的旧入口（`mode=facility`、`mode=transit`、`mode=residence`）在边界报错并给出新网址。
- 表现有分歧时以正式游戏为默认；演示或工作区独有的功能改为网址参数或开发开关，不另建装配。

## 2. 世界数据

- 玩耍层是标准格子模型：一个逻辑格可放多块互不重叠的构件。形态与同格组合见 tile-shape-definitions，相邻连接见 tile-connections，各材料支持的形态见 material-library。
- 世界分四层，都挂在 `TileMap` 上：
  - 格块层（`world/tile-map.ts`）：地形与建筑实体块，33 种形态，同格可放多块；平台是独立的块类型，六种变体。
  - 背景墙层（`world/building-layers.ts`）：贴在格子背面，与加深格互斥。
  - 摆放物件层（同上）：家具承托面、光源等按半格对齐摆放的物件。
  - 特殊构件层（`world/special-parts.ts` 的 `SpecialParts`）：门、太阳能板、舰体、电梯、甲板等自带碰撞、状态按 tick 推进的构件。
- 城区与交通中心不是另一套运行时，而是格子世界里的块、墙、物件与特殊构件（`sim/building.ts`、`sim/city.ts`、`sim/transit.ts`）。
- 碰撞几何用块的精确多边形（`world/collision-geometry.ts` 收集，`physics/tile-collision.ts` 求解，只此一个求解器）；派生的 1/4 子格掩码是碰撞粗筛、光照、流体、视线、小地图共用的最小单位。流体以子格为存储与流动单位（`world/fluid-map.ts`），光场以子格为单位按区块增量重算并分摊到多帧（`world/light-field.ts`）。理由：精确多边形保证坡面、台阶与下穿手感，共用栅格让各系统对“哪里是实心”给出同一答案。
- 背景格子、远景与前景格子只显示、不参与碰撞。层距默认用 depth-definitions 的方案 G，每个世界可给自己的层距表（`config/depth-layers.ts`，背景层由 `render/backdrop/` 按层表摆放）。近景（比建设层更靠近镜头的前景格子层）在所有世界都做模糊，参数按 depth-definitions 执行，WebGL 与 WebGPU 两种后端都要实现，保证同一画面不因后端而变。

## 3. 分层与确定性

- 依赖方向见 AGENTS.md“目录与分层”，由 `test/architecture.test.ts` 强制执行。
- 会改变碰撞的状态（门、太阳能板转角、电梯、交通阶段、建造）只在 `stepSim` 内按 tick 改变；表现层只发命令。理由：同一种子加同一输入序列必须得到同一世界，按渲染帧修改会随帧率变化。
- 世界专属功能挂到 game-app，不复制游戏装配。城区表现、城区建造与交通中心实现为 `GameFeature`（`app/game/frame-loop.ts`）：每帧在视图同步之后调用，`paused` 为真时模拟不步进；家园与开发镜头也由 game-app 按网址挂载。

## 4. 渲染

- 只有一个渲染器工厂（`render/stage/stage.ts`）和一个舞台，按用途选预设（游戏、摄影棚、缩略图）。页主渲染器绑定角色贴图，次级渲染器不绑定。理由：贴图绑定与色调映射挂在全局时，次级渲染器会改掉主画面的设置。
- 唯一例外是返程穿梭层：使用独立上下文，配置仍走工厂。
- 昼夜一套，天气一套（以模拟环境为唯一来源），局部光一套（1/4 光场），后期合成器一份。帧循环只有两种：游戏帧循环（app/game/frame-loop.ts）与非游戏页视图循环（app/shell/view-loop.ts）。
- 非游戏页（家具展示、人物演练场、头发预览、渲染实验、场景透视）只换镜头、灯光预设与面板，复用游戏的模型、材质、生成函数与模拟，页内走动的角色跑同一个模拟。不得复制尺寸规则或第二套物理，细则见 AGENTS.md“展示场与资源复用”。

## 5. 入口与页面登记

- 只有 `index.html` 一个 HTML 入口，页面由 `mode` 参数选择。
- `config/app-mode.ts` 的 `pageRoute` 把网址映射到页面，`app/shell/routes.ts` 按需加载各页的 `mountX(ctx)`。
- 所有页面登记在 `config/site-directory.ts`（`SITE_SECTIONS`），顶栏、二级栏与工作区侧栏（`SitePage.entries`）都由它生成，发布版经 `siteSections(release)` 过滤。理由：两份列表迟早漏登记。

## 6. 存档

- 存档在读取边界校验一次。格式不兼容时明确报错，或提示后丢弃；不静默降级，不做迁移。理由：迁移分支会一直留在加载路径上，而旧格式没有需要保留的外部玩家数据。
