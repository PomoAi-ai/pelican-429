# PLAN -- 游戏顶部按钮与 HUD 统一

## Status: done
## Task: 225
## Related: 222, 224
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Goal
菜单和设置固定在游戏右上角，沿用游戏技能按钮的圆形暖金边框、深色底和暖白图标。

## Non-goals
不修改菜单行为、游戏逻辑或资源；不提交推送。

## Acceptance Criteria
- 两按钮同尺寸、同风格，在 PC 和手机横向布局均位于游戏顶部。
- 地图在按钮下方，不遮挡点击区；隐藏地图不会改变按钮位置。
- PC 菜单展开顶部导航、再次点击或回到画布收起；设置正常打开。

## Decisions
- 探索与设计合并为一次子代理检查：此前任务已覆盖交互链路，本轮仅修改三个样式文件。
- 删除依赖地图高度的按钮定位，复用导航高度为顶部偏移。
- 按钮视觉尺寸 32px，点击范围 44px；小地图向下留出 48px。
- UI 按仓库约定使用浏览器验收，不新增自动测试；无需要用户批准的设计分歧。
- 复核发现菜单父层级低于地图以及伪元素点击范围不足，已提升操作层至 z-index:6，并通过 inset:-8px 实现实际 44px 点击区。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | index.html | 两按钮共用 HUD 样式及设置顶部定位 | — | yes |
| 2 | src/ui/control-surface.css | 菜单顶部定位、弹层间距、地图避让 | 1 | yes |
| 3 | src/ui/navigation.css | 删除旧地图高度驱动的按钮偏移 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1759 通过，0 失败 |
| npm run build | yes | yes — 最终 CSS 修复后通过；保留大 chunk 提示 |
| 浏览器 PC / 手机外观及交互 | yes | yes — 1280×720 / 844×390、主线及自由世界、菜单收起/展开、设置、地图显隐 |
| 本轮增量复核及 git diff --check | yes | yes — 两处复核问题已修复，并实测菜单点击及 44px 点击区 |
