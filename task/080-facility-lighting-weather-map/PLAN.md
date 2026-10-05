# PLAN -- 机房照明、气候、建筑与导览

## Status: done
## Task: 080
## Related: 079-facility-signal-streams, 078-facility-combat-readability
## Baseline Commit: 无 HEAD；本轮原件 $TMPDIR/pelican-lighting-before

## Goal
修复机房真实光照，增强连续电流和数据传输，室外雨夹雪、室内干燥；堡垒外墙封闭仅少数明确入口；完善章节小地图与更科学的机房结构。

## Acceptance Criteria
- 灯具、冷却液、电和数据连接照亮周边表面；角色和战斗面可辨。
- 电流有连续流动的亮带/拖尾，网络有有方向的数据列/包，不只漂浮数字。
- 堡垒外围雨夹雪，室内机房不下雨雪，游戏和预览共用。
- 堡垒实墙和少数入口可见且碰撞匹配，内部平台仍可下穿。
- 小地图显示真实建筑轮廓、平台、入口出口与玩家敌人，M 大地图可用。
- InfiniBand 表现为交换设备，GB300 是计算机柜；柜内 NVLink、柜间 InfiniBand；配电、液冷、维护通道有明确分区。

## Constraints
中文协作；按 dev/core-dev/core-test/Ponytail；不改 vendor；不提交推送；纯渲染和 UI 不写结构镜像测试。

## Decisions
- 原信号只有 MeshBasicMaterial 自发亮，灯条没有光源；共享 kit 添加固定预算的邻近局部光源，与信号/冷却同步。
- 原功能探索已完成；针对天气、地图、科学建筑派独立子代理完成探索、设计与实施，root负责共享渲染。
- 用户确认外墙封闭，只保留少数明确入口。
- 原机房只读逻辑确保内部平台下穿；仅外壳使用实心碰撞。
- NVIDIA NVL72 架构和冷却指南作为美术逻辑依据：柜内 NVLink、柜间交换网络、液冷供回路及冷热通道；保留2D游戏夸张尺度。
- 计算柜固定为每层单排正常高度，补足后景支承、维护走道、热回风、液冷 CDU 与 A/B 配电；InfiniBand 采用高密度光口与理线面板，设备名称为 IB SWITCH。
- 各组计算柜经实际 LEAF 上联本层 SPINE，再连接网络交换区；数据通路端点与设备光口位置对齐。
- 静态设备与移动信号分别共用最多 6 / 4 个点光源，按镜头邻近选取；保持渲染光源数量固定。灯光照亮表面，信号亮带沿线路连续推进。
- 外围只保留主入口、东侧出口、屋顶检修口；检修口上方增加雨棚，室内战斗平台继续可下穿。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | render/facility-kit, facility-signals, facility-lighting, app/facility-presentation | 真光照、流动、交换设备共享表现 | - | yes |
| 2 | config/facility-structure, world/facility-level, render/facility-* | 科学机房结构、实墙与门洞 | - | yes |
| 3 | app/precip-wiring, app/facility-environment, app/game-app | 室外雨夹雪和遮挡 | 2 | yes |
| 4 | ui/facility-minimap, ui/minimap, ui/facility-chapter.css, app/game-app | 章节专用底图与导览 | 2 | yes |
| 5 | README | 设备分工与最终操作说明 | 1,2,3,4 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，最终统一执行一次通过 |
| npm test | yes | yes，1532 tests / 305 suites，全部通过，无跳过 |
| npm run build | yes | yes，351 模块，4.40 秒 |
| 浏览器三章/室内外天气/地图/光照/动态信号检查 | yes | yes，1280×720 实机及 390×844 窄屏 |
| 独立代码审查 | yes | yes，光照/信号资源生命周期、建筑/碰撞/地图通过；发现的柜间直连缺口修复后专项复核通过 |

## Verification Notes
- 外墙阻挡、两侧门洞通过、屋顶不可下穿与检修洞可通过由新增的两个公开物理行为用例验证；已有室内平台下穿用例保留并通过。
- 天气代理验证屋顶列降水在 y=75 截止，检修口雨棚在 y=80 截止，内部 y=40 不露天；室外仍露天。相关既有天气测试 70 项通过。
- 浏览器查看三章局部光照、连续电流与数据流，画面保持可辨，观察时 FPS 为 60，控制台没有 error/warn。堡垒门外有雨雪与积雪，内部干燥。
- M 地图显示实体围护、三处入口与玩家/敌人/出口；窄屏地图和章节面板不重叠。
- 预览暂停后两次截图完全相同，恢复后帧变化；游戏和预览均复用共享模型与特效。
- 最终检查日志：`$TMPDIR/pelican-facility-final-tests.log`、`$TMPDIR/pelican-facility-final-build.log`。构建非阻断提示为主 JS 超过 500 kB 与 prepare-out-dir 耗时。
- 实机截图：`output/chapters/cathedral-facility-lighting.jpg`、`abyss-network-switching.jpg`、`fortress-sleet-lighting.jpg`、`fortress-weather-boundary.jpg`、`fortress-tactical-map.jpg`。
- 无 HEAD，按本轮备份逐文件核对范围；未修改 vendor、CI 或依赖；未提交、未推送。最终检查之后仅更新文档。
