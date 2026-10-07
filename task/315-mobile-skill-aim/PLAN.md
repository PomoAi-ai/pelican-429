# PLAN -- 手机多点触控与技能拖动瞄准

## Status: done
## Task: 315
## Related: N/A
## Baseline Commit: 2a5455a

## Goal
修复按住左侧摇杆时右侧技能及变身按钮无法可靠触发；手机技能支持点击自动选择附近目标、拖动指定方向并在松手时释放，拖动期间显示施法方向。

## Non-goals
不改变技能伤害、冷却、范围或移动能力；不改已有角色资源和其他未提交功能。

## Acceptance Criteria
- 摇杆与右侧按钮使用独立指针，可同时操作。
- 轻点保留屏内最近存活敌人的自动瞄准。
- 定向技能拖动时显示符合技能实际能力的方向提示，松手释放且保留方向至技能执行。
- 取消触摸、失焦和隐藏页面不误放技能，不留下按下状态；桌面和键盘操作继续可用。

## Constraints
复用现有技能和坐标投影，不引入依赖。保护工作区已有改动。UI 由浏览器验收，不新增 UI 自动化测试。无提交、推送或部署授权。

## Decisions
- 根因：普通攻击使用 Pointer Events，技能和变身仅依赖 click，第二触点不能可靠获得兼容点击。
- 从 fix 升级 dev：需求同时包含多点触控修复、拖动瞄准、可视提示与模拟输入方向缓冲。
- explorer 子代理完成输入链路探索与架构设计，同一代理按 core-dev 实现；无需要用户裁决的设计分歧。
- 技能使用独立 pointerId、指针捕获和松手释放；点击保持自动选敌，手动方向优先。
- 方向提示遵守实际能力：突进只左右、范围技能保留自身范围行为，不新增全方向突进。
- 鹈鹕技能的延迟缓冲需保存释放时的目标，避免下一帧自动瞄准覆盖拖动方向。
- 使用显式 manualSkillAim 区分手动方向与实时自动选敌；吞弹自然结束沿用手动方向，再次轻点则重新自动选敌，再次拖动则覆盖方向。
- 独立审查子代理完成 core-review + diff-guard，发现的吞弹二次轻点方向覆盖问题已修复，复审通过。
- 后续修正：仅实际有方向的技能参与拖动，超载和变身不计算拖动、不显示标记；吞弹起手仅左右，反吐支持自由方向。
- 去掉黄色虚线和自身圈，改为半透明青色箭头、拖动进度环与偏移触点。手势拉距决定箭头长度（64–220 CSS px）、厚度和亮度，属于输入反馈，尚不更改技能伤害、射程和速度。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/weapon-hud.ts、src/ui/skill-touch.ts | 多点技能输入、拖动预览与取消清理 | — | yes |
| 2 | src/app/game-app.ts、src/app/frame-loop.ts | 手机目标与输入装配 | 1 | yes |
| 3 | src/entities/pelican-weapons.ts、src/entities/pelican-controller.ts、src/input/action-map.ts | 延迟施法方向锁存 | — | yes |
| 4 | src/ui/control-surface.css、src/ui/hud.ts、test/weapons.test.ts、test/weapons-render.test.ts | 按下反馈、说明和回归验证 | 1,3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes；本轮 1808 通过，0 失败，约 149 秒 |
| npm run build | yes | yes；已有大 chunk 提示 |
| core-review + diff-guard 本次改动审查 | yes | yes |
| 浏览器触控与方向提示验收 | yes | yes；Chrome 844×390 触摸模拟：双指独立、短拉约104px到长拉220px、拖出按钮继续瞄准、右手松开释放而左手仍按住、取消清理、超载不出现方向或进度环。真机触感仍以用户设备为准 |

## Verification Notes
- 子代理执行 `node --test test/weapons.test.ts test/weapons-render.test.ts`：55 通过。新增两个回归先失败再修复通过。
- 本次文件限定 `git diff --check -- ...` 通过。全仓检查会尝试对既有 GLB 改动执行 Git LFS clean，受 .git 写权限限制，因此只检查本次代码与记录。
- 本轮 UI 修正经独立子代理 core-review + diff-guard 审查通过。手势标尺在按下时记录，避免按钮缩放动画改变归一化长度；该收尾调整后类型检查和构建再次通过，全量逻辑测试此前已通过。
- 最终效果截图：`aim-preview.png`。浏览器模拟验证，不新增 UI 自动化测试文件。
