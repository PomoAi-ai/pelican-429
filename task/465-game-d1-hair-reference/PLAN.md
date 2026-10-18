# PLAN -- 游戏精细版头发与原版动漫渲染对照

## Status: done
## Task: 465
## Related: 463-prune-hair-variants
## Baseline Commit: c292d188

## Goal
追踪截图的D1精细检查版与动漫柔光，加入头发总览和独立渲染对照，复用正式资源和材质。

## Non-goals
不更改模型或游戏外观，不恢复已删除的淘汰款，不宣称单张截图证明眨眼完全修好。

## Acceptance Criteria
- 新增38号（避免复用已删除款编号）游戏精细检查版，已有八款编号不变。
- 顶部可选游戏动漫柔光与V1–V10，所有款都可对比。
- 单独打开沿用同一模型、风格；原生头发不进入实验几何适配。

## Decisions
- 根已完成代码链探索并明确文件级方案，跳过重复架构派工；代理独立核对GLB和眼睛实现。
- 直接引用D1_ANIMATED_MODELS的detailed路径，使用web-1k共享派生，不复制或修改资产。
- 扩展现有showcase基准材质恢复到所有头发，统一棚光仍与游戏太阳环境不同。
- 用户已要求研究并加入对照，变更可回退，无设计审批停止条件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/app/d1-lab-hair-catalog.ts | 正式精细版路径与编号 | yes |
| render-lab.html | 增加目录按钮 | yes |
| src/app/d1-hair-gallery.ts | 统一原版渲染与精细版rig | yes |
| src/app/d1-render-lab.ts | 精细版单独查看 | yes |
| src/render/grassy/d1-lab-looks.ts | 所有款恢复原材质 | yes |

## Validation
| Check | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器9款、游戏材质与V2切换、精细版单独打开 | yes | yes |
| 独立审查 | yes | yes |

## Result
- 38号直接引用正式detailed/web-1k；已有01/05/13/17/22/31/34/35不变。游戏动漫柔光与V1–V10对所有款开放，单独打开一致。
- 资源审计：38头发91862三角面，旧01头发29777；眼睛仍独立贴片与四格图集，非球眼，脸/眼贴图与01一致。
- 浏览器九款加载与材质往返正常，无console error；精细版独立页正面/侧面与闭合滑条可用。
- 实际视觉检查：全闭睫毛可闭合，50%半闭眼有明显灰带/重叠感；正面冠部发束有空隙。保留现状作为研究对照，不宣称已完全修复。
- npm run typecheck通过；npm test 1960通过0失败；npm run build通过（大chunk提示）；git diff --check通过。独立core-review/diff-guard通过。
- 截图output/hair-gallery/game-anime-nine.png、game-detail-front-half.png、game-detail-front-closed.png、game-detail-side-open.png。
- 未更改游戏资产/材质参数，未提交推送。
