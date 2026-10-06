# PLAN -- 场景资源默认优化并保留原件

## Status: done
## Task: 220
## Related: 219
## Baseline Commit: 8a8fe8c

## Goal
保留原始资源，游戏直接使用优化后的HUD、序章插画、堡垒背景和地形纹理。

## Acceptance Criteria
- 原PNG/WebP保留；新资源从原件生成，可重跑并记录准确体积。
- HUD默认768×576 WebP，序章保持分辨率改WebP。
- 堡垒默认KTX2，原PNG仍可通过textures=original对比；预加载/转码/释放正确。
- 地形默认256，保留512原档可对比，复用游戏和展示场共享生成器。
- 浏览器检查主线/自由世界画面及资源，完成项目规定检查。

## Decisions
- 复用219的完整探索，跳过重复探索；范围和压缩参数已有证据，无待用户裁决问题。
- 两个子代理分别处理KTX加载设计实现与静态资源生成，主代理处理HUD/序章接入和地形。
- 不修改vendor、不部署、不提交推送；保留工作区其他改动。
- 视觉与贴图常量不新增实现细节测试；异步加载如有新行为，使用真实故障路径测试。
- 浏览器发现同renderer角色与堡垒重复KTX2Loader警告，改为按renderer WeakMap引用计数共享；最后使用者结算后释放，不同renderer仍隔离。独立复核通过。

## Implementation Map
| 文件 | 意图 | Done |
|---|---|---|
| scripts/build-scene-assets.ts及派生资源/report | 可重跑生成优化资源 | yes |
| src/app/facility-presentation.ts及调用方 | 默认KTX2，正确预加载与生命周期 | yes |
| src/ui/control-surface.css、src/app/intro-app.ts | 默认使用WebP | yes |
| src/render/tile-view.ts及调用方 | 默认256并保留512对照 | yes |

## Validation
| Command/检查 | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，修复新测试CompressedTexture构造参数后通过；共享loader修改后复跑通过 |
| npm test | yes | yes，1757/1758通过，唯一世界生成耗时用例306.5ms超250ms；未改断言，单独复查29/29通过 |
| npm run build | yes | yes，共享loader修改前后均通过，保留已有500kB chunk警告 |
| node --test test/character-model.test.ts | yes | yes，最终4/4通过，覆盖共享loader释放竞争、跨renderer隔离与失败清理 |
| 浏览器画面、资源加载与独立审查 | yes | yes，见下 |

## Results
- 9项原PNG SHA-256交付前复核均未变，原WebP亦保留。四个KTX通过Khronos验证、11层mipmap和尺寸校验；WebP透明通道逐像素验证通过。
- HUD 1,789,676→151,258 B；序章7,997,893→617,586 B；堡垒由旧WebP 764,582→KTX2 1,001,174 B。总计10,552,151→1,770,018 B，净省8,782,133 B（83.23%）。堡垒这一项下载增加236,592 B，主要收益在显存。
- 纹理预算：堡垒RGBA8→BC7/ASTC4×4含mip约32→8MiB（依设备支持而变）；地形含mip约9.33→2.33MiB。均非GPU实测，不声称提升FPS。
- 同机预热后各5次地形生成：512中位218.8ms，256中位65.9ms；基础CPU像素7→1.75MiB。
- 浏览器验证原堡垒与优化堡垒方向一致、透明城市层正常；自由世界地形与HUD正常；序章雨雪夜图片及堡垒切换正常。
- 实际资源请求确认HUD WebP、四张序章WebP、四张堡垒KTX2和默认512 compact角色。最终构建转码器JS/WASM各请求一次，控制台无warning/error。
- 两次独立审查通过（首次集成与后续共享loader）。未修改vendor，未提交推送或部署。
- 证据：fortress-original.png、fortress-optimized.png、free-world-optimized.png、intro-webp.png。重建方式见docs/scene-resource-compression.md，完整文件报告assets/scene-compression-report.json。
