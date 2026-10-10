# PLAN -- 薄门与背景墙的房间场景预览

## Status: done
## Task: 353
## Related: 352
## Baseline Commit: 975f136

## Goal
把房间概念落实为本地可旋转的场景，直接查看主角、地形、背景墙与薄门之间的空间关系。

## Non-goals
不新增建造玩法、碰撞通行或保存功能，不修改既有构件尺寸。

## Acceptance Criteria
- 复用共享地形、建筑构件与 D1 角色资源，组装完整剖面房间及室外草地。
- 可切换横版、斜侧与俯视，开关能量屏障。
- 从资源页与概念页进入；浏览器能直接看到结果。

## Constraints
紧凑工具条，场景占主要空间；场景只负责实例摆放、镜头与检查控制；角色保持真实尺寸。

## Decisions
- 探索子代理确认共享 createStage/createTileView/createBuildingKit/createD1Rig 可直接复用。
- 使用 resources&scene=room 入口，避免扩展关卡/卡片协议；无需新增独立构建入口。
- 设计与探索一起完成，无需批准的不可逆动作或实质方案分歧。
- 已知净高不足保留真实比例显示，本预览不提供穿门动作。
- 渲染/UI 按仓库约定用浏览器验收，不新增锁死网格结构的测试。
- 组装审查发现室内地板叠在草砖内，改用共享木料瓦片作为地板，移除重叠建筑块。
- 侧墙和屋顶后沿对齐后墙内面，消除后侧接缝；前沿保留剖面，页面明确标注。
- 审查子代理复核两项修正通过，无剩余可信问题；浏览器三种视角、门开闭、格子显示均已验收，控制台无错误。
- 全量测试唯一失败为相对导入契约禁止从 TypeScript 引入 CSS；改为 index.html 的 stylesheet 链接，与既有页面一致。修正后受影响架构测试 21 项通过，类型检查与构建再次通过。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/app/room-scene-preview.ts | 共享场景组装及交互 | yes |
| src/ui/room-scene-preview.css | 紧凑布局 | yes |
| src/app/showcase-app.ts | 本地场景入口 | yes |
| src/ui/showcase-panel.ts | 资源页链接 | yes |
| src/ui/site-pages.ts | 概念页链接 | yes |
| index.html | 按既有方式加载场景样式 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | 全量 1841/1842；唯一失败已修正，架构测试重跑 21/21 通过 |
| npm run build | yes | yes |
| 浏览器检查场景、镜头、门开关 | yes | yes |
