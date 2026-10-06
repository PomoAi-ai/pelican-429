# PLAN -- 自由世界

## Status: done
## Task: 145
## Related: N/A
## Baseline Commit: e5fb3bf

## Goal
将现有演示改为自由世界，提供丰富的随机区域、机房探索、Sam/Tibo 友好 NPC 随机变形，以及种子和 GM 工具条。

## Non-goals
不修改主线 Boss，不复制机房资源，不提交或推送，不覆盖工作区已有改动。

## Acceptance Criteria
- 导航与页面标题显示自由世界。
- 同种子可重现野外及 NPC，区域目录覆盖森林、湖泊、沙漠、洞穴、浮岛和三种机房，可返回同种子野外。
- Sam/Tibo 为非敌对 NPC，可随机变形。
- 工具条可输入/随机种子并选择 GM；关闭 GM 不残留调试能力。
- typecheck、全量测试、build 通过。

## Constraints
复用游戏/展示场资源，逻辑层只用 core/rng；不新增依赖或 CI 测试。工作区大量已有修改，按任务开始的文件快照隔离本次 diff。

## Decisions
- 机房采用区域切换，复用 createFacilityLevel/createFacilityPresentation，保留种子与 GM。
- 丰富区域沿用既有地形生成，提供直接可发现的区域目录。
- NPC 使用独立友好组件，不复用 Boss 战斗组件。
- Sam 使用自身人形与怪物形态；Tibo 暂时复用 Grassy 人形，已明确说明临时资源方案。
- 无需审批的可逆仓库内修改，设计完成后直接实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/free-world-regions.ts | 按真实地形生成区域目的地 | — | yes |
| 2 | src/entities/wanderer.ts、src/sim/free-world-npcs.ts、entity.ts、sim-world.ts | 友好 NPC 巡游、招呼与随机变形 | — | yes |
| 3 | src/render/npc/wanderer-view.ts、src/app/scene-wiring.ts | 共享模型动画、形态切换和名牌 | 2 | yes |
| 4 | src/ui/free-world-toolbar.ts、free-world.css | 种子/区域/GM 控制和布局 | 1 | yes |
| 5 | src/app/free-world-navigation.ts、game-app.ts、main.ts | 装配、机房往返与区域相机 | 1,2,3,4 | yes |
| 6 | src/app/settings-wiring.ts、src/ui/settings-panel.ts、src/config/game-settings.ts | GM 边界与新世界清理旧目的地 | 5 | yes |
| 7 | index.html、src/ui/dom-language.ts、facility-chapter-hud.ts | 自由世界导航与机房链接保留上下文 | 5 | yes |
| 8 | test/free-world.test.ts、free-world-npcs.test.ts、settings.test.ts | 确定性、区域落点、NPC 行为、种子跳转 | 1,2,5,6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes；相机修正后再次通过 |
| npm test | yes | yes；1635/1636 首轮通过，唯一失败文件在工作区并发更新后重跑 15/15 通过 |
| npm run build | yes | yes；仅大 chunk 提示 |

## Review
- 子代理按 core-review / diff-guard 审查通过；修正区域相机应 snapTo 而非 skipIntro。
- 临时检查种子 1–30 的 822 个区域落点均可容纳玩家，NPC 均可初始化。
- 浏览器已验证野外画面、机房进入/返回、GM 设置开启/关闭与随机世界按钮。
- UI/渲染未增加自动测试；复用现有 caption 添加 NPC 名牌。

## Validation Results
- `node --test test/free-world-npcs.test.ts`：2/2 通过。
- `node --test test/free-world.test.ts`：2/2 通过。
- `npm test`：1636 项、1635 通过、1 失败。失败为 facility-level 雨棚用例；该测试在全量开始后被本任务之外的工作区改动加入 enemies: [] 隔离巡逻守卫。
- `node --test test/facility-level.test.ts`：针对当前文件重跑 15/15 通过；本任务未改该文件，不重复全量。
- `npm run typecheck` 和 `npm run build`：最终通过。
- `git diff --check`：任务涉及源码及测试通过。
- 浏览器实测随机世界生成种子 392740869；机房往返保留 seed/GM；截图 evidence/free-world.jpg。
- 未新增 CI 命令、依赖、模型副本；未提交或推送。
