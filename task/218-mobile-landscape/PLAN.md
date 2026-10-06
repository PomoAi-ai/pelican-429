# PLAN -- 手机端固定横向游戏画面

## Status: done
## Task: 218
## Related: 217
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Goal
手机游戏忽略设备方向，始终直接呈现横向画面，去掉要求玩家旋转设备的阻挡引导；保留顶部收起和紧凑设置入口。

## Non-goals
不改游戏逻辑、资源或非游戏展示页面，不提交和推送。

## Acceptance Criteria
- 手机竖屏时画面、HUD、摇杆、技能按钮和弹窗一起横向显示；横屏时正常铺满。
- 转动设备只调整视口，不重新加载游戏或丢失进度。
- 原生触控、拖动瞄准、地图与导航都使用一致坐标。
- 游戏导航、种子、快速旅行地址及回到首页保持正确。
- 没有强制横屏引导；顶部收起和小齿轮正常。

## Constraints
按仓库规定 UI 不增加自动测试，执行类型检查、现有全量测试、构建与浏览器验收；保留所有既有工作区改动。

## Decisions
- 子代理完成 viewport/触控/地图/弹窗探索，推荐同源 iframe 横向视口，父页面只负责尺寸与旋转。浏览器原生统一子页面的 CSS viewport、事件坐标与顶层弹窗，避免跨多个模块手工坐标变换。
- 游戏入口在手机上创建一层框架，子页面直接运行现有游戏；旋转不重建框架。站内跳转回顶层，replaceState 同步框架与地址栏。
- 用户已明确方向要求，没有方案分歧或仓库外影响，直接实施。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes — passed |
| npm test | yes | yes — 1756 passed, 0 failed |
| npm run build | yes | yes — passed，既有大 chunk 提示 |
| 浏览器竖屏/横屏、导航/设置/触控检查 | yes | yes — 390×844 / 844×390 手机模拟通过 |
| core-review + diff-guard 本次增量 | yes | yes — 子代理复核无新发现 |

## Implementation
| Area | Result |
|------|--------|
| 手机游戏视口 | game/story/controls 的顶层粗指针设备创建同源 iframe，CSS 固定横向视口；竖屏整体旋转，设备方向变化不重载 |
| 地址与导航 | iframe 内链接回顶层；世界/设置/剧情程序跳转使用宿主窗口，种子和快速旅行地址同时更新内外层 |
| 全屏与触控 | 菜单保留可用时的全屏入口并显示失败原因；移除旋转引导及竖屏控件隐藏，演示操作说明常驻 |

## Browser Evidence
- portrait.jpg / landscape.jpg：同一横向逻辑视口随手机方向显示，顶部默认收起且设置入口紧凑。
- 方向切换前后 iframe loaderId 保持相同，设置面板和当前游戏状态保留，没有重载。
- 旋转画面下摇杆拖动、导航把手、设置点击正常；大地图打开/关闭正常。
- 快速旅行后父子地址都切换到 region=forest；返回营地仍保持同步。
- 点击首页退出游戏框架，浏览器返回一次即回到游戏。
- 使用浏览器手机模拟验收，未进行实体 iOS/Android 设备测试；原生全屏请求未实机验收。
