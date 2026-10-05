# FIX -- 石质前哨向工业堡垒过渡

## Status: verifying
## Task: 134
## Related: 131-fortress-industrial-approach
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-stone-transition-before

## Problem
整片工业化替换损失了原石头的自然细节。用户要求旧石头逐步过渡到当前工业结构，保留黑洞动画。

## Root Cause
src/render/facility-approach.ts 将整段前哨统一成光滑大岩片和混凝土门墩，未保留由旧石材到人工加固的空间变化。

## Fix Plan
- [x] src/render/facility-approach.ts — 黑洞侧恢复原石墙/石柱/苔藓，中段保留石材并加固，右侧保留工业平台；复用既有岩石资源，不改动态黑洞。
- [x] src/world/facility-level.ts — 仅自然石头区域恢复草顶材质，碰撞不变。
- [x] README.md — 说明石质到工业前哨的过渡。

## Verification
- [x] 浏览器核对三个过渡区域、黑洞动画和角色落脚面
- [ ] 子代理 core-review / diff-guard 复核边界与释放链
- [ ] npm run typecheck
- [ ] npm test -- --test-concurrency=2
- [ ] npm run build
- [ ] Bug is fixed

## Decisions
- 按 fix 局部修复流程执行，以用户最新的混合过渡指示为准，不进行整套回退。
- 属于表现调整，不新增材质细节或源码字符串测试；保留世界碰撞、冷却液与当前并行角色工作。
- 浏览器固定黑洞前哨镜头确认左侧原石材与苔藓、中部加固石柱和带石底踏台、右侧工业门墩及钢梁；黑洞持续运动，日志无 warn/error。截图 output/chapters/fortress-stone-transition-preview.jpg。
