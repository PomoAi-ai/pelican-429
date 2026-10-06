# PLAN -- NPC 日常待机动作

## Status: done
## Task: 259
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Goal
Tibo 待机时吃薯条，Sam 待机时自言自语“AGI 降临”。

## Non-goals
不新增战斗技能、伤害、语音服务或外部资源。

## Acceptance Criteria
- 两个 NPC 的人形与怪物形态、游戏与展示场共用日常动画。
- Tibo 右手拿薯条送到嘴边并收手；Sam 配合思索与说话手势显示短对白。
- 间歇播放，暂停停止；移动、攻击和飞行不能与日常姿态冲突。
- 保留头发、眨眼、左手武器与形态切换。

## Constraints
- 复用模型、骨骼和现有薯条/字幕资源，不修改 vendor 或重新导出 GLB。
- 只改表现层，不新增自动渲染测试，使用浏览器验收。

## Decisions
- 动画入口与资源流已在本会话完整读过，探索和架构由同一只读子代理合并完成。
- 现有模型没有嘴部骨骼，使用姿势与对白表达，不强行拉伸面部。
- 此次为可回退的仓库内表现层修改，无需暂停审批。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/npc/npc-idle.ts | 两种形态共用待机节奏、手势与手持薯条 | 无 | yes |
| 2 | src/render/npc/npc-pose.ts | 在姿态衔接前应用日常动作，保持采样恢复 | 1 | yes |
| 3 | src/render/npc/npc-rig.ts | 装配形态参数与释放资源 | 2 | yes |
| 4 | src/render/npc/npc-effects.ts | 共用薯条工厂与单份 Sam 字幕 | 无 | yes |
| 5 | src/render/npc/npc-animator.ts | 姿势和字幕同期 | 2、4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes — 最终代码通过 |
| npm test | yes | yes — 1780 通过，0 失败 |
| npm run build | yes | yes — 最终代码通过，仅 chunk 体积提示 |
| 浏览器视觉检查 | yes | yes — 两种形态定帧确认握点、嘴边位置、Sam 字幕与手势 |
| core-review + diff-guard | yes | yes — 实现审查及最终手腕校准增量审查均通过 |

## Outcome
- Tibo 右手将竖直薯条送到嘴边，咬后变短再收手；Sam 配合右手手势与点头显示“AGI 降临……”。0.35 秒起手，约 3 秒收手，8 秒一轮。
- 最终分别校准两种 Tibo 的嘴前目标与手腕方向，修正首版人形偏低、怪物挡眼的问题。
- 子代理完成探索/实现、只读审查与命令验证；不新增测试、依赖或模型文件。
- 最终全量测试日志 `/tmp/pelican-idle-tests.log`；类型检查 `/tmp/pelican-idle-typecheck.log`；构建 `/tmp/pelican-idle-build.log`。
