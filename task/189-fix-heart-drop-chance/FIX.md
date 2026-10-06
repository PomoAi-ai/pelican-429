# FIX -- 红心改为三成概率掉落

## Status: done
## Task: 189
## Related: 184-monster-health-drops
## Baseline Commit: 3a35077

## Problem
用户要求怪物死亡后以 0.3 概率随机掉落红心。

## Root Cause
`src/sim/sim-world.ts` 死亡清理分支目前必定创建回血掉落。

## Fix Plan
- [x] 复用 hash01，在死亡清理点按 30% 判定一次；掉落与回血量使用不同哈希通道。
- [x] 更新既有掉落测试，验证有掉与不掉、约三成分布及种子复现；保留拾取和物理测试。

## Verification
- [x] `node --test test/health-pack.test.ts`：4/4；概率用例改动前复现 1000 只怪物全部掉落，改动后通过。
- [x] `npm run typecheck`：通过。
- [x] `npm test`：1722/1722 通过。
- [x] `npm run build`：通过，保留既有大 chunk 与插件耗时提示。
- [x] diff-guard 自查、相关文件 `git diff --check`：通过。无需渲染改动或视觉复验；没有新增防御检查或依赖。
