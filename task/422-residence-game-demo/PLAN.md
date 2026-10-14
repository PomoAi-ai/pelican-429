# PLAN — AI住宅迁入正式场景演示

## Status: done
## Task: 422
## Related: 420, 421
## Baseline Commit: d2d72f4

## Goal
把AI住宅从透视检查移至场景演示，作为完整可游玩演示。透视恢复纯构件、房间组合、太阳能、液体及景深检查。

## Acceptance Criteria
- 场景演示主入口可进入AI住宅游戏演示；原瓦片、植物、风动等演示目录仍可使用。
- 住宅演示复用现有住宅运行与共享模型，保留2432格世界、昼夜、能量门、全息轮播及人物游玩。
- 默认跟随人物；体验建造可用但不读写原住宅存档，正式建造入口保留。
- 透视room目录移除AI住宅；不生成其城市、灯光、物理或专属控制。其余透视功能保持。
- 无运行时入口继续指向原透视住宅锚点。

## Non-goals
不改美术、尺寸、昼夜、战斗或存档格式；不新增独立模型/场景副本；不发布部署。

## Decisions
- 子代理探索并完成最小架构设计，main直接派发lab&demo=residence至共享startResidence；不将无卡片游戏场景强塞进SCENE_DEMOS。
- 沿用显式demo/saved运行模式：演示新建示例并仅保留内存改动，saved沿用原存档。属于可回退本地调整，直接实施。
- 场景导航主入口指向新游戏演示；原?mode=lab卡片目录保留，新增住宅演示链接，两者互通。
- 移除透视中的住宅分支与预加载；透视布局坐标从0开始。
- 探索与设计已合并形成清单，跳过重复设计轮；不需要用户确认。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/main.ts | 路由派发与游戏布局 | yes |
| src/app/residence-app.ts | 共享demo/saved运行、跟随与存档隔离 | yes |
| src/ui/residence-hud.ts | 游戏演示标题/操作与入口 | yes |
| src/app/definition-scene-layout.ts | 移除住宅实体与API | yes |
| src/app/room-scene-preview.ts | 恢复纯透视控制与光照 | yes |
| src/config/site-directory.ts | 场景演示主导航 | yes |
| src/ui/showcase-panel.ts / showcase.css | 演示目录增加住宅链接 | yes |
| src/ui/residence.css | 工具栏换行，防止窄窗口画布溢出 | yes |
| test/residence.test.ts | 删除已移除目录住宅装配的专属测试，保留共享门/太阳能行为覆盖 | yes |

## Validation
- [x] npm run typecheck：通过
- [x] npm test：1903项，1902通过；唯一失败仍为原有 architecture.test.ts:232 将 art-library.ts:606 文案中的 window 判作 DOM 使用，本次未修改该文件/断言。
- [x] npm run build：通过；修复浏览器中发现的工具栏 CSS 溢出后再构建通过，仅既有 chunk 大小提示。
- [x] 浏览器新演示：默认跟随、D移动入室、空格跳跃、E关闭/开启、正午/星夜、目录往返；无控制台错误。临时放置后1038→1039，重新进入后恢复1038，保存按钮不显示。
- [x] 浏览器透视：目录19项无住宅，整砖单间恢复；子代理实例化遍历19分区并验证21太阳能板的实际落脚。
- [x] 子代理只读复核：Approved，无确定性问题；git diff --check通过。

## Evidence
- 本次文件修改前基线：`/private/tmp/residence-demo-move-start/`，聚焦diff：`/private/tmp/residence-demo-focused.diff`。
- 浏览器截图：`/private/tmp/residence-demo-verification/{day,night,perspective,demo-directory}.png`。
- 测试/构建日志：`/private/tmp/residence-demo-{tests,build}.log`。
- 两种门方向的通行/关门占位测试、太阳能连续承重及离开追光测试均通过；删除的旧测试仅验证已被用户要求移除的目录住宅装配。
- 存档隔离由共享save入口与demo初始化分支完成，子代理复核；没有操作用户的正式住宅存档。
- 未提交、推送或部署；沿用现有发布入口范围。本次不更改美术与全息动画。
