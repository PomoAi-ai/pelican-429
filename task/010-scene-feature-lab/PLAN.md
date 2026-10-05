# PLAN — 场景功能展示与完整资源目录

## Status: done
## Task: 010
## Related: 006、009
## Current Phase: 7
## Baseline Commit: 无 HEAD（仓库文件均未跟踪）

## Goal
按用户已确认的独立功能展示方向，直接展示游戏内容、复用正式生成和渲染模块，完整枚举实际变体。

## Acceptance Criteria
- 开发导航和首页有独立场景功能展示入口；复用现有卡片、调度与游戏视图。
- 完整列出各资源类型；8 张仅为同时预览上限，按批次可以看完所有变体。
- 地形展示完整瓦片注册表及四种形状；空气、树枝平台和屋顶说明实际渲染归属。
- 功能页演示瓦片组合、材质邻接、植被分层，使用同一份 tile-view。
- 树木、灌木、花草、地被、岩石、沙漠、洞穴、水体与水生植物直接取游戏导出清单。

## Constraints
中文；不跨会话；用户最新规则允许当前任务内子代理，使用一次聚焦只读审查；不修改 vendor；不新增 UI/网格实现细节测试；不提交。

## Decisions
- 用户要求先给计划后暂停；2026-10-04 用户回复“开始”，批准六阶段实施计划和四组功能展示。
- 复用已有探索与展示框架；在当前会话完成设计和实现（用户禁止跨会话协作）。
- 目录枚举游戏常量，中文标签用完整类型约束；不维护手选资源子集。
- 展示页负责摆放与参数，模型、材质、层次和动画来自正式模块。
- 功能演示采用组合预设和真实形状切换；本轮不扩展成地图编辑器。
- 不另做模拟图片/示意渲染；类别缩略图沿用已有游戏截图。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/resource-catalog.ts | 游戏清单完整枚举和实验目录 | — | yes |
| 2 | src/ui/showcase-model.ts、showcase-panel.ts | 批次预览、完整目录操作 | 1 | yes |
| 3 | src/config/resource-showcase.ts、src/ui/resource-controls.ts | 组合/形状/层次控制 | — | yes |
| 4 | src/app/showcase/resource-scenario.ts | 实际瓦片组合与资源场地 | 3 | yes |
| 5 | src/render/resource-preview.ts、tile-view.ts | 共用渲染和植被层显隐 | 1,3 | yes |
| 6 | src/main.ts、src/config/showcase.ts、src/app/showcase-app.ts、index.html | 独立开发入口 | 1 | yes |
| 7 | test/showcase.test.ts | 批次遍历、形状场地行为 | 2,4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器人工检查批次、组合、层次 | yes | yes |

## Log
- 2026-10-04 discover/explore/clarify/design：复用现有框架；核对正式导出清单，树木实际 9 种，原目录漏项。
- 2026-10-04 implement：开始共用模块与完整展示功能。

- 2026-10-04 用户批准后继续：补独立功能目录、环境组合；上一轮全量 1463 项有 2 项分层失败，修正依赖，不改架构测试。

- 2026-10-04 validate：完整测试 1464/1464 通过；类型检查通过；独立审查发现洞穴组合选择误导和树枝碰撞缺失，均修复，复审 Approved。新增碰撞回归先红后绿，受影响测试与架构检查 35/35 通过。
- 2026-10-04 范围决策：本次完整枚举 11 类基础资源、142 个目录项目；其余浮空岛/天气/降水/沙尘模块已在 README 记录正式入口与未纳入单件目录的状态。
- 2026-10-04 浏览器：已检查批次 8+1、真实形状、植被分层、岸边/沙漠/洞穴/渔屋组合、水生纯资源；新增 3 张分类缩略图来自真实预览。最终类型检查、构建通过；浏览器确认洞穴组合变体按钮隐藏且无控制台错误。

- 2026-10-04 wrap-up：完成。最终构建保留既有大包提示（JS 约 1.71 MB）；未提交或推送。全部文件未跟踪、无 HEAD，按本任务修改文件列表核对范围，未变更 vendor。截图 scene-feature-lab.jpg 已保存，开发页保持打开。
