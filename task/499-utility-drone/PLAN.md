# PLAN -- 游戏无人机模型与软臂

## Status: done
## Task: 499
## Related: N/A
## Baseline Commit: c292d188

## Goal
重绘并制作无盖贯通风扇、小轮、大工具头和可长距离伸出的软臂无人机；发光材质直接用于游戏。

## Non-goals
不制作真实内部工具收纳，不改敌方哨蜂，不修改任务经济或战斗规则。

## Acceptance Criteria
- 概念图、Blender 与 GLB 保持设计一致。
- 普通游戏、家园与场景预览复用同一 GLB；保留无人机点击对话。
- 工作工具通过软臂伸向目标，光条保留 HDR 自发光。

## Constraints
保留工作区既有改动；渲染动画人工验收，不新增实现细节测试；不提交推送。

## Decisions
- 探索由当前子代理依 explorer 完成：家园无人机为 homestead-view 程序占位，玩家跟随无人机为 game-hud 的 DOM 图片。
- 使用 public/robots/utility-drone/model.glb；Y-up、+X forward，模型长 2.2，游戏缩放至约 1.4 格。
- 在资源边界校验必需节点；共享材质几何，实例只独立状态灯材质。
- UI 保留透明交互热点，app 回调驱动共享 3D 模型；工具直接换头，分段软臂按目标弯曲。
- 用户需求和资源接口明确，探索与设计合并，无需额外审批。
- Blender 外壳增加分层装甲、暗槽、灯带；轮径 0.59→0.40；工具头额外放大 1.5 倍；中央无盖贯通。运行时飞行俯角 0.28 弧度增强横版剪影可读性。
- 子代理只读审查未发现必修问题；普通视角实际点击无人机能打开对话。测试阶段由主代理执行全套现有检查，未新增渲染自动测试。
- 全量测试唯一失败为现有 weapon-hud.ts 的 style.setProperty 与 fake-dom.ts 普通对象替身不匹配；该用例直接调用 createWeaponHud，不经过无人机模块。本任务不修改这两处无关文件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/utility-drone.ts | GLB 共享资源、实例动画、软臂与发光 | yes |
| src/render/homestead-view.ts | 家园真实工作目标驱动模型 | yes |
| src/ui/game-hud.ts / .css | 保留点击热点并回调 3D 跟随位置 | yes |
| src/app/game-app.ts / homestead-app.ts | 主游戏共享资源装配 | yes |
| src/app/facility-app.ts / perspective-controls.ts / 上层场景 | 预览复用模型 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | 已执行：1976/1977 通过；1 项无关武器 HUD 测试替身失败，见 Decisions |
| npm run build | yes | 通过；仅既有大 chunk 提示；俯角调整后重跑通过 |
| 浏览器游戏与模型人工验收 | yes | 跟随、点击对话、标记树木后飞行与软臂砍树均已验证；game-working.png 保存现场 |
