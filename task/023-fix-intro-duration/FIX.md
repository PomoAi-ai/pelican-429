# FIX -- 精简序章时长与文字

## Status: done
## Task: 023
## Related: 022
## Baseline Commit: 无 HEAD

## Problem
用户要求去掉年份，缩短序章。

## Root Cause
现有序章为40秒，节点显示年份并在底部绘制年份时间线。

## Fix Plan
- [x] config/intro、intro-canvas — 删除年份数据与绘制，乐谱按1.6倍推进，总长25秒，20秒开始进入首幕。
- [x] intro-audio — 统一转换乐谱时间和播放时间，保持音高及暂停/拖动同步。
- [x] intro-app — 总时长、进度、提示与乐段名称同步。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器检查无年份、25秒时长、跳至首幕

## Results
类型检查、1471项测试、构建通过；构建保留已有的大包提示。浏览器确认无年份及底部时间线，总时长25秒、GPT约7.5秒出场、首幕与播放控件正常，日志无错误。未新增测试；按 diff-guard 检查本次修改无新增兜底或吞错，未提交推送。
