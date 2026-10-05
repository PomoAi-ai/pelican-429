# FIX -- 展开角色动作按钮

## Status: done
## Task: 005
## Related: 002
## Baseline Commit: N/A（仓库尚无首次提交）

## Problem

用户要求动作直接显示，避免每次打开下拉框。

## Root Cause

`src/ui/showcase-panel.ts` 将角色动作渲染为 select，每次切换需要展开。

## Fix Plan

用户已明确指定修改方式，直接将动作改为卡片内展开按钮。

- [x] 动作按钮放在卡片标题下、画面上方，按基础/战斗/骑行分组，全部展开。
- [x] 当前动作使用高亮与 aria-pressed 标记；点击沿用原动作切换逻辑，各卡片保持独立。
- [x] 窄卡片自动换行，保留环境与速度等其他控制。

## Verification

- [x] `npm run typecheck`、`npm test`、`npm run build`。
- [x] 浏览器验证全部动作直接可见、点击切换、高亮及双卡独立性。

UI 变更按仓库规则在浏览器检查，不新增复述 DOM 的自动测试。

## Result

2026-10-04：动作下拉改为标题下方的分组按钮，单击切换，当前动作高亮。浏览器实测双卡分别选择骑行/游泳，各卡互不影响，动作下拉数量为 0，无控制台错误。typecheck、build 通过；全量测试 1457/1457 通过。
