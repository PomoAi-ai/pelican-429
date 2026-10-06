# FIX -- 修复 source-map-js 开发依赖安全漏洞

## Status: done
## Task: 284
## Related: N/A
## Baseline Commit: e5f84bd2b436b2546dcbd18c59d07db74bb2ba0d

## Problem

首次发布的依赖扫描发现 source-map-js 旧版本存在索引 source map 偏移量处理导致的拒绝服务漏洞。

## Root Cause

package-lock.json:1216 — Vite 经 PostCSS 引入的 source-map-js 锁定为 1.2.1，低于已修复的 1.2.2。

## Fix Plan

- [x] 仅更新 package-lock.json 中的 source-map-js 至 1.2.2，不新增直接依赖。

## Verification

- [x] npm ls source-map-js — Vite → PostCSS → source-map-js@1.2.2。
- [x] npm run typecheck — 通过。
- [x] npm test — 1793 项测试、301 个测试组全部通过，无失败或跳过。
- [x] npm run build — 通过；静态产物 922,815,096 字节，低于 Pages 1 GB 上限。
- [x] npm audit --json — 0 项漏洞。
- [x] 审查锁文件 diff，确认仅目标依赖版本、下载地址和完整性摘要变化；package.json 未变，diff-guard 无发现。
