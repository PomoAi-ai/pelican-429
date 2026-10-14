# FIX -- 家具分区平地、半砖房拐角与删除深0.5候选家具

## Status: done
## Task: 389
## Related: 384
## Baseline Commit: d2d72f4

## Problem
透视预览 `/?mode=resources&scene=room#furniture` 的家具分两排摆在各自的小台子上，无法连续走过全部家具。需要一条长的平地表，全部家具摆在上面。

后续追加：
- 半砖侧墙房间（三个层间组合）的四个拐角，半砖底板和屋顶伸出侧墙外半格，改用 1/4 砖。
- 删除全部待选家具（深0.5 候选），家具只保留深1。

- 六个房间分区（整砖单间、半砖单间、整砖两层、三个层间组合）放到地平面上，方便走进走出测试。

## Root Cause
src/app/definition-scene-layout.ts:208 — addFurnitureGallery 按 7 列 × 2 排布置，每件家具单独垫一组实体格，第二排悬在 Y=5。

## Fix Plan
- [x] src/app/definition-scene-layout.ts — 13 件家具沿分区自带的平地排成一行，间隔 3 格；吊灯保留一格悬挂砖；分区尺寸改为 62×6。
- [x] src/app/definition-scene-layout.ts — addDefinitionRoom 在 halfSides 房间的底板、屋顶两端取侧墙与板的交集（C→P/O，B→N/M）。
- [x] src/render/definition-furniture.ts、src/app/definition-scene-layout.ts、src/app/definition-settlement-layout.ts — 删除家具深度参数与「家具 · 半格深候选」分区；大场景家具由深0.5改为深1。
- [x] docs/furniture-definitions.md、docs/depth-definitions.md（及 public 副本）、src/ui/site-pages.ts — 文字同步。

- [x] src/app/definition-scene-layout.ts — section 增加 ground 参数：地面与分区落脚面齐平并垫在整个分区下方，两侧各留 6 格；玩家出生在左侧门外。半砖侧墙房间的底板两端恢复整格宽以接上地面，1/4 砖只用于屋顶拐角。

## Verification
- [x] npm run typecheck
- [x] node --test test/definition-settlement.test.ts（5 通过）
- [x] 浏览器打开 #furniture：家具沿平地排成一行，控制台无报错（整条走查与手感由人验收）
