# PLAN -- Grassy 攻击与推进粒子特效

## Status: done
## Task: 089
## Related: 081, 085
## Baseline Commit: 无 HEAD；原始修改文件保存于 $TMPDIR/grassy-vfx-baseline

## Goal
依照用户提供的两张装备概念图，完善共享 Grassy 角色的蓝白代码攻击、推进飞行粒子表现。

## Non-goals
不改变角色造型、蒙皮、既有骨骼动画或游戏战斗逻辑；不安装运行时依赖。

## Acceptance Criteria
- 飞行由真实护腕和腰侧装备挂点喷出有亮芯、柔光、流动细粒和衰减的蓝色尾流。
- Codex 攻击从键盘发出蓝白代码飞矢、代码碎片与拖尾；Bug 攻击和超载保留可辨识主题。
- 特效支持旋转、暂停、慢放、重播和动作切换，结束后不残留。
- 共享游戏渲染模块实现，展示场直接复用；实际浏览器检查明暗环境与侧向。

## Constraints
- 遵守 AGENTS.md：纯视觉效果通过浏览器验收，不新增网格或材质细节测试。
- 不变更 vendor，不提交或推送，不覆盖其他任务的改动。

## Decisions
- “例子效果”依上下文按“粒子效果”处理，使用这两张图作为视觉参照。
- 使用 dev 工作流和 Ponytail Full；同一探索子代理同时提供该局部渲染模块的架构建议。
- 探索与设计已完成，未触发审批停止条件。飞行保留喷口局部 -Y，键盘保留局部 +Z；Codex 粒子在收键盘前消散，避免拖尾随背负姿态转向。
- 新增一个局部粒子构建模块供四喷口与攻击复用，固定容量缓冲、程序化软边，无贴图/外部依赖；无需更改模型或动画。
- 当前攻击仍为站立动作；本轮完成视觉特效，不把它宣称为空中攻击组合动画或主游戏可玩战斗。
- 飞行四喷口使用交叉软流束 + 每口 128 个细粒，替换硬锥体与独立火花网格；喷口部分由 32 次绘制降到 12 次。
- Codex 保留透明飞矢轮廓，加连续细粒拖尾和代码碎片；Bug 加紫色尾迹；超载加蓄能粒子和释放后的径向散射，保留服务器主题。
- 浏览器实际发现 GLSL pow 负底数/边缘底数数值造成 HDR 后期黑屏，已用平方乘法与非负衰减表达式修复，并在实际悬停画面验证正常。独立审查子代理已复核最终表达式。
- 已检查明暗环境、正面/侧面/三分之四、暂停与慢放、攻击和降落结束清除；浏览器错误日志为空。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/grassy/grassy-particles.ts | 固定容量软粒子与推进尾流 | — | yes |
| 2 | src/render/grassy/grassy-effects.ts | 攻击粒子、动作时序、共享挂点与资源释放 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，退出 0 |
| npm test | yes | yes，1531/1531 通过，305 suites，84.599 秒 |
| npm run build | yes | yes，4.23 秒；现有分块体积和输出目录插件耗时提示 |
| 浏览器实际视觉验收与截图 | yes | yes |

## Evidence
- `assets/characters/grassy/model-equipped/evidence/particle-effects/flight-particles.jpg`
- `assets/characters/grassy/model-equipped/evidence/particle-effects/codex-particles.jpg`
- 同目录 `grassy-vfx-typecheck.log`、`grassy-vfx-tests.log`、`grassy-vfx-build.log`。
- 未修改蒙皮/GLB、动画文件、vendor、测试或战斗逻辑；未提交或推送。
