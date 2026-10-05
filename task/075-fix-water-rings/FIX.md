# FIX -- 去除浮萍白色套圈

## Status: done
## Task: 075
## Related: N/A
## Baseline Commit: 无（当前仓库尚无提交，原文件已存于 $TMPDIR/pelican-water-before）

## Problem
截图中浮萍周围出现明显白色椭圆圈，脱离水面、不自然。

## Root Cause
src/render/water-ripples.ts 原 20–24、267–276 行：为漂浮植物绘制常驻完整白环，环面向镜头倾斜 0.38 弧度；环带宽达半径的 20%。

## Fix Plan
- [x] 删除常驻植物泡沫环及 world-views 对应数据装配。
- [x] 短暂涟漪放平、变细、减淡，保留入水水花与游动反馈。
- [x] 同步现有测试调用，移除已取消泡沫环的计数断言；不新增视觉参数测试。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1519/1520 通过；唯一失败为世界生成耗时 437.2ms 超过 250ms，单独重跑 node --test test/worldgen.test.ts 后 29/29 通过（未改断言）
- [x] npm run build — 通过，存在 chunk 大小与构建插件耗时提示
- [x] 浏览器检查浅水洼地实际画面，未见常驻套圈；未复现原截图机位及完整游动过程。
- [x] 以 /tmp 原文件逐文件比较，diff-guard 检查无新增防御逻辑或低价值测试。子代理独立确认白圈根因。
