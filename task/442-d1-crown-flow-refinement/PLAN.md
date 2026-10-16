# PLAN -- D1 冠发根部与连续弧面

## Status: validating
## Task: 442
## Related: 439-spherical-d1-eyes
## Baseline Commit: 64ef4a38

## Goal
继续头发制作，优先修正可编辑 D12 发束正侧面冠根回拱、厚带叠层与根下夹缝，并保留旧阶段对照。

## Non-goals
不覆盖旧 GLB，不改球眼、脸型、身体、骨架、正式游戏默认模型；不操作购买或其他会话。

## Acceptance Criteria
- 使用实际驱动可见造型的 Blender/Hair Tool 曲线制作，保存独立源。
- 冠发根部薄贴头皮，根后和相邻发束连续；正面、80°侧面、45°实际渲染对照，背/顶检查穿插。
- 使用固定参考相机及共同标尺，记录改善和未解决差异，不以相机缩放宣称造型对齐。
- 根UV与绑定保持，导出保持原身体和动作，新球眼能组合。
- 新版本在独立渲染页可选，旧版本保留；完成相关本地检查。

## Decisions
- 源与原画分别由同会话子代理独立检查；只读发现 remake 可见网格是旧网格变形，其隐藏SHP曲线不驱动造型，因此选 D12 实际曲线源。
- 首轮限于两组左冠发及必要的相邻根后束，不继续加细丝密度。离线造型确认后再运行现有细丝导出链。
- 运行时只新增资源选择，复用已有纤维着色与球眼路径。非破坏本地变更直接推进。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/.../crown-flow-refinement-study-01 | 独立曲线造型、对照渲染、根部审计与导出 | — | yes |
| 2 | src/app/d1-render-lab.ts; render-lab.html | 新资源选项，保留各旧版本及球眼组合 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 固定视角对照与曲线根绑定/资产保留检查 | yes | yes |
| 浏览器正侧面、球眼、动作和旧版本对照 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 相关 diff 检查 | yes | yes |

## Result
- candidate-04 已独立保存、导出并接入 `blender-crown-sweep`；保留旧阶段。
- 三组冠发局部调整，4,160原生根与38,720生成根保持；非Hair资源/骨架/动作、D12和球眼资产冻结核验通过。
- 浏览器正侧面、球眼闭合/视线、跑跳、旧版切换与两列10版本布局实际复核完成。
- 类型与构建通过；全量1934项中1933通过、1项失败。失败来自本轮范围外的building-sandbox/tile-material-gallery CSS导入扩展名检查。没有改无关文件或测试，故状态保留 validating，不声明全仓完成标准通过。
- 局部弧线改善但原画整体IoU略降（正面.76641→.75353；80°侧面.72698→.71617），作为候选保留，不替代旧版或声称原画拟合达标。
- 详细证据：`assets/characters/grassy/customization/models/d1-render-lab-blender-hair/crown-flow-realtime-study-01/runtime-verification.md`。
