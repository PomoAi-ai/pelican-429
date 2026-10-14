# FIX -- 原画资料库目录锚点

## Status: done
## Task: 392
## Related: N/A
## Baseline Commit: d2d72f4

## Problem
原画资料库（?mode=catalog&view=art-library）左侧目录点选条目时地址不变，无法用链接指认某个条目或版本；打开页面总是停在第一个条目。

## Root Cause
src/ui/art-library.ts:32 — `selected` 固定初始化为第一个条目，目录按钮的点击处理（:93）只改内存状态，不读也不写 `location.hash`。

## Fix Plan
- [x] src/ui/art-library.ts — 点选条目时把 `#条目id` 写入地址栏；挂载时与 `hashchange` 时按锚点选中条目（待核对条目自动勾选“包含待核对稿”），并把选中行滚入目录可视区；卸载时移除监听。

## Verification
- [x] npm run typecheck
- [x] node --test test/app-mode.test.ts — 2 passed
- [x] 浏览器：点选条目地址带锚点；直接打开带锚点的链接定位到该条目；待核对条目自动勾选筛选；未知锚点不改变当前条目
