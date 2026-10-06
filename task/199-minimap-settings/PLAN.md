# PLAN -- 小地图显示、透明度与设置入口

## Status: done
## Task: 199
## Related: 191
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Goal
小地图可以隐藏并调节透明度，设置入口位于小地图边缘且不随地图隐藏或变透明；设置面板提供明显、滚动时仍可用的关闭按钮。

## Non-goals
不改地图绘制、战斗、世界生成或部署。

## Acceptance Criteria
- 设置中调整小地图显示与不透明度，立即生效并保存。
- 隐藏小地图、切换大地图后，设置入口始终可用；不会意外重新显示已隐藏的小地图。
- 设置关闭按钮至少44px高、带文字，滚动后仍可见；菜单不遮挡设置。
- 普通场景、自由世界、移动布局沿用同一设置与地图逻辑。

## Constraints
复用现有设置表、控制器与存储；不新增依赖，不修改已有用户改动，不推送。

## Decisions
- 探索及设计由 explorer 子代理完成：确认 gear 被 control-surface 隐藏，mini 在 mobile 被强制隐藏，菜单和自由世界偏移需协调。
- 独立 gear 保留在地图外；位置跟随18vh地图下缘，地图隐藏时回到右上。地图透明度只作用 mini，设置入口保持不透明。
- 两个设置项 minimapVisible 与 minimapOpacity；后者为0–100的不透明度，默认75%，避免“透明度”方向歧义。
- 关闭按钮使用现有控制器，改为文字与44px目标；标题栏sticky，面板层级覆盖菜单。
- 方案为可逆局部UI改动，无需设计审批。
- 设置实现由core-dev子代理完成，地图与布局由主代理实现；core-review/diff-guard子代理审查通过。
- 小地图用户偏好用hidden保存，保留大地图原有display切换；两者独立，关闭大地图不会覆盖隐藏偏好。
- 浏览器已验证760×1196与844×390布局：35%透明度即时生效，隐藏地图后设置可用，切换大地图仍保持隐藏，手机横屏滚动后顶部关闭按钮可见并可点击。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/game-settings.ts | 定义显示及不透明度设置 | — | yes |
| 2 | src/ui/settings-model.ts | 运行时设置路由 | 1 | yes |
| 3 | src/app/settings-wiring.ts | 默认值与地图运行时接线 | 1,2 | yes |
| 4 | src/ui/settings-panel.ts | 双语设置文案与明确关闭按钮 | 1 | yes |
| 5 | src/ui/minimap.ts | 独立可见性及透明度，保留大地图行为 | — | yes |
| 6 | src/app/game-app.ts | 恢复保存的小地图设置 | 3,5 | yes |
| 7 | index.html / src/ui/navigation.css / src/ui/control-surface.css / src/ui/free-world.css | 设置入口与菜单定位、面板层级与sticky关闭栏 | 4,5 | yes |
| 8 | test/settings.test.ts / test/minimap.test.ts | 设置应用持久化与大小地图可见性行为 | 1–6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| node --test test/settings.test.ts test/minimap.test.ts | yes | yes，57/57 |
| npm test | yes | yes，1730/1730 |
| npm run build | yes | yes，仅包体积/插件耗时提示 |
| core-review + diff-guard | yes | yes，无需修改的发现，diff --check通过 |
| 浏览器布局检查 | yes | yes，截图见evidence目录 |
