# PLAN -- 可躲避的模型路由导弹

## Status: done
## Task: 112
## Related: 105, 110-fix-tibo-lunch-line
## Baseline Commit: 无 HEAD；本轮涉及文件快照在 $TMPDIR/routing-missile-baseline

## Goal
Sam 头顶显示「牛逼模型」及 GPT-6 Astra；路由成 GPT-5.6 Luna / GPT-4o mini 导弹，命中目标才出现「垃圾模型击中目标」。导弹固定方向飞行，目标能够跳跃躲避。

## Non-goals
不扩展 NPC AI 或接入玩家战斗伤害，不改 Tibo 及其他技能。

## Acceptance Criteria
- 头顶聚能、导弹飞行、命中文字时序清楚，导弹具备弹头、尾翼与尾焰。
- 固定弹道不跟踪；碰撞命中才有爆点、闪白与文字，躲开则从原位置飞过。
- 展示场可切换目标躲避，左右朝向、暂停、重播与切换技能正确。
- 相关纯逻辑测试、类型检查、全量测试与构建通过，并浏览器验收。

## Constraints
复用共享假人、粒子、模型与场景；无新依赖；不修改 vendor、生成资源与其他会话的工作。

## Decisions
- explorer 子代理确认旧弹道逐帧追踪且命中由时间触发；改为共享 combat 纯逻辑计算固定弹道与首个实际碰撞。
- 两靶同一直线上必须按距离拦截；躲避开关控制近靶跳跃，后靶保留对照。
- 纯逻辑预计算确定时间轴，展示按绝对时间取样，支持任意暂停/回放；不接入完整 NPC AI。
- 技能演示延长到 3.4 秒；骨骼末帧停留，特效时间独立继续。
- 已有探索覆盖渲染流程；本轮子代理完成差异探索及设计，直接按明确需求实施，无审批停止条件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/combat/model-routing.ts, test/model-routing.test.ts | 固定导弹与碰撞、躲避的确定性逻辑和行为验证 | yes |
| src/render/npc/npc-targets.ts | 导弹外形、命中与躲避效果 | yes |
| src/config/showcase.ts, src/ui/showcase-model.ts, src/ui/showcase-panel.ts | 目标躲避控制与状态 | yes |
| src/app/showcase/npc-session.ts, src/render/npc/npc-animator.ts | 演示时长与躲避传递 | yes |
| src/render/npc/npc-effects.ts, src/config/npc.ts, src/ui/showcase-language.ts | 牛逼模型聚能字幕和说明 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/model-routing.test.ts | yes | yes, 5/5 |
| npm run typecheck | yes | yes，重构完成后通过 |
| npm test | yes | yes，全量1516/1519；三个受并发工作影响的失败文件随后复查全部通过，见下文 |
| npm run build | yes | yes，6.30s，仅构建耗时提示与已有chunk大小提示 |
| 浏览器检查命中/躲避/朝向/重播及控制台 | yes | yes，完整应用5186预览通过，console warn/error为空；证据见evidence/ |
| 子代理代码审查及 diff-guard | yes | yes，修正末弹与靶子过早落地的碰撞后通过 |

首次整体验证遇到并发重构窗口：typecheck/build 缺少 createMaintenanceBotEntity 导出；全量 1516/1519，通过本轮5个新用例，但架构临时缺 player-view 文件、showcase 缺维修机器人导出、worldgen 耗时门槛失败。保留其他工作，待文件稳定仅复查受影响项目：node --test test/architecture.test.ts test/worldgen.test.ts 50/50，通过；node --test test/showcase.test.ts 25/25，通过。未改失败断言，也没有重跑已通过的全量。

截图：hit-and-dodge.png 为同向命中与跳跃对照；in-flight.png 确认命中前没有受击文字；left.png 为左右镜像；ended.png 确认结束清理；switch-skill.png 确认切换无残留。
