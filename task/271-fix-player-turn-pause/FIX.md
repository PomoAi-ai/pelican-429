# FIX -- 松开方向键保留玩家转身角度

## Status: verifying
## Task: 271
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
玩家转身途中松开方向键后仍会转到目标朝向；需要停在松键时的角度，再次输入时继续。

## Root Cause
`src/render/pelican/pelican-animator.ts` 的 yaw 每帧持续向 facing 缓动，没有接收移动输入。人形复用同一个转身角度。

## Fix Plan
- [x] 控制器记录有效移动输入，视图映射为 turning，动画只在 turning 时推进 yaw；首帧仍对齐初始朝向。
- [x] 保留攻击、技能与吐射期间的转向，防止表现与攻击方向脱节。
- [x] 更新现有测试输入夹具的必需字段，不新增渲染动画自动测试。

## Verification
- [x] `npm run typecheck`：通过；补齐既有骑行测试的动画输入字段后复查通过。
- [x] `npm test`：1787/1788 通过，唯一失败为世界生成耗时中位数 337.4ms 超过 250ms；本次未修改世界生成代码。单独重跑 `node --test test/worldgen.test.ts`，29/29 通过，未修改断言。
- [x] `node --test test/pelican-view-ride.test.ts`：12/12 通过。
- [x] `npm run build`：通过，存在大 chunk 提示。
- [ ] 浏览器人工验收松键停角度、重新按键继续转身
- [x] diff-guard：改动限于输入传递与 yaw 更新，无新增防御校验或兜底。
- [x] 子代理只读核对：双形态共享 yaw，展示场经真实控制器传入移动输入；保留首帧朝向与脚部混合目标。
