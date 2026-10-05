# PLAN -- 可直接游玩的机房章节

## Status: done
## Task: 069
## Related: 064-grand-facility-scenes
## Baseline Commit: 无 HEAD；本轮原件 $TMPDIR/pelican-chapter-before

## Goal
把山体算力堡垒、算力大教堂、光纤深渊接成正式游戏章节，顶部直达，进入即有正确光照和可操作角色。

## Non-goals
不新增 Boss 模型或独立战斗系统、不做进度存档、不发布、不修改 vendor。

## Acceptance Criteria
- 三个顶部章节入口直接启动正式游戏模拟、输入、武器、跟随相机。
- 模型与场景预览共享，光照初始化正确，章节不受旧天气/调试设置污染。
- 有守卫、清除计数与出口目标；失败能重开，通关能前往下一章。
- 地面、断桥、检修平台可通过真实物理移动和飞行到达；角色与界面可见。
- 普通游戏、预览、测试关卡不受影响；本地检查通过并完成浏览器实际操作验收。

## Constraints
遵循 AGENTS.md、dev、core-dev、Ponytail；保留现有模拟层级、唯一运行依赖 three；不提交推送。

## Decisions
- 子代理完成启动/模拟与光照/镜头两路探索，直接使用 mode=game&level=facility&scene=...，无未决方案分歧。
- 守卫复用现有 trainingDummy 实体、射击和受击模型，章节运行时使击败的守卫永久退出，普通假人仍重置。
- 章节状态在纯 sim 模块维护，playing/failed/complete 为单次运行；重开/切章整页导航。
- 主路线布置守卫与出口，高层供飞行探索；不把装饰梯子宣称为可攀爬。
- 共享机房表现装配先于降水视图创建，章节使用局部镜头和最低照明配置，启动固定晴朗/无风雨雪龙卷风。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/facility-scenes、app/game-level、sim/facility-chapter | 章节配置、地图入口、战斗进度与失败通关 | yes |
| app/facility-presentation、facility-app、scene-wiring、lighting-wiring | 共享工业场景、照明和章节镜头 | yes |
| app/game-app、frame-loop、settings-wiring | 正式游戏装配与章节环境约束 | yes |
| main、index、ui/facility-chapter-hud | 顶部直达、目标提示、重开切章 | yes |
| tests、README | 行为验证和使用文档 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，退出 0 |
| node --test test/facility-chapter.test.ts test/facility-level.test.ts | yes | yes，11 / 11 |
| node --test test/settings.test.ts | yes | yes，21 / 21 |
| npm test | yes | yes，1514 / 1514，约 52 秒 |
| npm run build | yes | yes，仅现有大 chunk 提示 |
| 浏览器三章启动、输入、照明、入口与重开验收 | yes | yes，三章顶部直达；跳跃/喷水；预览进入正式章节；重开恢复弹药；设置固定环境；控制台无警告/错误 |

## Results
- 三章进入后直接运行正式模拟；每章 3 名守卫，清除并抵达出口后通关，失败可重开，前两章可继续下一章。
- 章节相机向上取景，室内补光和最低照明提高角色、平台与机柜可见性；预览和游戏复用工业场景、灯光与动画。
- 行为测试覆盖真实近战击败守卫且不复活、出口门槛、死亡/跌落失败、终态冻结，以及真实跑跳跨越深渊断桥。浏览器未手动打通三章；完整通关条件由逻辑测试验证。
- 子代理审查发现 HUD 拦截释放事件的卡键风险；已只拦截按下事件，keyup/mouseup 正常释放，定向复核 Approved。
- 实机截图位于 output/chapters/fortress.jpg、cathedral.jpg、abyss.jpg。浏览器停留第一章，进入即可操作。
- 早期全量验证遇到同期修改的 intro-finale 纯逻辑层引用 window；最终重新验证 1514 项全过。本任务未修改该文件。
- 本任务未提交或推送。
