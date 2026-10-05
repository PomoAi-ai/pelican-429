# PLAN -- 欧米模型、技能与注视

## Status: implementing
## Task: 134
## Related: 112, 123, 127
## Baseline Commit: 无 HEAD，按修改文件范围审查

## Goal
制作已确认大头短肢双钳造型的欧米 OMI-01，完成呼吸、眼部扫描、战斗注视主角和两套技能动画，共用游戏/展示场资源。

## Non-goals
不修改其他机器人，不提交推送。

## Acceptance Criteria
- 新外观符合 approved-character.png；两只夹爪能够开合。
- idle 导出呼吸与停顿扫描，脚底固定；战斗头眼跟随主角且不改变攻击朝向。
- 横扫和突进夹击动作有准备、释放、收招，根位移由游戏负责。
- 游戏与展示场同步，保存可编辑 Blender 工程、GLB 和真实预览图。

## Decisions
- explorer 子代理已完成共享渲染链与目标接口探索并提供实现架构；独立第二次架构探索省略，因为文件与骨骼接口方案已完整。
- 保留内部 gatekeeper 标识，显示名改为欧米 OMI-01。
- 模型提供 head / eye 骨；姿态采样后叠加目标注视；攻击期间持续更新目标而不改变 facing。
- 复用已获授权的 Hyper3D CLI 生成需要的新源模型；在本地完成机械绑定与动画。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_enemies/build_omi.py 与欧米资产 | 新造型、骨架、呼吸扫描与技能动画 | — | no |
| 2 | src/entities/enemy.ts、src/render/enemy-rig.ts、src/render/enemy-view.ts | 战斗目标头眼追踪 | — | no |
| 3 | 欧米显示文案与展示场 | 命名及共享资源验收 | 1,2 | no |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
| Blender 导出检查、实际浏览器待机/双技能/注视验收 | yes | no |
