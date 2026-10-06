# FIX -- 圆润哑光红心

## Status: done
## Task: 197
## Related: 195-fix-matte-heart
## Baseline Commit: 3a35077

## Problem
用户要求哑光红心仍然圆润，当前挤出模型正反面平坦。

## Root Cause
圆角只作用于轮廓边缘，没有使正反面鼓起。

## Fix Plan
- [x] 对完整球体做连续形变：只压低顶部中间、收窄下半部，保留前后鼓面；不使用会沿中线折叠的极坐标映射。
- [x] 保留无镜面反射材质，焊接顶点并重新计算平滑法线。

## Verification
- [x] 浏览器复用游戏生成函数检查正面、斜侧、侧面：前后鼓面连续，顶部及底部圆滑，无中线折痕、无镜面亮斑。证据 `rounded-matte-heart.png`；临时标签页已关闭。
- [x] `npm run typecheck` 与 `npm run build` 通过；`npm test` 为 1727/1728，唯一世界生成性能用例超限，随后 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 单独重跑通过。没有改变性能阈值。
- [x] diff-guard 自查及相关文件 `git diff --check` 通过；只修改模型曲面，无新增依赖和渲染细节测试。未提交、未推送。

## 实景确认
已在本地构建预览（127.0.0.1:4176）通过地图旅行和真实攻击击杀怪物，掉出恢复 11 点的新版红心；玩家满血，红心保留在右脚旁供查看。证据 `rounded-heart-in-game.png`。为避免开发服务器的其他热更新重置画面，保留独立预览标签页；原游戏标签页未操作。预览进程使用 `npm run preview -- --host 127.0.0.1 --port 4176 --strictPort`。
