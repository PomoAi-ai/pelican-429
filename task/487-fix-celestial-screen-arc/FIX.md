# FIX -- 日月改为整屏弧线

## Status: done
## Task: 487
## Related: 481
## Baseline Commit: c292d188

## Problem
天上的日月只在画面中间一小块区域移动。横向约从画面宽度的 37% 走到 59%，最低点在画面正中；家园里还被再压缩一次。玩家看不出太阳是在横穿天空。

## Root Cause
- `src/core/calendar.ts:140-141`：`celestialSunDirection` / `celestialMoonDirection` 沿用旧版为固定构图做的小弧线，x 取值 ±.12，y 在 −.015 到 +.185 之间，最终按世界方向摆放。
- `src/render/celestial-sky.ts:76-78`：`horizon`、`scale` 只是把这段小弧线整体再压缩，并没有按屏幕来定位。

## Fix Plan
采用泰拉瑞亚式的整屏弧线：
- [x] `src/core/calendar.ts`：改为输出屏幕弧线坐标 `celestialSun` / `celestialMoon { x, y }`。
  - x 从 −1.1（左边缘外）走到 +1.1（右边缘外），随时间匀速移动。
  - y 是相对起落线的高度，单位为画面高度的比例。
  - 太阳弧高随季节的仰角上限变化：夏约 .45、春秋约 .36、冬约 .25。月亮弧高固定 .32。
- [x] `src/render/celestial-sky.ts`：日月星放进一个随相机朝向旋转的组，按镜头的 fov 和画面宽高比换算到屏幕位置。
  - 选项改为 `{ radius, horizonLine }`，`horizonLine` 是起落线在画面中的高度，默认 .45。
  - 星星按屏幕均匀分布在起落线以上。
  - `setSunDirection` 继续按世界方向摆放，检查页的行为不变。
- [x] `src/render/free-world-daylight.ts`：改传 `{ radius: 180, horizonLine: .5 }`。
- [x] `test/calendar.test.ts`：断言日出时太阳在左边缘、正午在正上方、日落时在右边缘，且夏季弧线高于冬季。
- [x] `public/concepts/world-time.md`：补写日月轨迹规则。

## Verification
- [x] npm run typecheck
- [x] node --test test/calendar.test.ts test/architecture.test.ts
- [x] npm test、npm run build（改动涉及公共模块）
- [x] 浏览器：住宅和家园的日出、正午、日落，以及月亮的夜间轨迹

## Result
- 运行检查：
  - `npm run typecheck` 通过。
  - `node --test test/calendar.test.ts test/architecture.test.ts` 29/29 通过。
  - `npm test` 1967/1967 通过。
  - `npm run build` 通过。
- 浏览器检查，住宅场景秋季第 13 天（截图在 evidence/）：
  - 05:30 太阳从左边缘升起。
  - 12:00 太阳在画面正中、约 84% 高度。
  - 18:30 太阳落到右边缘（被住宅楼挡住）。
  - 23:00 月亮在画面中上方。
- 家园：
  - 起落线设在 .5。
  - 午夜前后月亮在画面正中上方，会被前景小屋挡住，属于正常遮挡。
- 检查页仍用 `setSunDirection`，按世界方向手动摆放，与原来一致；星星改为按画面撒在起落线以上。
