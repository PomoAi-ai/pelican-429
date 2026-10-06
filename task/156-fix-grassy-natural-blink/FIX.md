# FIX — Grassy 随机自然眨眼

## Status: done
## Task: 156
## Related: 128, 153
## Baseline Commit: 3a35077

## Problem
主角的眨眼不自然，跑步、飞行和攻击等动作中也应持续随机眨眼；检查眼睑精细度。

## Root Cause
src/render/grassy/grassy-animator.ts:31 将动作采样时间传给 blink，攻击、跳跃和起飞等动作时间会重置或夹紧，短片段可能根本到不了眨眼时刻。src/render/grassy/grassy-rig.ts 使用固定7.8秒序列，所有角色实例重复同一节奏。

## Fix Plan
- [x] 共享角色眼睑更新使用独立帧时间，切换动作和片段循环不重置眨眼。
- [x] 每个角色实例随机间隔、闭眼/睁眼时长，偶尔连续眨眼；暂停仍可冻结检视。
- [x] 同步游戏与模型预览调用，检查眼睑闭合曲线和原有形状。
- [x] 子代理独立审查调用生命周期与眼睑视觉，修复明确缺陷。

## Verification
- [x] npm run typecheck 通过。
- [x] npm test：1654 项，1653 通过；唯一失败为 worldgen 的 250ms 性能阈值（中位数 263.2ms）。不改断言，停止 Blender 导出后单独重跑 `node --test test/worldgen.test.ts`，29/29 通过。
- [x] npm run build：首次默认输出目录复制资源时报 ENOENT；使用 `npm run build -- --outDir /private/tmp/grassy-natural-blink-dist` 隔离输出后通过，仅保留既有大 chunk 提示。
- [x] 浏览器高画质检视睁眼、半闭、全闭；实际共享 rig 连续 32 秒采样待机、快跑、快飞和每帧重置片段时间的短攻击，都出现不等间隔眨眼，包含双眨；dt=0 保持当前两种眼睑权重。
- [x] 网页实际加载 detailed/game/light 三档，每档保留 15 动作；正式 5174 展示场与测试关卡启动正常。
- [x] Bug is fixed

## Decisions
- 采用 fix/core-dev 和已启用的 Ponytail Full，只改共享眨眼与必要调用。
- 动画和眼睑形状通过实际渲染验收，不添加断言网格/材质或读取源码的自动测试。
- 不修改其他角色、物理、战斗或键位，不提交/推送。
- 子代理调用链审查通过：短攻击、动作切换、暂停、重播以及四个调用点均已覆盖。
- 原眼睑线性闭合为防止穿过凸眼而把睁眼面整体向外推，近景出现贴片硬边；保留原身体与所有动作，加入 BlinkHalf 中间形态并用分段权重沿贴肤曲面闭合。
- 眼睑固定边缘贴肤并羽化；关闭覆盖层对原脸的重复投影，保留深度写入，避免 GTAO 从透明眼睑下方读取旧眼面并形成灰斑。
- 资产与代码切换期间曾提前要求 BlinkHalf 导致加载失败，已恢复旧合同至全部导出完成，再同步启用；三档已逐一通过实际 GLTFLoader 校验。
- 子代理确认三档身体顶点、法线、UV、蒙皮、索引及原 15 动作数据逐字节保持；报告与 Blender/网页近景位于 assets/characters/grassy/model-equipped/evidence/eyes-refined/。
- 浏览器临时近景使用共享模型、动画和舞台灯光；检查完即移除，不留测试入口或另一套角色渲染实现。
