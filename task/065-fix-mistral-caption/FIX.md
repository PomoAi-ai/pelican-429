# FIX -- 简化Mistral彩蛋

## Status: done
## Task: 065
## Related: 064
## Baseline Commit: 无HEAD

## Problem
用户要求彩蛋只写“在睡觉”，去掉直白的主角对比句。

## Root Cause
src/render/intro-finale.ts 的Mistral彩蛋包含两行说明性吐槽。

## Fix Plan
- [x] 保留型号，改为“Mistral Medium 3.5 · 在睡觉”。
- [x] 删除“法国代表友情客串”及整句“主角在改写世界，我在润色开场白。”。

## Verification
- [x] npm run typecheck、npm run build 通过（构建保留大 chunk 提示）。
- [x] npm test：1504 通过、1 失败；失败为世界生成耗时检查，与本次字幕修改无关。单独运行 node --test test/worldgen.test.ts 后同一性能检查仍失败，未修改相关实现或断言。
- [x] 浏览器暂停在 13.5 秒确认只显示“Mistral Medium 3.5 · 在睡觉”，整句主角对比文案已删除；截图 $TMPDIR/pelican-mistral-sleep-detail.jpg。
- [x] diff-guard：仅调整字幕并删除多余一行，没有新增防御代码或测试。
