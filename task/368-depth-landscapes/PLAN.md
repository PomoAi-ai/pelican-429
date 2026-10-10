# PLAN -- 六个完整景观演示

## Status: done
## Task: 368
## Related: 364
## Baseline Commit: 975f136

## Goal
制作六个能实际游玩的美观完整景观例子，充分展示近景、双层背景、多层远景与天空组合。

## Non-goals
不修改主世界或共享模型定义，不引入依赖，不提交部署。

## Acceptance Criteria
- 花园山谷、湖畔松林、海岸小镇、层叠城镇、月夜遗迹、晶石洞厅六个独立构图。
- 共享树木完整树冠、花草、水带、自然景观石、发光晶石参与场景，而非只增加格块数量。
- 默认展示完整风景，格线仍可开启；保留玩家、十八观察点、八层检查和侧看层距。
- 运行既有相关行为检查、类型、全量和构建，并浏览器检查六景。

## Constraints
复用真实资源工厂；新装配代码只负责构图、摆放、配色和生命周期。保留并发编辑。

## Decisions
- 复用上轮探索，追加两个explorer子代理分别确认资源API和六景构图。
- 裸树原因是手写TreeInstance漏掉canopy平台数据，改用共享planTree；树冠数据只用于渲染，不进入玩法碰撞。
- 六景以X24为主画面，X8/40提供侧面段落；远处建筑不再整组放大。
- 共享水体用于湖岸水带，不声称具备新海洋模拟。
- 无需裁决的不可逆操作或方案分歧，直接执行。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/depth-scenery.ts | 六个主题的完整地形与建筑组合 | — | yes |
| 2 | src/app/depth-landscape-details.ts | 共享花草、水、岩石、晶石装配 | 1 | yes |
| 3 | src/app/definition-depth-layout.ts | 六主题目录、树冠、配色与资源生命周期 | 1,2 | yes |
| 4 | src/app/room-scene-preview.ts | 默认风景展示、主题昼夜与观察入口 | 3 | yes |
| 5 | docs/depth-definitions.md, public/concepts/depth-definitions.md | 当前演示定义 | 3 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 六景浏览器视觉与玩家、层切换 | yes | yes |

## Outcome
- 六景接入透视的场景分层目录，默认轻微斜视全景且玩家保持可操作；十八观察点恢复正常跟随视角。
- 共享planTree树冠、真实岩土纹理、花草/灌木/水带/景观石/晶石已复用；门窗保留材质分色，格线与半透明默认关闭。
- 概念定义正文与public镜像同步六景清单及观察方式。
- 子代理分别完成六景构图和资源装配，最后只读检查确认生命周期、图层显隐和玩法隔离正确。

## Validation Results
- npm run typecheck：通过，exit 0。
- npm test：1869项通过，0失败，exit 0。
- npm run build：通过，exit 0；保留既有大chunk提示。
- 浏览器实际查看六景；验证洞厅天空禁用、遗迹默认月夜、背景层开关及恢复、观察点切回跟随、花园玩家跳跃。
- 实机截图：/tmp/depth-garden-playable.png。
- 未做低端设备帧率测试、提交或部署。少量前景花根与半砖栏头重合仍是视觉微调项，不影响玩家碰撞。
