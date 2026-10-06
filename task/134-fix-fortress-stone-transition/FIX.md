# FIX -- 石质前哨向工业堡垒过渡

## Status: done
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
- [x] 子代理 core-review / diff-guard 复核边界与释放链
- [x] npm run typecheck
- [x] npm test -- --test-concurrency=2（1591/1592；唯一世界生成性能项单独复跑通过）
- [x] npm run build
- [x] Bug is fixed

## Decisions
- 按 fix 局部修复流程执行，以用户最新的混合过渡指示为准，不进行整套回退。
- 属于表现调整，不新增材质细节或源码字符串测试；保留世界碰撞、冷却液与当前并行角色工作。
- 浏览器固定黑洞前哨镜头确认左侧原石材与苔藓、中部加固石柱和带石底踏台、右侧工业门墩及钢梁；黑洞持续运动，日志无 warn/error。截图 output/chapters/fortress-stone-transition-preview.jpg。
- 最终检查：typecheck 退出码 0；全量 1592 项中 1591 通过，唯一 worldgen 性能阈值 387.3 ms > 250 ms，原断言单项复跑 1/1 通过。该项只执行普通地图生成，不依赖本次前景或机房材质。未改测试/阈值，不声称全量首次通过。
- build 退出码 0，402 模块，15.64 秒；仅 prepare-out-dir 耗时和主 JS 体积提示。日志 $TMPDIR/pelican-stone-transition-{typecheck,tests,worldgen-perf-rerun,build}.log。
- 独立子代理审查通过：台阶高度、碰撞形状、踏台范围及下穿规则不变，NPC 配置未修改；黑洞时间/释放链保留，所有岩石几何与材质沿原路径释放，无新增防御兜底或低价值测试。
