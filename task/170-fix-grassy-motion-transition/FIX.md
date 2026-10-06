# FIX — Grassy 跑动与飞行变速姿态衔接

## Status: done
## Task: 170
## Related: N/A
## Baseline Commit: 3a35077

## Problem
走跑、快跑和普通/快速飞行切换速度时，身体倾斜突然变化，需要自然过渡。

## Root Cause
`src/render/player-view.ts` 按速度阈值选择独立动作；`src/render/grassy/grassy-animator.ts` 切换时直接停止所有旧动作，`grassy-motion-pose.ts` 组合攻击与移动时也直接替换移动采样，缺少姿态衔接。

## Fix Plan
- [x] 在共享motionPose内用0.24秒smoothstep衔接现有骨骼姿态，连续换档从上一帧显示结果重新开始；正常移动包含上臂，攻击期间只平滑移动骨骼。
- [x] 键盘和特效变换在平滑后计算，保留握持；frameDt为0时冻结。复用rig的旧动作检视在重播时显式清除过渡。

## Verification
- [x] 浏览器实际动作：录制18秒旧/新共享模块并排对比，覆盖走→跑→快跑→走→停止、悬停→前飞→快飞→前飞、0.14秒内反复变速、空中Code攻击时变速。单帧脊柱角变化的示例从24.12°变为0.30°，随后完成平滑过渡。
- [x] 临时浏览器检视：过渡中相同采样重复10次、dt为0，姿态最大变化为0；空中施法时键盘相对胸部矩阵与原握持最大差约8.4e-9。正式页面恢复正常加载。
- [x] `npm run typecheck`：首次受并行编辑的NPC对话配置暂缺影响；文件写入后复查通过。
- [x] `npm test`：1696项，1695通过；唯一失败是同一个NPC对话配置暂缺的架构导入检查。配置出现后单独运行 `node --test test/architecture.test.ts`：21/21通过。未修改该模块或断言。
- [x] `npm run build -- --outDir /private/tmp/grassy-motion-dist`：通过；保留现有大chunk提示。
- [x] 子代理按core-review/diff-guard审查通过；本次文件diff --check通过。
- [x] Bug is fixed

## Evidence
`assets/characters/grassy/model-equipped/evidence/motion-transition/` 保存18秒真实动画对比与飞行切换关键帧；左侧使用修改前motionPose，右侧使用最终共享实现，均调用同一正式模型和animateGrassy。

## Decisions
- 采用 fix/core-dev 与 Ponytail Full；复用现有骨骼和动作，不重新导出模型。
- 按仓库规定以浏览器验收动画，不新增网格/姿态实现细节断言测试。
- 不提交或推送。
