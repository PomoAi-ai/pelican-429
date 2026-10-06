# FIX -- 一体哑光红心

## Status: done
## Task: 195
## Related: 192-fix-volumetric-heart
## Baseline Commit: 3a35077

## Problem
用户认为红心左右像拼接，且反光刺眼；要求消除拼接感与反光。

## Root Cause
球面到心形的映射在中线产生尖锐曲面折痕，低粗糙度标准材质产生明显镜面高光。

## Fix Plan
- [x] 改为整块心形实体，连续正面与圆角外缘，保持 0.38 的三维厚度。
- [x] 使用无镜面反射的 Lambert 漫反射材质，保留体积明暗和缓慢转动。

## Verification
- [x] 浏览器复用实际游戏模型检查正面、斜侧与侧面：中心无折痕、无镜面亮斑，圆角与侧面保留三维厚度。证据 `matte-heart-three-views.png`；临时标签页已关闭。
- [x] `npm run typecheck`、`npm run build` 通过；圆角细化后再次构建通过。`npm test` 1722/1723 通过，唯一世界生成性能用例在并行负载下超时；`node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 单独重跑通过。未修改性能测试阈值。
- [x] diff-guard 自查及相关文件 `git diff --check` 通过；删除球面映射和顶点合并逻辑，不新增依赖或渲染细节测试。
