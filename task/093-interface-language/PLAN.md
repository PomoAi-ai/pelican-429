# PLAN -- 界面中英文

## Status: blocked
## Task: 093
## Related: N/A
## Baseline Commit: N/A（仓库尚无提交）

## Goal
整个界面可在中文和英文之间切换，并记住语言选择。

## Non-goals
不翻译代码注释、资源文件名和游戏世界中的装饰性文字。

## Acceptance Criteria
- 首页和全局导航有语言切换入口。
- 序章、游戏 HUD 与设置、展示场与资源控制等界面随语言显示。
- 刷新及页面跳转后保留语言。

## Constraints
- 不增加运行时依赖；不改变模拟逻辑。
- 遵循本仓库的验证与测试规则。

## Decisions
- 共用一个持久化语言状态；保留现有的序章语言按钮。
- 已有配置数据不依赖 UI 语言模块，翻译只在显示层处理。
- 英文首页、游戏设置与 HUD、角色展示场已在浏览器检查。资源场复验期间，仓库中与本任务无关的 `src/render/npc/npc-effects.ts` 消失，导致后续类型检查和构建失败；不在本任务内修改 NPC 实现。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 曾通过；当前缺 `npc-effects.ts` |
| npm test | yes | 1535/1535 通过 |
| npm run build | yes | 曾通过；当前缺 `npc-effects.ts` |
