# PLAN -- 机房无敌人自由预览

## Status: done
## Task: 088
## Related: 069-playable-facility-chapters, 080-facility-lighting-weather-map, 087-fix-facility-effect-performance
## Baseline Commit: 无 HEAD；原件 $TMPDIR/pelican-facility-preview-before

## Goal
三个机房场景当前只用于预览：移除敌人、清怪目标和通关/失败阻断，保留角色自由移动、跳飞、平台、地图及环境效果。

## Acceptance Criteria
- 通过顶部入口或原机房 URL 进入均没有敌人和敌方攻击。
- 到原出口后仍可继续探索，不弹出通关或失败界面。
- UI 使用场景预览、自由探索说明，无守卫计数/清怪要求。
- 普通游戏、训练场及现有场景效果不受影响。

## Decisions
- 按 dev/core-dev/core-test/Ponytail 执行。此前探索已定位所有调用，根代理与探索代理完成设计，不重复另派设计。
- 共享 createFacilityLevel 原本不生成敌人；删除加载器额外注入，保留章节出生点。
- 删除仅机房使用的战斗包装及帧循环结束条件，直接复用 stepSim；不保留未来战斗模式旗标。
- UI 代理收敛 HUD/图例，root负责装配、行为测试与说明。
- 配置、模拟包装删除与调用方同步可回退，无外部接口/持久数据改变，无需审批。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/facility-scenes, app/game-level | 移除敌人出生配置及注入 | yes |
| sim/facility-chapter, app/game-app, app/frame-loop | 删除战斗包装和结束冻结 | yes |
| ui/facility-chapter-hud, facility-chapter.css, facility-minimap, minimap, settings-panel; app/facility-app | 预览说明与自由切换 | yes |
| test/facility-chapter.test, README, index.html | 新预览行为回归与说明 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/facility-chapter.test.ts test/facility-level.test.ts | yes | yes，21/21 通过 |
| npm run typecheck | yes | yes |
| npm test -- --test-concurrency=4 | yes | yes，1531 tests / 305 suites，1531 通过，0 失败/跳过/取消，95.90 秒 |
| npm run build | yes | yes |
| 浏览器三章无敌人、HUD/地图、移动检查 | yes | yes，三场景可自由切换，无守卫/血量/战斗目标；M 图无敌人；空格跳跃正常，环境效果保留，无控制台错误 |
| 独立复核 | yes | yes，Approved，未发现高置信问题 |

## Verification Notes
- 三章无敌人用例修改前均失败；删除出生注入后通过。持续模拟无敌方实体，移至旧出口后 tick 和角色移动继续。
- 旧战斗/胜负契约用例按本轮明确要求替换，跨断桥与井底探索用例保留。新增移动检查初始阈值误估 2 格，实际正常步行一秒约 1.766 格，改为验证超过 1 格；生产速度未改。
- 全量测试并发设为 4，降低上一轮已确认的世界生成计时用例在满并发下的负载争用，没有修改断言/跳过测试。
- 截图：`output/chapters/cathedral-free-preview.jpg`。日志：`$TMPDIR/pelican-facility-preview-{typecheck,tests,build}.log`。
- 类型检查、构建均退出码 0；构建 6.11 秒，仅既有主 JS 包 >500kB 提示。最终检查后仅更新任务文档。
- 已按逐文件备份核对修改范围，临时浏览器页关闭；未改普通游戏战斗、依赖、CI或 vendor；未提交、未推送。
