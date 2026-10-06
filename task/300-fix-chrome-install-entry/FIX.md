# FIX -- Chrome 安装入口消失

## Status: done
## Task: 300
## Related: 298
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
Chrome 的游戏内安装按钮不稳定出现。

## Root Cause
control-surface.ts 将非移动端的入口显示绑定到 beforeinstallprompt 事件；局域网 HTTP、尚未满足安装提示条件或一次性事件被消费后都会隐藏入口。

## Fix Plan
- [x] 所有平台保持安装入口；只有明确收到安装完成事件或处于独立／全屏模式才隐藏。
- [x] 原生安装事件可用时直接提示，否则保留现有手动引导。

## Verification
- [x] npm run typecheck、npm test、npm run build 通过；构建保留 chunk 大小提示。未做新的浏览器点击验收。
- [x] Diff Guard：仅移除过度限制，没有新增防御分支或复述实现的测试。
