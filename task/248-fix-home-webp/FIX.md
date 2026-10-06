# FIX -- 首页背景 WebP 压缩

## Status: done
## Task: 248
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
首页四张背景使用 WebP，总文件大小不超过 300,000 字节，游戏保持不变。

## Root Cause
src/app/home-hero.ts:36 与游戏共用默认 KTX2 加载入口，需为首页显式选择 WebP。

## Fix Plan
- [x] 首页显式选择 WebP，共用现有加载、材质和场景逻辑；游戏、序章和预览保持默认加载方式。
- [x] 从原 PNG 压缩四张首页 WebP，缩放到 1020×680，保留透明通道，更新资源说明。

## Verification
- [x] 文件总量 268,238 字节，小于 300,000 字节。
- [x] npm run typecheck
- [x] npm test（1772 通过，0 失败）
- [x] npm run build（通过，有 chunk 大小提示）
- [x] 检查本次差异，无新增防御性检查或低价值测试。

- [x] 浏览器首页实时场景显示正常，home-hero-ready 已就绪，控制台无 error。
- 未新增测试：本次为首页资源格式与压缩调整，不添加源码或渲染细节断言。
