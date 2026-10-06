# FIX -- 游戏血量显示两位小数

## Status: done
## Task: 251
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
游戏血量值固定显示小数点后两位。

## Root Cause
src/ui/weapon-hud.ts:151、src/ui/hud.ts:316、src/ui/boss-arena-hud.ts:51 使用 Math.ceil 显示整数；剧情血条无障碍文本直接插入原始数值。

## Fix Plan
- [x] 四处游戏血量文本使用 toFixed(2)，当前血量与上限格式一致；保留模拟数值与血条比例。
- [x] 纯显示格式调整，不新增复述格式化实现的测试。
- [x] diff-guard：只修改显示文本，无额外防御检查、异常处理或依赖。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1772 项通过，0 失败。
- [x] npm run build：通过；有 chunk 大小与插件耗时提示。
- 浏览器人工视觉验收未执行。
