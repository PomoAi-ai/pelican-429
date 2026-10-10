# PLAN -- 完整空间分层演示

## Status: done
## Task: 364
## Related: 359
## Baseline Commit: 975f136

## Goal
把只有平地和重复墙面的初版扩成足够展示空间层次的可玩场景；近景、两层背景格、多层远景及天空可分别辨识和观察。

## Non-goals
不改主线关卡、战斗、存档；不引入依赖，不提交推送。

## Acceptance Criteria
- 三种题材各有多个不同构图段落，具有真正的开口、遮挡、前景和远景内容。
- 保持正常玩家行走跳跃；提供沿路线的快速观察点。
- 显式标出层序，并能逐层隐藏、恢复和斜向观察纵深。
- 天空日月星云继续可切换；不能让满屏背景墙挡掉远景。
- 浏览器验证视觉、切换和玩家输入；检查现有测试、类型和构建。

## Constraints
场景资源复用现有共享构件与树木、远山、天气。保留其他任务并发变更。

## Decisions
- 上轮探索已覆盖宿主、玩家、环境生命周期，复用该结果，追加架构子代理聚焦内容与观察接口。
- 本轮按三种主题各三个观察段落扩展；逐层显隐与侧向观察让用户能够验证层次。
- 渲染和UI人工验收，不新增网格或文案断言测试。
- 架构建议保留48格路径，按入口/中央开口/右端分三段，避免单纯增加地图长度。前景稀疏放置，背景开口交错，各层轮廓和内容有差异。
- 层清单固定8项，显隐与主题选择分开存储；洞穴禁用天空项但保留勾选。侧向观察用环境深度构图，排除天体半径。
- 不存在不可逆操作或需裁决的方案分歧，直接实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/definition-depth-layout.ts, src/render/stage.ts | 丰富三场景与观察点、近景和多层内容、层显隐与具名山层引用 | — | yes |
| 2 | src/app/room-scene-preview.ts, src/ui/room-scene-preview.css, src/app/perspective-controls.ts | 分层目录、观察点、空间总览与暂停切点同步 | 1 | yes |
| 3 | test/perspective-player.test.ts | 九个观察点出生支撑与行走验证 | 1 | yes |
| 4 | docs/depth-definitions.md, public/concepts/depth-definitions.md | 更新实际演示能力 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass（并发太阳接口落盘后复验退出0） |
| npm test | yes | pass：1861/1861，301 suites，0失败/跳过 |
| npm run build | yes | pass：1.45s，已有大chunk提示 |
| 浏览器三场景、观察点、逐层显隐、日夜及玩家走跳 | yes | pass |

## Validation Results
- 子代理定向执行 `node --test test/perspective-player.test.ts`：7/7通过，覆盖全部九个观察点出生支撑与路径前进。
- 子代理审查发现暂停切观察点未同步模型、侧看视图在resize时丢失、窄画布距离被OrbitControls钳制；均已修复，浏览器验证暂停切到第三点模型随行，893/1200视口切换仍保留侧看。
- 浏览器确认三种主题、中央岩桥/右侧街区/深洞厅观察点、移动跳跃、近背景隐藏后显露远层；切场景及夜晚后复核该层仍未勾选；洞穴禁用天体云项，恢复图层可重新显示。
- 首次typecheck遇到其他任务正在修改太阳能接口的3项错误，未越界改动，随后重跑退出0。全量测试与构建各执行一次，不改断言或阈值。
- 树木参数遵守共享TreeView边界：局部树列非负整数、根组还原横向偏移、整数冠高。其他树种在本次画面中呈裸杆，场景只选已验收的共享松树，未修改公共树模型。
- 复用并保留同时更新的控制面板布局，观察点和八层开关位于「控制面板」。未主动跨会话通信。
- 截图：buildings-depth.png（侧向层距及宽视口验证）、valley-play.png（最终松林与可玩画面）。临时视口已恢复。

## Delivery
`http://127.0.0.1:5174/?mode=resources&scene=depth`。三个主题、九处观察点、八项独立显隐、侧看层距；玩家正常进入。当前仍为共享构件装配的空间演示，不增加自动昼夜或新树种资源。未提交、推送或部署。
