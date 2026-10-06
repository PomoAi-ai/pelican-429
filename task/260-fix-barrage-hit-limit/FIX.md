# FIX -- 密集弹幕命中上限

## Status: done
## Task: 260
## Related: 241
## Baseline Commit: 8a8fe8c

## Problem
同一技能的大量小子弹集中命中时会瞬间叠加伤害。

## Root Cause
`src/combat/combat-system.ts` 的 resolveHits 仅通过每颗弹体自己的 hitIds 限制重复命中；`src/entities/projectile.ts` 的 maxHits 限制单颗弹体穿透数量，不限制同一弹幕。

## Fix Plan
- 同一来源、技能组、目标在滚动 12 tick（0.2 秒）内最多结算 3 次小弹伤害；光子虫弹和光轮共用组。
- Codex、Bug、光子、鱼群及敌方小弹复用共享结算；普攻近战与单次重击保持原规则。
- 超额弹消耗命中次数并正常消散，不延迟补伤，不触发伤害/硬直/停帧。

## Verification
- [x] 两条回归用例先失败后通过：原来 12 发 Codex 同帧扣 36 点，修改后扣 9 点；验证滚动窗口、光子共享额度、来源/技能/目标隔离、超额弹消散及近战不受影响。
- [x] `node --test test/combat.test.ts test/human-combat.test.ts test/weapons.test.ts`：80/80 通过。
- [x] `npm run typecheck` 通过；`npm test`：1784/1784 通过；`npm run build -- --outDir /private/tmp/pelican-barrage-build` 通过，保留现有大分块警告。
- [x] 独立子代理只读审查、相关文件 `git diff --check` 与 diff-guard 通过。
- 此次只调整真实碰撞伤害结算，复用既有 projectileImpact 表现；未新增渲染效果、未进行浏览器视觉验收。未提交、未推送。

## 0.2 秒窗口调整
- 按用户最终数值缩短窗口至 12 tick，次数仍为 3；同步调整既有跨帧回归用例，验证第 11 tick 拦截、第 12 tick 释放最早额度。
- [x] `npm run typecheck` 与 `npm run build -- --outDir /private/tmp/pelican-barrage-02-build` 通过；相关 diff 检查通过。
- [x] `npm test`：1786 项中 1785 通过，两条小弹回归用例均通过；唯一失败是其他改动涉及的黑洞空间声音测试（不调用弹幕结算）。`node --test test/blackhole-audio.test.ts` 单独复跑 3/3 通过。未修改音频代码或测试。
