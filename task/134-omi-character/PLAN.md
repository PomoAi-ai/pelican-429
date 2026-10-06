# PLAN -- 欧米模型、技能与注视

## Status: done
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
- Hyper3D CLI 请求超时且没有 generation ID，未重复发起收费请求；本次交付改为本地 Blender 机械分件重建，来源记录在 SOURCE.md。外观为参考图的简化模型实现。
- 独立审查发现动作切换时 Mixer 缓存可能残留头眼姿态，已将采样姿态恢复移到动作切换前。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_enemies/build_omi.py 与欧米资产 | 新造型、骨架、呼吸扫描与技能动画 | — | yes |
| 2 | src/entities/enemy.ts、src/render/enemy-rig.ts、src/render/enemy-view.ts | 战斗目标头眼追踪 | — | yes |
| 3 | 欧米显示文案与展示场 | 命名及共享资源验收 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| Blender 导出检查、实际浏览器待机/双技能/注视验收 | yes | yes |

## Results
- GLB：21 骨、90 个机械分件、5 个动作；高度 2.60000014、脚底 0，导出检查通过。保存 omi-rigged.blend 和六张真实模型渲染。
- npm run typecheck：通过。首次因并行任务暂缺 game-audio.css 失败，文件恢复后复查通过。
- npm test：1596/1596 通过，301 suites；enemy 定向测试 32/32 通过。
- npm run build：通过，有 Vite 大包体积提示。
- 浏览器确认新版模型加载、待机和跳跃目标跟随；双技能预览加载且无控制台错误，关键技能姿势另经 Blender 渲染目视检查。浏览器抓取短攻击帧时遇到一次控制超时，未获得完整连续动作录像。
- 当前会话子代理分别完成运行时追踪、模型制作和独立审查；未提交或推送。
