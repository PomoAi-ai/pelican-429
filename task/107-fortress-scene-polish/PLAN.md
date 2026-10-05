# PLAN -- 第一章堡垒场景优化

## Status: done
## Task: 107
## Related: 096, 099-fix-fortress-entry-platform, 100
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-fortress-polish-before

## Goal
优化第一章入口与机房视觉层次、可站立面的辨识度及渲染成本；重新制作现代科幻背景与左侧黑洞表现。

## Non-goals
不重做角色/NPC，不改变路线、死亡规则、跳跃距离或外墙通道；不改其他章节设计。

## Acceptance Criteria
- 堡垒可通行台面与普通方块前沿深度统一，入口和踏台轮廓清晰。
- 背景从奇幻城堡转为现代科幻算力设施、巨构与冷却工业区；入口立面和室内分区具有层次，降低设备灯白绿亮斑与过曝。
- 左侧从蓝色旋涡石门改为黑色核心、薄光环及吸积盘视觉，保留入口位置和通行规则。
- 局部照明切换平滑，不增加固定灯数量；风扇叶片采用实例批次。
- 透明致命池、既有 NPC、雨夹雪、下穿平台与小地图正常。

## Decisions
- explorer 子代理及浏览器共同确认：平台前沿 z0.5～2.7 混用、4+2 灯池直接跳切、10 风扇使用 50 个独立叶片 Mesh。
- 探索已给出文件级最小方案，沿用共享渲染链，无须另开架构轮次或新增依赖；用户未要求先看方案，无审批停止条件。
- 渲染效果用浏览器验收，不添加网格/材质细节测试；路线配置仅调整 z/depth，沿用现有行为测试。
- 灯具强度仅在堡垒调低；共享灯池与风扇批处理修复使游戏及预览同步。
- 根据用户继续完成的要求，使用内置 imagegen 重制现代工业科幻远景与透明黑洞图；新资产及完整提示词分别保存到 public/environments 与 assets/environments，游戏/预览复用同一渲染。
- 黑洞保留图片自身的黑核、吸积盘和透明外缘，只叠加缓慢亮度流动；不使用会裁断吸积盘的额外圆形遮罩。
- 堡垒设备灯调至默认强度 65%；固定 4+2 灯池使用距离滞回与原地淡出/换灯/淡入，暂停动画时仍响应镜头。
- 十组风扇叶片由 50 个独立 Mesh 合为 10 个实例批次；无新增依赖或运行时灯数量。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/facility-scenes.ts | 通行台面统一普通方块深度，保留厚屋顶 | — | Yes |
| 2 | src/render/facility-approach.ts | 透明黑洞、悬崖近景及踏台边缘辨识 | — | Yes |
| 3 | src/render/facility-fortress.ts | 入口立面、背景分区和柔和灯光 | 1 | Yes |
| 4 | src/render/facility-sky.ts、public/environments、assets/environments | 重绘并接入现代科幻远景与黑洞素材，保存提示词 | — | Yes |
| 5 | src/render/facility-kit.ts | 风扇叶片实例批次及时间传递 | — | Yes |
| 6 | src/render/facility-lighting.ts | 固定灯池稳定选择、柔和换灯 | 5 | Yes |
| 7 | src/app/facility-presentation.ts | 两张素材的加载、失败清理与共享装配 | 2, 4 | Yes |
| 8 | src/ui/facility-minimap.ts、src/ui/facility-chapter-hud.ts、README.md | 黑洞前哨命名及素材/场景说明 | — | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Yes，通过 |
| npm test -- --test-concurrency=4 | yes | 已运行：1527/1528 通过，世界生成性能中位数 397.7ms 超过 250ms |
| node --test test/worldgen.test.ts | 超时项复查 | Yes，关闭临时渲染页后 29/29 通过；未调整阈值或测试断言 |
| npm run build | yes | Yes，通过，保留既有 chunk 超过 500KB 提示 |
| 浏览器预览与游戏、基础机房风扇 | yes | Yes；新素材、平台前沿、透明液体、小地图及基础机房正常，控制台无 warn/error；暂停动画时换视角照明有效 |
| 子代理审查 | yes | Approved；资源释放、固定灯池、平台深度与改动范围无新增阻断 |

## Result
- 两张重制图片已接入真实章节与共享预览，无新增渲染细节测试。
- 实际截图：output/chapters/fortress-sci-fi-outpost.jpg、fortress-sci-fi-entry.jpg、fortress-sci-fi-game.jpg。
- 保留既有可下穿平台、外墙入口、透明致命冷却液、室外雨夹雪、数据流与小地图；未改 NPC 和路线逻辑。
- 未提交或推送。
