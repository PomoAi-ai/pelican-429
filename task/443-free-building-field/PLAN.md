# PLAN -- 自由搭建场与材质形状目录

## Status: done
## Task: 443
## Related: 434, 438
## Baseline Commit: 64ef4a38

## Goal
新增无玩家自由搭建场，支持天气、时间、选择材质和建筑构件点击铺设、清理刷、一键清理、拖动缩放和视角调整。瓦片与形状改为按材质查看全部形状与组合。

## Non-goals
不改住宅存档，不添加角色、战斗或联网，不新增资源模型。

## Acceptance Criteria
- 两个入口直接进入场景，保留顶部导航与世界天气控制。
- 自由场地没有玩家，铺设遵循真实占格、深度与背景墙互斥规则。
- 可选资源/形状、铺设、清理与清空；镜头可平移、缩放、调整视角。
- 瓦片与形状按材质检查全部已有形状和拼接组合。

## Constraints
复用游戏共享模型/配置，保留工作区已有改动。只执行本地测试，不提交推送。

## Decisions
- 独立自由场地状态，避免修改已有住宅。
- 已读取原有住宅搭建、工作区目录与加载生命周期；并行探索场地与材质目录，给出文件级方案后实现。

- 探索与架构已完成：独立无玩家共享舞台，避免给现有游玩舞台加入条件分支；现有天气、时钟、光照直接复用。
- 建筑形状开放共享表全部33种，自然材质保持游戏已有4种。11组建筑拼接提取成共享配置。
- 放置仍使用住宅共享校验与模型，无角色身体校验；自由场地独立会话状态，刷新重置。
- 无需额外确认：均为可回退的本地功能改动，未涉及存档迁移或外部副作用。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/building-field-stage.ts | 无玩家时间天气自由镜头舞台 | — | yes |
| 2 | src/app/building-sandbox.ts | 空白场地资源铺设与清理交互 | 1 | yes |
| 3 | src/app/tile-material-gallery.ts | 按材质展示真实形状与拼接 | 1 | yes |
| 4 | src/config/definition-kit.ts / src/app/definition-scene-layout.ts | 共享拼接配置 | — | yes |
| 5 | src/config/residence.ts | 开放全部建筑形状 | — | yes |
| 6 | src/app/scene-catalog.ts / src/app/scene-workspace.ts | 平铺入口分发 | 2,3 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器铺设、清理、镜头、天气时间和切换 | yes | yes |

## Final validation
- npm run typecheck：通过。
- npm test：1934项，1933通过，1项架构检查因app直接import CSS失败；改为src/ui CSS由index.html统一引入后，node --test test/architecture.test.ts test/building-brush.test.ts 25项全部通过。未修改测试断言。
- npm run build：通过；现有大chunk提示保留。
- 浏览器：验证铺设1件→换材质仍1件→拖刷6件→清空0件→撤销6件→3格刷清理剩2件；正斜俯视、缩放、右键平移、星夜、暴雨、天气分类、页面切换和自然/建筑材质深度切换均已检查。
- 子代理复核：网格与拾取平面统一；越界输入在笔画插值前中断；资源与resize生命周期复核通过。
- 自由场地64×36格、99种建筑构件；陶瓷/合金各33种。自然6种材质目前用于画廊检查，自由场开放住宅共享建筑资源。
- 状态仅当前页面会话保留，刷新清空；无存档迁移、提交或推送。
