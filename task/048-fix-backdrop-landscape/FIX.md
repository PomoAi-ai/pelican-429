# FIX -- 远景山形与空间层次

## Status: done
## Task: 048
## Related: N/A
## Baseline Commit: 无 HEAD；相关文件快照 $TMPDIR/pelican-backdrop-before

## Problem
远景观感单调、缺乏山形变化和层次。

## Root Cause
src/render/stage.ts 的 createBackdrop 使用等间距圆片，只有三种循环压缩高度，形成重复圆丘；两个平面层缺乏坡面纵深。

## Fix Plan
- [x] 在共享 createBackdrop 中替换为连续山脊，复用 core/rng 的确定性噪声。
- [x] 远、中、近三层分别采用灰蓝、青绿、深绿，峰谷尺度错开，山脚融入雾色。
- [x] 山顶、坡肩、山脚沿 z 展开，保留透视视差，每层一个网格。
- [x] 移除现有测试限定两层的过时断言，保留边界、资源释放与远近雾色检查；不新增渲染细节测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1498/1499 通过，世界生成耗时中位数 281.6 ms 超过 250 ms；该纯逻辑路径不依赖修改的渲染模块。单独重跑 test/worldgen.test.ts，29/29 通过（包含原失败的性能项），未改断言或跳过测试。
- [x] 保留 lowBoost 参数后重跑 test/lighting.test.ts 与 test/render-integration.test.ts，77/77 通过。
- [x] npm run build：通过，有产物体积提示。
- [x] diff-guard 审查：无新增防御分支、静默降级或实现细节测试；修改限定于远景生成和过时的层数断言。
- 浏览器视觉验收受前序 URL 安全策略限制，未绕过，最终观感待人工验收。
