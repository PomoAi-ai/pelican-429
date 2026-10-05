# FIX — 同种树变化演示支持统一切换树种

## Status: done
## Task: 012
## Related: 010, 011
## Baseline Commit: 无 HEAD；修改前快照 $TMPDIR/pelican-012-*.before.ts

## Problem
“05 · 同种树的变化”需要直接切换比较的树种，同时保留不同种子的对照。

## Root Cause
src/config/scene-demos.ts 的 seeds 演示初始化四张橡树；src/ui/showcase-panel.ts 仅提供单卡树种切换，缺少整组树种选择。

## Fix Plan
- [x] 在 seeds 演示中显示统一树种选择，直接读取游戏共享资源目录全部树种。
- [x] 复用 changeAction 切换当前卡片，保留各自种子、环境和其他设置；其他演示不显示该控件。
- [x] 演示说明调整为可切换树种。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1465 项通过，0 失败。
- [x] npm run build：通过，原有 bundle 大小提示仍存在。
- [x] 浏览器检查全部 9 种可选；切换樱花树、松树后四卡同种且种子仍为 429/430/431/432；风动演示隐藏统一树种控件，错误日志为空。
- [x] diff-guard：对比修改前快照，仅更改演示 UI 与说明，不新增渲染实现、防御检查或复述实现的测试。
