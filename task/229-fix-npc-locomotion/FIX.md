# FIX -- NPC 实际速度驱动步态

## Status: done
## Task: 229
## Related: 227
## Baseline Commit: 8a8fe8c

## Problem
继续优化 Sam/Tibo 跑步与起停的自然程度。

## Root Cause
Boss 动作意图与实际 vx 脱节，墙前或减速归零仍播放完整跑步；动画直接使用会被技能重置的 actionTicks，重启时落脚相位突变；Boss 未传 idleFacing，停跑后会转向镜头。

## Fix Plan
- [x] 实际地面移动按速度选择待机/走/跑，归零后停止迈步。
- [x] 每个共享 rig 累积连续步相；移动加减速只调节步相推进，不提高满速频率。
- [x] Boss 待机继续朝向目标；技能和飞行独立于地面步态。

## Decisions
子代理独立探索确认三处问题。原烘焙支撑脚速低于实战跑速，本次解决起停、连续性和朝向，不用数倍步频强求高速绝对锁脚。展示场无实际位移时继续按绝对时间采样，保留暂停和画质对照的确定性。

## Verification
- [x] 浏览器检查加速/减速、受阻归零、走跑切换与战斗待机朝向；实测速度 1.79 时 walk、8.00 时 run、0 时 idle；攻击后恢复跑步。截图见 evidence/，控制台无错误，临时预览文件已移除。
- [x] npm run typecheck、npm run build 通过；npm test 1759/1759 通过。构建保留现有分块体积提示。
- [x] 增量 diff-guard 及独立子代理只读审查通过；无新增依赖、无渲染自动测试、未修改战斗逻辑。

未提交或推送。
