# FIX -- 空岛底部与积雪边缘

## Status: verifying
## Task: 057
## Related: N/A
## Baseline Commit: 无（当前仓库尚无提交，文件均未跟踪）

## Problem
空岛下方外观生硬；雪覆盖后的边缘过于单一。
后续调整：增加岛底下坠植物，丰富疏密、长短和叶片层次。
最终外观方向：用贴岩攀附的常春藤与青苔覆盖底缘，减少整排对称垂藤。
风格修正：对照正式树木，删除独立平面叶片画法，复用树木体积叶团、叶片图集、球面化法线、AO 和叶材质，增加生长轮廓差异。

## Root Cause
- `src/render/sky-island-view.ts` 的 `planSkyIslandParts` 每列放置同类倒锥，间距固定，底缘形成重复齿排。
- `src/render/precip-surface.ts` 的雪檐使用固定厚度，覆盖量增加后噪声不足以改变边缘形状。

## Fix Plan
- [x] 调整共享空岛视图中的底部岩块比例与排列：宽扁断裂岩层、错位搭接、根须成簇。
- [x] 在共享降水着色中使用世界坐标噪声改变雪沿厚度，保留露天遮挡约束。
- [x] 垂挂植物增加为长短两层实例，提高绿藤比例，藤蔓使用成对阔叶和三档长度，继续复用风摆材质与单次实例绘制。
- [x] 根据外观反馈改为横向蔓延的三裂常春藤叶丛、少量短垂枝；底部岩块表面增加斑块状青苔色。攀附叶固定、末梢随风，继续共用游戏视图与材质。
- 不修改世界生成、碰撞、vendor；不添加渲染自动测试。

## Verification
- [x] `npm run typecheck` 通过。
- [ ] `npm test`：1499 项，1498 通过；唯一失败为 `worldgen.test.ts` 世界生成性能门槛，中位数 279.5ms > 250ms。
- [x] `npm run build` 通过；报告产物体积警告。
- [x] `node --test test/precip-render.test.ts`：23 项全部通过。
- 单独复跑 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 仍失败（619.2ms）。该用例仅依赖配置和逻辑层，不加载本次两个渲染模块；未改门槛或扩大范围修复世界生成。
- [x] diff-guard 检查本次变更：未新增防御检查、兜底、依赖或渲染自动测试。
- [x] 浏览器实机查看种子 20260930 的空岛底部与大雪岛面，确认岩块切面、根须间隙与不规则雪沿可见；控制台无 error。截图 `$TMPDIR/pelican-island-edge.jpg`、`$TMPDIR/pelican-snow-edge.jpg`。
- 外观修改已实现；因全量检查存在上述性能失败，保持 verifying，不宣称全部验证通过。

### 垂挂植物后续验证
- 浏览器同一种子同一岛底已检查：垂挂植被明显更密，长短交错、叶片清晰；控制台无 error。截图 `$TMPDIR/pelican-hanging-plants.jpg`。
- `npm run typecheck`、`npm run build` 均通过，构建仍提示产物体积警告。
- `npm test`：1499 项中 1498 通过；唯一失败仍是世界生成性能门槛（633.1ms > 250ms）。岛饰规划和降水相关用例通过，不修改与本次渲染变更无依赖关系的性能用例。
- 已按 diff-guard 检查本次差异，无新增依赖、防御性检查或自动测试；保留 verifying 状态。

### 常春藤与青苔验证
- `npm run typecheck` 通过。
- `npm test` 全量通过，0 失败，约 79 秒；此前失败的世界生成性能用例本轮通过。
- `npm run build` 通过，保留产物体积警告。
- 浏览器查看同一种子同一空岛底部，确认叶丛横向攀附、短枝垂落和青苔岩面；控制台无 error，截图 `$TMPDIR/pelican-ivy-moss.jpg`。
- diff-guard 检查通过：本轮仅修改共享空岛视图与任务记录，无新依赖、防御检查或渲染自动测试。
- 最终实现与验证完成，先前 verifying 的性能失败已由本轮全量通过解除。

### 树木风格统一
- 删除三裂平面叶片生成，改用共享 `MeshBuilder`、`planLeafClump`、`addLeafClump`、`addStrand` 和 `createLeafMaterial`。
- 低矮苔垫、攀附叶丛、垂落枝簇三类各四个变体，按区域疏密与实例尺寸变化分布；复用树木叶色与透明叶簇纹理。
- 子代理只读对比确认原实现缺少树木的体积、纹理、法线与层次，指出索引变体合并和局部 z 裁切的复用约束，已按约束接入。
- `npm run typecheck`、`npm run build` 通过；构建保留体积与插件耗时提示。
- `npm test`：1499 项中 1498 通过，唯一失败仍为世界生成性能门槛（447.6ms > 250ms）；该用例不依赖本次渲染修改，不更改其门槛。
- 浏览器检查种子 20260930 的两座空岛，叶团纹理、体积、三种生长轮廓可见，控制台无 error。截图 `$TMPDIR/pelican-tree-style.jpg`、`$TMPDIR/pelican-tree-style-variation.jpg`。
- diff-guard 检查通过，无新增依赖、防御检查或渲染自动测试。因上述性能失败保留 verifying。
