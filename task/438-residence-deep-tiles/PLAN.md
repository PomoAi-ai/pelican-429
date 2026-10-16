# PLAN -- 加深格接入住宅建造与场景

## Status: done
## Task: 438
## Related: 434, 437
## Baseline Commit: 64ef4a38

## Goal
完成深度属性的建造、预览、渲染、拆除及存档闭环，替换AI住宅不规范的固定宽地台；普通深2，仅室外园廊使用深3。

## Non-goals
不改变二维玩法，不新增材料资源ID，不迁移/清空用户存档，不把全部室内楼板加深，不开发大型石头整体破坏。

## Decisions
- explorer子代理完成探索及推荐架构，已有共享规则无需另做架构轮次。
- depthMode为placement可选规格，缺省沿用normal；v1存档增量字段验证，旧布局不改。
- 固定环境基底恢复深2、居中、一格一缝；现有室外园廊半砖改deep，楼板/门槛保持正常。
- 公共模型继续复用definition kit，正式放置和预览统一规则；墙窗完整区域互斥。
- 工程子代理负责sim/save/相关行为测试，主代理负责UI/render/environment。保留所有无关工作区改动。

## Implementation Map
| File | Intent |
|---|---|
| src/sim/residence.ts | 深度属性、双向墙窗互斥、示例园廊 |
| src/app/residence-save.ts | 可选规格保存加载边界验证 |
| test/residence.test.ts | 建造原子性、碰撞、存档行为 |
| src/app/residence-app.ts / src/ui/residence-hud.ts | 深2/3规格、预览与点击一致 |
| src/render/residence-view.ts | 复用共享加深几何 |
| src/render/ai-city-environment.ts | 固定基底标准深度和拼缝 |
| docs/depth-definitions.md / public/concepts/depth-definitions.md / src/ui/site-pages.ts | 更新接入状态 |

## Validation
- typecheck、相关测试、全量测试、build。
- 浏览器院区深度对照、建造规格、墙窗冲突和通行。
- scoped review、diff --check。

## Results
- 全部实现完成，深度作为既有实体placement属性；菜单提供28种现有实体材质/形状的普通/加深选择。
- 默认园廊加深；固定地台从深约4/每2格缝改为深2/每格缝。花槽、能源柱后置并同步避让，避免窄地台脚部悬空。
- 子代理先复现禁墙缺陷再通过27项住宅测试，scoped review发现并修复后置落脚问题，复核关闭。
- typecheck通过；第一轮全量1930/1930通过。最后仅CSS隐藏/构件后置修正后重跑1929/1930：无关worldgen性能阈值368.3ms超250ms；定向重跑worldgen+residence共56/56通过，未修改性能断言。最终build通过（723ms，已有chunk大小提示）。
- 浏览器实放加深砖，同格墙被拒绝且计数保持；切墙资源规格控件隐藏；刷新demo恢复示例；人物从47.5走至27.7园廊，再回44.6能源柱旁，正常落脚。
- git diff --check通过。证据evidence/residence-tiles.jpg。
- 旧存档无迁移，固定基底仍不可拆除，可建造园廊可拆改，未提交/推送。
