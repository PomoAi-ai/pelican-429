# FIX -- 统一顶部菜单与设置按钮

## Status: verifying
## Task: 222
## Related: 217
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
顶部菜单保持 44px 圆形，而设置已缩为 28px 圆角方形，两者不一致。

## Root Cause
src/ui/control-surface.css:20 — 菜单入口独立定义尺寸、形状与颜色，没有共享紧凑设置入口样式。

## Fix Plan
- [x] 菜单与设置共用 28px 尺寸、8px 圆角、颜色、阴影、悬停和焦点样式；各保留 44px 点击范围。
- [x] 两按钮同高对齐、点击范围不重叠；菜单展开后与按钮保持 8px 间隔。
- [x] 设置开启时保留相同外形，不再旋转按钮底框。

## Verification
- [ ] npm run typecheck — 被无关 test/character-model.test.ts:59 的 TS2554 阻挡：new CompressedTexture() 缺少构造参数。本次仅修改 CSS，未改该测试。
- [x] npm test — 1757 通过、0 失败。
- [x] npm run build — 通过，保留大 chunk 提示。
- [x] 浏览器外观与菜单、设置交互验收：两个入口均为 28×28、8px 圆角、同底色且 top=20px；分别在可见按钮之外 6px 点按，两者都能打开。
- [x] diff-guard 本次增量检查：仅统一共享样式，无新增防御代码或测试。

额外定位执行 node --test --test-timeout=15000 test/character-model.test.ts，3 项运行测试通过；类型声明错误仍保留供对应任务处理。

仅 UI 样式改动，不新增自动测试；保留工作区已有改动，不提交或推送。
