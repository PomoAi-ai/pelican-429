# PLAN -- 第一章维修机

## Status: blocked
## Task: 102
## Related: N/A
## Baseline Commit: N/A（仓库尚无 HEAD）

## Goal
制作第一章入口维修机，游戏与展示场复用同一角色模型。

## Non-goals
其他小怪、概念图、关卡全面战斗编排。

## Acceptance Criteria
- 独立实体，可受击且死亡后永久移除。
- 第一章入口有实际主动威胁，复用现有可吞敌弹。
- 悬浮安防无人机：冷白流线装甲、深石墨材质、青蓝传感器灯带、背部冷却格栅；展示场复用游戏模型。

## Constraints
遵守 AGENTS.md；不提交推送；不在 CI 加测试。

## Decisions
- 入口小怪复用现有 shooter，缩小新逻辑与配置范围；悬停于入口后 x=66、y=23，不阻塞断崖跳跃。
- 关卡位置字段可选，以免修改其他关卡数据。
- typecheck 被 Grassy 动画文件两处及 human-session.ts 第 129–140 行的 16 处无关类型错误阻断；这些文件不在本任务改动范围内。本任务改动无新增类型错误。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no（Grassy 两处、human-session.ts 16 处无关错误） |
| npm test | yes | yes（1528/1528） |
| npm run build | yes | yes |
