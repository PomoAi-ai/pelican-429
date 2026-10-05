# FIX -- 机房特效性能与柔和电流

## Status: done
## Task: 087
## Related: 080-facility-lighting-weather-map
## Baseline Commit: 无 HEAD；原件 $TMPDIR/pelican-facility-soft-before

## Problem
机房电力颜色和特效过于强烈，需要柔和配色并减少场景渲染开销。

## Root Cause
- `src/render/facility-signals.ts`：加色光带亮度最高乘 3.9，叠加宽电弧与高频抖动；所有路线的字符每帧更新矩阵并全量上传，屏外也参与。
- `src/render/facility-lighting.ts`：机房同时使用 10 个局部点光源。

## Fix Plan
- [x] 共享信号改低饱和暖灰米白电流，移除横向抖动和高频闪烁；网络灰蓝、柜内低饱和青绿。
- [x] 使用实际相机视锥跳过屏外路径和字符，紧凑更新可见实例，局部上传矩阵。范围包含线路深度和字符尺寸。
- [x] 点光源预算由 6+4 调整为 4+2，保留设备照明；电线护套改灰绿色，独立于黄色平台警示线。
- [x] 游戏及预览同步验收，不加渲染结构测试。

## Verification
- [x] 修改前后同条件临时 CPU 更新与实例量测量。
- [x] npm run typecheck
- [x] npm test：1532 项，1531 通过；仅既有世界生成耗时用例在全量并行负载下超过阈值（590.1ms >250ms）。该用例不依赖本次渲染改动；单独复跑 `node --test test/worldgen.test.ts`，29/29 全过。未修改断言或跳过测试。
- [x] npm run build，成功；仍有主包 >500kB 与插件耗时提示。
- [x] 浏览器颜色、流动、移镜头与全景可见性；大教堂和深渊游戏、堡垒全景与多层局部均通过，没有控制台 error/warn。
- [x] diff-guard 与独立子代理复核通过，无高置信问题。

## Measurement
固定 1280/672 比例、45° FOV、相机 z=44，使用实际场景工厂，统计信号实例及有效矩阵上传数据。CPU 基准不包含 WebGL/GPU 时间，不作为整机 FPS 提升承诺。

| 场景 | 修改前每帧信号实例 | 修改后可见实例 | 修改前矩阵字节 | 修改后矩阵字节 | 减少 |
|---|---:|---:|---:|---:|---:|
| 堡垒 | 2798 | 698 | 179072 | 44672 | 75.1% |
| 大教堂 | 6185 | 944 | 395840 | 60416 | 84.7% |
| 深渊 | 3339 | 441 | 213696 | 28224 | 86.8% |

测量镜头分别为 (90,25)、(35,25)、(35,49)。实例总容量减少约 46%–48%；可见数量随镜头与时间变化，表格记录固定帧。

同一进程保留新旧实际场景工厂，预热 100 帧、9 组交替执行顺序，每组 60 帧，更新 CPU 中位数：堡垒 1.147→0.293 ms，大教堂 2.007→0.305 ms，深渊 1.094→0.392 ms。结果 `$TMPDIR/pelican-facility-soft-paired-benchmark.json`。最初分开测量受系统负载波动影响，不使用该组 CPU 数字作结论。

截图：`output/chapters/cathedral-soft-current.jpg`、`output/chapters/abyss-soft-current.jpg`。
检查日志：`$TMPDIR/pelican-facility-soft-tests.log`、`$TMPDIR/pelican-facility-soft-build.log`。
世界生成复查日志：`$TMPDIR/pelican-facility-soft-worldgen-recheck.log`。

## Result
四个生产文件仅修改共享信号渲染、点光预算、电线材质和相机传递；游戏与预览复用。未修改依赖、物理、世界生成或测试代码，未提交或推送。浏览器临时页已关闭，用户游戏页保持原位。
