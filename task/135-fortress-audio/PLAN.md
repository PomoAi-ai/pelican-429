# PLAN -- 机房堡垒音乐与音效

## Status: exploring
## Task: 135
## Related: N/A
## Baseline Commit: 无（当前仓库尚无 HEAD，文件均未跟踪；修改前文件备份于 $TMPDIR/pelican-audio-baseline）

## Goal
实现已确认的机房堡垒声音方案：108 BPM D 小调分层背景音乐、机房环境声、鹈鹕与人形技能、机械敌人及移动/受击动作音，提供声音控制与浏览器交互解锁。

## Non-goals
不改过场序章配乐、vendor 模型、战斗规则；不提交或推送，不增加依赖。

## Acceptance Criteria
- 堡垒关卡可听到探索/战斗配乐与空间环境声，技能和动作即时响应。
- 暂停、隐藏页面、关闭声音与页面退出正确停止声音，恢复无事件补播。
- 同一音色实现可复用，展示场不另复制一套合成器。
- 本地 typecheck、全量测试和 build 通过；浏览器验收交互与生命周期。

## Constraints
遵守分层、fail-fast、只在边界校验和项目测试范围；原生 Web Audio 合成，无外部服务。

## Decisions
- 按既定声音方案自主实现，无需进一步产品裁决。
- 仓库无提交基线，使用修改前备份核对已有文件，新增文件单独审查。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
| 浏览器交互及音频生命周期检查 | yes | no |
