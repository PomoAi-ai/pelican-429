# FIX -- 顶部按钮视觉对齐

## Status: done
## Task: 226
## Related: 225
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
顶部按钮图标视觉中心不一致，按钮与地图右边缘未对齐。

## Root Cause
菜单使用继承字体的 ☰，设置使用浏览器按钮默认 Arial 的 ⚙，字符字面大小与基线不同；设置 right:20px，地图 right:12px。

## Fix Plan
- [x] 两入口使用相同 24 单位 viewBox、16px 方形 SVG、相同描边和居中规则。
- [x] 按钮组右边缘与地图、设置面板统一为 12px，保持 44px 中心间距和点击区。

## Verification
- [x] 浏览器 PC 与手机按钮外框及图标中心测量、点击验收：外框 top:12px、图标 top:20px，图标相对外框中心偏差均为 (0, 0)；手机按钮及地图 right 均为 832px。
- [x] npm run typecheck、npm test、npm run build 通过；1759 个测试通过，0 失败。
- [x] 本轮 diff-guard 及 git diff --check 通过，仅修改图标展示及右侧间距。

UI 不新增自动测试；不提交推送。
