# FIX -- NPC 待机眨眼与呼吸

## Status: done
## Task: 126
## Related: 119
## Baseline Commit: 无 HEAD；源模型、GLB 与动画脚本快照在 $TMPDIR/npc-idle-baseline/

## Problem
Sam 和 Tibo 呼吸时缺少眨眼，待机动作幅度过小。

## Root Cause
- `scripts/blender_npcs/animation.py` 的 `_idle` 只有微小脊柱、头部和手臂变化，没有眼部动画。
- 正式 Rodin 模型是单体蒙皮网格，没有独立眼睑或眨眼形态键。
- 直接压缩原眼部表面会拉伸已烘焙的眉眼贴图。最终使用新增薄眼睑面，原脸表面保持不变；BlinkTravel 修正半闭时眼睑穿透原眼球的问题。

## Fix Plan
- [x] 在已确认的模型上增加薄眼睑，Blink / BlinkTravel 与骨骼合入同一 idle 动画；每人新增 924 个顶点，复用原材质。
- [x] 呼吸与头部、双臂摆动约增强至 2–3 倍，循环仍为 4 秒。Sam 和 Tibo 的眨眼时点错开 5 帧。
- [x] 原脸顶点、UV、材质、贴图和绑定保持原样；游戏与展示场继续共用正式 GLB。

## Verification
- [x] 其余七个动作的 Action 指纹，以及 GLB 中按节点名称/通道/插值归一后的解码 sampler 全部精确一致。
- [x] 睁眼、半闭、闭眼渲染与浏览器运行时验收通过。闭眼转行走/技能正常恢复睁眼；正式横版展示场正常加载，无控制台错误/警告。
- [x] 二次刷新幂等检查通过；原脸 morph 位移、脚底位移、循环首尾全体顶点差均为 0。
- [x] `npm run typecheck` 通过。
- [x] `npm test`：1568/1569 通过；唯一失败为地图生成性能门槛，中位数 528.4ms > 250ms。负载回落后仅复跑 `node --test test/worldgen.test.ts`，29/29 通过，生成中位数达到 <250ms 门槛。没有修改断言、阈值或地图代码。日志 `$TMPDIR/npc-idle-breath-blink-test.log`、`$TMPDIR/npc-idle-worldgen-recheck.log`。
- [x] `npm run build` 通过，存在原有大包提示。
- [x] 子代理审查与 diff-guard 通过，无新增高置信问题。

不为渲染或文案编写自动测试。

## Evidence
- 模型三阶段图与导出/幂等/形变检查：`assets/characters/{sam,tibo}/evidence/idle-blink/`。
- 浏览器真实 GLB 眨眼、切动作恢复与正式场景截图：本目录 `evidence/`。
- 已更新两份 SOURCE.md 的八段动作说明。没有提交或推送代码。
