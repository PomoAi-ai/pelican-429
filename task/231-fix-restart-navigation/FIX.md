# FIX -- 顶部导航重头开始

## Status: done
## Task: 231
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
顶部导航增加“重头开始”，点击删除存档并从序章开始。

## Root Cause
index.html 顶部导航缺少重新开始入口；src/app/game-app.ts 离开页面时会保存进度，不能只在旧页面点击时删除。

## Fix Plan
- [x] index.html — 添加主线重新开始导航入口，复用导航样式及移动端顶层跳转。
- [x] src/app/story-app.ts — 新页面读取存档前删除主线存档，并移除一次性 restart 参数，保留用户设置。
- [x] src/ui/dom-language.ts — 添加英文文案。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1759 个测试通过，0 失败。
- [x] npm run build — 通过。
- [x] diff-guard：无新增兜底、内部防御检查或重复实现测试。
- 浏览器人工验收未执行；本次 UI 修改未新增自动化测试。
