# PLAN -- 角色展示场自由拖动转向

## Status: done
## Task: 342
## Related: 341
## Baseline Commit: 975f136

## Goal
在角色展示场增加可见拖动控件，连续调整角色水平转向与俯仰，方便用户检查脸部多角度效果。

## Non-goals
本次控件不修改模型、材质或动画；脸部正面未达到参考要求，继续作为未通过项记录。

## Acceptance Criteria
- 当前角色控制面板有明确的自由旋转拖动区，连续水平转向、俯仰和实时角度反馈。
- 保留预设视角与复位，鼠标/触摸指针、方向键可操作。
- 复用现有modelYaw/modelPitch和setModelView；不重启角色动作，不影响场景平移与缩放。
- 历史单卡旋转行为保持可用；切动作或关闭控件不会留下拖动状态。

## Decisions
- 根因已定位：createModelCameraControls 已有拖动/键盘/复位，但共享场景传入的卡片viewport被隐藏，用户只有预设下拉框可用。
- 复用现有交互绑定，将共享场景交互目标改为可见拖动区；不新增第二套旋转状态，不改变整个画布手势。
- 探索和设计由主代理与stage_rotation子代理共同完成，代码路径明确，合并执行对应阶段；不需要用户裁决的方案分歧或不可逆操作，直接实现。
- 采用dev工作流与已启用的Ponytail；渲染和UI通过浏览器验收，不新增镜像实现的测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/ui/showcase-panel.ts | 共享场景提供可见旋转交互面 | - | yes |
| 2 | src/ui/model-camera-controls.ts | 复用拖动并显示角度 | 1 | yes |
| 3 | src/ui/showcase.css、showcase-language.ts | 拖动区布局、操作提示与翻译 | 1,2 | yes |
| 4 | src/app/showcase/stage-actor.ts | Luma同时消费俯仰，避免控件显示角度但模型不动 | 2 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1842项全部通过；最后Luma一行适配后对应showcase32项再次通过 |
| npm run build | yes | yes：最终版本构建成功，包体积提示仍在 |
| 浏览器拖动/键盘/复位/切动作/原镜头平移实测 | yes | yes：D1连续拖动到30°/17°、跨180°、拖出区域、方向键、Home、双击、切动作保角度和暂停状态均检查；0控制台error |
| 局部diff与释放逻辑审查 | yes | yes：独立审查通过，隐藏时释放及Luma俯仰遗漏已修；git diff --check通过 |

## Evidence and limits
- 页面实拍：`private-source/d1-free-rotation-control.jpg`。
- 触摸沿用PointerEvent与touch-action:none；未在实体触屏上验收。关闭控制区域后收到的移动事件会释放原指针，避免继续旋转隐藏角色。
- 水平连续360度，俯仰保持原范围-45至60度，未更改URL参数契约。
- 脸部造型仍未通过用户验收，341恢复verifying状态；本轮没有把控制改进当成脸部修复。
- 没有新增运行时依赖、旋转状态、渲染内部测试；没有提交/推送。
