# PLAN -- 恢复主角原版头发

## Status: done
## Task: 318
## Related: 311-character-hair-rebuild, 312-grassy-soft-hair, 313-grassy-hair-variants, 314-grassy-layered-motion, 316-fix-hair-crawling
## Baseline Commit: 2a5455a

## Goal
按用户确认恢复本轮重做之前主角最初自带的头发，同步游戏和查看页。

## Non-goals
不修改Boss资源或外形，不动其他并行开发，不提交推送。

## Decisions
- 使用dev流程；探索与设计复用已完成的逐文件diff与9个Git LFS原件哈希核对，目标和恢复版本已由用户确认，不重复派探索。
- 9个主角模型恢复至基线2a5455a，6个资源报告仅恢复主角条目；试版备份保留。
- 主角原始rig、animator、hair-sway及A/B接入代码恢复基线。独立头发模块保留给Boss，原片状试版不再挂载。
- 当前近景页改用恢复后的共享主角入口，不再请求新发型。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| public/characters/human/models-equipped、assets/characters/*models-report.json | 原版9模型和6条报告，保留备份 | done |
| src/render/grassy、hair-sway、A/B接入文件 | 恢复主角原路径并撤销发型选择 | done |
| output/grassy-hair-motion/index.html | 当前查看页同步原版 | done |

## Validation
| Command | Required | Done |
|---|---|---|
| 原版模型哈希与Boss资源未变 | yes | done |
| 浏览器近景与正式展示場 | yes | done |
| npm run typecheck、npm test、npm run build | yes | done |
| 增量审查 | yes | done |

## Results
- 9个主角GLB和16个源/测试文件逐一与2a5455a一致；6份资源报告只恢复主角条目。恢复前备份位于output/grassy-hair-restore-backup。
- 72个Boss资源前后哈希一致；Boss独立发束运行参数未改。
- 近景页和正式展示场均已实际显示原版头发，无浏览器错误。近景页保留并打开。
- 验证代理运行npm run typecheck、npm test（1808/1808）、npm run build各一次全部通过；dist原版compact模型与public哈希一致。仅既有大chunk提示。
- 审查代理核对调用链、资产、报告和恢复范围，无高置信问题。A/B发型选择和src/test调用残留均已撤回。其他并行任务修改保留。
