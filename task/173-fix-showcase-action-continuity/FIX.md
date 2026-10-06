# FIX — 当前场景内切换动作

## Status: done
## Task: 173
## Related: 149, 162
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
点击动作时重新缩放镜头、排列角色，像是在切换演示场景。应在当前草地里直接播放动作。

## Root Cause
character-stage-app.ts 的布局标识包含动作与revision，取景宽高来自每个动作的scenario；切换前就释放旧实例。stage-actor.ts 又按单动作的focus中心偏移角色，攻击和待机中心不同。

## Fix Plan
- [x] 动作加载完成前保留旧角色，替换时保留位置和初次入场的取景范围。
- [x] 只有添加/移除、缩放和窗口尺寸变化时重新排布镜头；动作、重播和朝向不触发布局。
- [x] 用角色本体的位置对齐共享场景，取消动作取景中心造成的跳位。
- [x] 浏览器检查待机/走跑/攻击切换时草地、其他角色和镜头稳定。
- [x] 隐藏动作模拟附带的假人与对手；NPC只隐藏靶子节点，保留技能特效。

## Verification
- [x] npm run typecheck：最终代码通过。
- [x] npm test -- --test-concurrency=2：1698/1698通过；最后的渲染显隐修改发生在测试运行期间，由最终类型检查、构建与浏览器覆盖。
- [x] npm run build -- --outDir /tmp/pelican-showcase-continuity-build：最终代码通过。
- [x] 浏览器验收与diff-guard：待机、跑步、Codex攻击前后两个角色控制位置均为(454.375,378.25)、(970,398.875)；快速切换正常，无控制台错误。子代理审查未发现阻断问题。
- [x] 本次文件diff --check通过；全仓检查发现其他任务prompts.md既有行尾空白，未改动。
- [x] Bug is fixed

## Decisions
- 使用fix/core-dev/core-test与Ponytail Full；沿用游戏动作和模拟，不复制动画，不新增UI自动测试。
- 保留已有草地和空白小角度操作；只修动作切换导致的场景变化。
- 子代理只读检查根因与方案；不改其他任务的模型、动作、世界逻辑，不提交推送。
