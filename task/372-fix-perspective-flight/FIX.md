# FIX -- 透视场景无限飞行

## Status: done
## Task: 372
## Related: 369
## Baseline Commit: 975f136

## Problem
透视场景需要可以持续无限飞行。

## Root Cause
src/app/perspective-player.ts 将飞行能量上限设为0；控制器空地图高度限制升空，透视控制器还会在越过场景左右边界时传送回出生点。

## Fix Plan
- [x] 开启同源飞行能力，每步恢复有限能量上限，取消透视的人工高度与左右边界传送。
- [x] 更新操作说明，保留真实实体碰撞、骑车和技能规则及独立视角；界外弹体同步取消占位边墙。
- [x] 增加长期飞行、弃车起飞、真实顶棚、重置和界外技能行为验证。

## Verification
- [x] 新增飞行及界外代码弹用例修改前失败，修复后通过
- [x] npm run typecheck — passed
- [x] npm test — 首轮1871/1872通过；登楼用例持续长按空格按新语义进入飞行，改为顶点松键（保留原可达性断言），node --test test/definition-settlement.test.ts test/perspective-player.test.ts 受影响20项全部通过。按仓库收敛规则未重复全量。
- [x] npm run build — passed，现有大分块提示
- [x] 浏览器持续飞行超过原能量时长、镜头跟随和自由镜头、空中技能、S下降落回场景
- [x] 子代理diff-guard复核 / git diff --check — passed

## Limitations
无限制指飞行能量、人工高度及左右场景边界；真实墙体/屋顶碰撞与跌落救回保留。未做手机真机验证，未提交或推送。
