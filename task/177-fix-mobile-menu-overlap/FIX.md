# FIX -- 手机剧情模式语言与菜单重叠

## Status: done
## Task: 177
## Related: 160
## Baseline Commit: 3a35077

## Problem
右上语言下拉框遮挡游戏菜单按钮。

## Root Cause
剧情模式导航高度为0，语言框固定top8px，手机菜单top18px导致垂直重叠。

## Fix Plan
- [x] 仅剧情手机布局将菜单top设为52px，位于语言框下方。

## Verification
- [x] CSS局部调整，无新增逻辑或测试；diff-guard无多余代码。
- [x] 剧情手机模式844×390实测语言框bottom36.5，菜单top52，间距15.5px；截图preview.png。仅CSS定位改动，未运行类型检查、测试或构建。

## 任务提示框外观
- 按用户截图要求，将story-hud背景不透明度从91%调为50%，文字保持不透明。浏览器计算样式rgba(9,27,36,0.5)验证通过，截图translucent-hud.png。仅CSS颜色调整，未运行测试或构建。
