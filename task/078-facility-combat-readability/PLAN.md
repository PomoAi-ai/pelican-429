# PLAN -- 机房战斗比例、冷却设施与可下穿平台

## Status: done
## Task: 078
## Related: 069-playable-facility-chapters
## Baseline Commit: 无 HEAD；本轮原件 $TMPDIR/pelican-combat-before

## Goal
调整三章的角色与设备视觉比例、战斗照明，补充有循环流动状态的冷却液设施和设备灯；所有玩家平台都可下穿并能返回。

## Non-goals
不新增敌人/Boss 系统、不修改全局角色物理、不增加依赖、不提交发布。

## Acceptance Criteria
- 机柜采用合理尺寸模块，保留巨型建筑和阵列；镜头能清楚辨认角色与攻击。
- 主路、侧台、底层检修台均可 S/下方向键＋空格下穿；下方有可見空间、安全地面和返回路线。
- 冷却液罐、管道有可见液体与流动动画，设备灯和照明突出可战斗区域。
- 游戏与机房预览复用资源；通过行为检查与浏览器实际画面验收。

## Constraints
遵循 AGENTS.md、dev/core-dev/Ponytail；不改 vendor；不为视觉样式写自动测试；渲染和物理共享平台数据。

## Decisions
- 当前章结构已有完整探索；继续复用正式游戏与共享 FacilityKit，无新架构分歧，直接实现。
- 子代理确认下穿失败来自工业地基整列实心填充，并非下穿物理故障；清空地基上部，保留底部2格安全地面，补齐维护返回踏板。
- 深渊底层成为可探索维护区，跌落失败阈值改为地图以下，不在到达底层前判失败。
- 单柜尺寸通过大机柜矩阵拆分实现，不缩放整张地图；战斗镜头拉近，角色和物理比例保持统一。
- 冷却液为场景循环设备的视觉表现，置于玩家后方，不引入水体伤害或新的流体机制。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | config/facility-scenes、world/facility-level、sim/facility-chapter、相关测试 | 下穿与安全返回 | - | yes |
| 2 | render/facility-kit | 标准机柜阵列、冷却液罐/管流、灯具 | - | yes |
| 3 | render/facility-fortress、facility-cathedral、facility-abyss | 后墙透空、设备布置、战斗区域照明 | 1,2 | yes |
| 4 | app/facility-presentation、ui/facility-chapter-hud、facility-chapter.css、README | 战斗镜头补光、操作提示与说明 | - | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| 下穿复现与相关章节行为测试 | yes | yes，旧实现8项失败；修复后相关测试20/20 |
| npm run typecheck | yes | yes，exit 0 |
| npm test | yes | yes，1530/1530，305套件，约51秒 |
| npm run build | yes | yes，346模块；仅主包体积与插件耗时提示 |
| 浏览器三章比例、照明、冷却液与实际控制 | yes | yes，三章画面检查、第三章跳跃/喷水、预览冷却深井检查，控制台无错误 |

## Results
- 镜头距离从60改为44，取景偏移降低，腾出下方空间以观察下穿落点；章节面板缩小并明确显示 S＋空格。
- 单柜控制在约2.6×5.2格以内，巨型机柜分解成阵列；保留建筑规模和关卡长度。
- 工业地基改成后墙、细支撑与安全底面；三章新增下层维护踏板。全部玩家踏板沿用单向平台，不改全局物理。
- 共享资源加入透明青绿液位、气泡、缓慢管流和暖白灯具；真实局部光源接近主战斗层，室内环境补光提高。
- 8组真实模拟回归验证三章代表性主路/底台下穿至安全底面并飞回主路；未逐一自动验证全部高台返回路线。浏览器组合键自动输入未形成持续按住，故下穿结果以真实模拟输入测试为依据，不宣称浏览器手动全路线通过。
- 审查子代理 Approved，无高置信问题；测试子代理完成全部最终检查。
- 新实机截图 output/chapters/cathedral-combat.jpg、abyss-combat.jpg；共享深井预览 output/chapters/abyss-cooling.jpg。
- 原游玩页保留，临时验收页面和临时窗口尺寸已清理；未提交或推送。
