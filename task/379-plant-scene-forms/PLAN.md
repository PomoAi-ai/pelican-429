# PLAN -- 植物场景形态与空间组合

## Status: done
## Task: 379
## Related: N/A
## Baseline Commit: d2d72f4

## Goal
把植物资料中定义的空间可能加入实际植物场景：整格草、前后贴面、边沿下垂、底面内部向下生长，并体现树木和灌木后置留空0.25格。

## Non-goals
不实现种植经济、生长计时、掉落或存档系统；不修改无关场景内容，不提交或推送。

## Acceptance Criteria
- 实际场景可观看新增植物组合和底面附着，不仅增加文档。
- 模型由共享植物生成模块提供，展示层仅负责摆放、镜头及目录。
- 树木与灌木留出人物侧空间；草保持整格覆盖。
- 页面视觉核对及项目要求的检查通过。

## Constraints
保留当前工作区其他改动，新增内容遵循现有场景结构。渲染外观不用源码或网格细节测试。

## Decisions
- 探索和架构建议合并为一个只读子任务，定位后直接实现可回退的方案。
- 复用 lab 的相机、宿主地形、共享植物工厂与卡片对照，增加 plants 演示组和概念页入口；不另建渲染器。
- 根点分布在底面内部 XZ 区域，茎叶仍沿负 Y 生长；背面使用朝向变换。运行时从正 Z 观看，不能直接照搬概念图的 Z 数值。
- 当前范围是展示空间可能，不扩大随机世界生成；无设计停止条件，直接实现。
- 子代理审查发现草皮原先按装饰区域缩进，已修正共享草皮几何覆盖真实砖块前后沿；既有范围断言随明确改变的规格更新。复核关闭此问题。
- 浏览器斜视发现外围夹具地形入镜，已清空植物展示的其他地形，只保留宿主；比例参照人物放回宿主上。
- 初次类型检查发现重复翻译键和并行岩层改动的旧接口，重复键已修复；最终类型检查通过，未修改岩层调用文件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/face-climbers.ts、plant-attachments.ts、flora-geometry.ts | 共享附着形态与整格草 | yes |
| src/render/resource-catalog.ts、resource-preview.ts、src/app/showcase/resource-scenario.ts | 资源目录和真实宿主场景 | yes |
| src/config/scene-demos.ts、showcase-camera.ts、src/ui/lab-controls.ts、site-pages.ts、showcase-language.ts、index.html | 演示组、说明、前后仰视及入口 | yes |
| test/showcase.test.ts、render-flora.test.ts | 宿主/净空/人物承托行为；既有草范围适配 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，最终通过 |
| npm test | yes | yes，1876通过 |
| node --test test/showcase.test.ts test/render-flora.test.ts test/render-smallflora.test.ts | yes | yes，最终修正后68通过 |
| npm run build | yes | yes，最终通过；保留已有大分块警告 |
| 植物场景浏览器视觉核对 | yes | yes，斜视/背面/仰视/俯视；无控制台错误 |

## Result
入口 `?mode=lab&demo=plants`，概念页植物目录和场景菜单均可进入；八个可旋转的真实模型场景。截图 `/tmp/pelican-plant-scene.jpg`。不提交、不推送。
