# FIX -- NPC 裤裆步态撕裂

## Status: done
## Task: 086
## Related: 066
## Baseline Commit: 无 HEAD；仓库全部文件未跟踪，修改脚本另存本地快照以核对范围

## Problem
Sam 与 Tibo 迈步时裤裆出现撕裂状折面。必须检查完整周期和正面、背面、侧面局部，修复共享正式模型。

## Root Cause
scripts/blender_npcs/build.py:154 — 左右腿用 X 坐标符号硬切分配。裆部相邻顶点受相反腿骨驱动，缺少骨盆承托及连续过渡。Sam 最差跨中线边伸长 0.11556 格，Tibo 0.11266 格；重合 UV 顶点仍重合，主要是蒙皮造成的过度拉伸折面。

## Fix Plan
- [x] scripts/blender_npcs/build.py — 仅修正裆部骨盆承托和左右腿连续权重过渡。
- [x] public/characters/{sam,tibo}/*.glb 与对应 rigged.blend — 重绑导出共享资产，保留静态形体、贴图和动作。
- [x] assets/characters/{sam,tibo}/evidence/crotch-repair/ — 保存修前后局部与全步态量化证据。
- [x] 同步当前资产来源 SHA 和静态渲染等价证据。

## Verification
- [x] Blender 两模型全步态周期 37 帧量化，原最差帧与相反迈步相位正背左右局部人工复查。
- [x] UV 重合接缝分离为 0；支撑足接地误差维持在 1.81e-7 以内；头、手臂、尾骨权重差为 0。四动作循环端点顶点差为 0，招呼及特殊动作全帧与修前一致。
- [x] 浏览器实际 GLB 正面、背面、侧面以 0.25× 和 1× 复查；无 console error/warn。当前两位没有独立 run clip，本轮不声称验证了独立跑步动画。
- [x] npm run typecheck — 通过。
- [x] npm test — 1532 个测试中 1531 通过；仅负载敏感的 worldgen 耗时用例失败（中位数 476.7ms，预算 250ms）。渲染结束后运行 node --test test/worldgen.test.ts，29/29 通过，未修改代码或测试阈值。全量日志 $TMPDIR/pelican-npc-crotch-test.log，重跑日志 $TMPDIR/pelican-npc-crotch-worldgen-recheck.log。
- [x] npm run build — 通过；保留已有大 chunk 提示，本次另有 prepare-out-dir 耗时提示。
- [x] diff-guard 对比本次脚本快照，仅裆部局部权重更改，无防御性兜底、新依赖或新增渲染自动测试。
- [x] Bug is fixed — Sam/Tibo 行走蒙皮变形已消除，局部大图与最终资产一致。

## Result
- Sam 跨中线最大伸长 0.115563 → 0.000379，下降 99.67%；全周期最大拉伸比 13.5002 → 1.00966。
- Tibo 跨中线最大伸长 0.112665 → 0.000424，下降 99.62%；全周期最大拉伸比 11.5166 → 1.00842。
- 独立复核确认 REST 顶点、拓扑、法线、UV、对象矩阵、材质与贴图完全相同；静态图沿原来源复用并记录等价链。
- 最终 GLB SHA：Sam 8066ed187b19fdd3bb98a693e899dea81ad1a5c9988383efb0ba5b31dfe14484；Tibo 443b15eae670a9b90f3307dbc692e87edb0c966a01ed63d5ce6662946ad61d56。
- 未提交或推送；未修改其他角色。
