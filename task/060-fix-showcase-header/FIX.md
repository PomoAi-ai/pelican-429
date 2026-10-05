# FIX -- 移除展示场宣传页头

## Status: done
## Task: 060
## Related: N/A
## Baseline Commit: 无（仓库尚无 HEAD，现有文件均未跟踪）

## Problem
展示场顶部宣传标题、说明和预览计数占用开发预览空间。

## Root Cause
src/ui/showcase-panel.ts 原第 250–256 行创建独立大页头，src/ui/showcase.css 为其设置额外留白。

## Fix Plan
- [x] 删除共享展示场页头及刷新逻辑，角色、资源和实验场统一精简。
- [x] 删除无用页头样式，工具栏保留紧凑间距。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1500 通过，0 失败
- [x] npm run build：通过；有 chunk 超过 500 kB 的体积提示
- [x] diff-guard：仅移除页头及关联代码，无新增防御逻辑或测试。
- 浏览器视觉验收待用户完成；本次为布局删减，不新增自动化 UI 测试。
