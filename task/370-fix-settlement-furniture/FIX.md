# FIX -- 大场景半深家具与屋顶太阳能

## Status: done
## Task: 370
## Related: 361, 368-fix-solar-row
## Baseline Commit: 975f136

## Problem
将12块连续太阳能板融入大场景，并应用已选定的普通家具靠背景墙占里面半格规则。

## Root Cause
src/app/definition-settlement-layout.ts 的家具默认深1；太阳能仍是公馆屋顶分散三块。

## Fix Plan
- [x] 大场景普通家具默认深0.5，复用共享工厂既有后靠规则，宽高和人物中线不变。
- [x] 旅舍屋顶连续12块太阳能，延长一格实体屋檐，避开重叠平台；保留深1及动态碰撞，新增目录定位。
- [x] 家具定义记录选择并同步公开副本。

## Verification
- [x] npm run typecheck — 文件齐全后通过
- [x] npm test — 初次1853通过、2失败，均由同时修改的场景文件暂缺导致；文件齐全后定向复跑 architecture 与 perspective-player 共35项全部通过
- [x] npm run build — 通过
- [x] 浏览器检查屋顶整排、踩踏与室内半深摆放；截图 settlement-solar.jpg
- [x] diff-guard 检查本次改动：仅大场景布置与文档，无新增防御检查或实现细节测试
- [x] 定向测试 test/definition-settlement.test.ts 两项通过，主街与二层通路保持可达
- [x] 临时公开接口自检通过：主街跳上屋顶平台、横穿12块面板、返回平台、全部板面恢复太阳目标

初次类型检查与页面加载被同时修改中的 depth-scenery.ts / depth-landscape-details.ts 缺失阻断；文件齐全后复查通过，没有修改其他任务文件。未新增渲染细节测试，未提交或推送。
