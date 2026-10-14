# FIX — 工作站桌体加高半格

## Status: done
## Task: 418
## Related: 417
## Baseline Commit: d2d72f4

## Problem
工作站桌面约1格，和人物及座椅相比偏矮；用户要求桌子再加高半格。

## Root Cause
src/render/definition-furniture.ts:189 的桌面顶为0.99格，之前增加的高度只用于悬浮显示区。住宅放置与落脚高度也仍使用2.5和0.99。

## Fix Plan
- [x] 拉高落地支撑与柜体，桌面由0.99升至1.49；桌上物件和全息显示上移0.5，保留其比例。
- [x] 占位改为宽2高3深1，落脚高度与共享模型同步；更新当前尺寸文档和展示标签。
- [x] 调整既有碰撞与上方放置用例，实景核对人物、座椅和共享悬浮显示。

## Verification
- [x] 修改既有行为用例先复现旧高度问题：node --test test/residence.test.ts 得到2项预期失败（落脚面仍2.99、旧占位允许侵入显示区）。
- [x] npm run typecheck、npm run build 通过；npm test 共1902项，1901通过，本次2项行为用例及默认住宅恢复通过。唯一失败仍为既有 architecture 正则将 src/config/art-library.ts 英文文案 window 判为DOM引用，本次未改动相关代码。
- [x] 浏览器正常载入当前住宅，核对实际桌高、座椅与全息显示；截图 assets/concepts/ai-city-residence/workstation-raised-desk-day.png 与 workstation-raised-desk-detail.png。
- [x] 子代理核对影响范围及7文件差异：未发现问题，无新增防御分支或测试专用生产代码；git diff --check 通过。

## Decisions
- 本轮只加高工作站桌体，不等比拉长桌上书本、键盘、机械臂或全息内容。
- 使用共享家具生成函数，游戏、建造预览、资源展示同步；不增加依赖和新设置。
- 不改变存档格式或自动挪动用户布局。若自建存档有构件紧贴旧2.5格顶面，新3格占位会产生冲突，现有加载校验会拒绝且保留原存档；当前住宅和默认布局已通过载入验证。
