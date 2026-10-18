# PLAN -- 头发总览复用游戏光照与后期

## Status: done
## Task: 466
## Related: 465
## Baseline Commit: c292d188

## Goal
总览接入游戏太阳、半球光、环境贴图、曝光、AO/Bloom/调色与抗锯齿；棚光可单独切换，保持流动布局和同步镜头。

## Non-goals
不改游戏参数、不改模型和眼睛、不复制后期算法、不还原整个游戏世界布景。

## Decisions
- 已有探索与代理架构核对完成；共享一个createStageView与后期目标，依次渲染可见卡片，避免每卡一套后期。
- 采用正式TUNING配置和createStageRenderer；为透明页面画布增加可选alpha参数。
- 游戏环境默认启用，顶部独立切游戏日光/检查棚光，全部材质可共用环境。
- 游戏环境用游戏透视相机，按正交参考取景高度拟合；保持角度与头部范围一致，不承诺与游戏全身画面逐像素一致。
- 完整卡片保留高清快照，滚动优先复用；拖动才重绘后期。缺GPU能力明确报错，不静默降级。
- 用户授权可回退的代码修改，无停止条件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/stage.ts | 支持透明共享渲染器 | yes |
| src/render/grassy/d1-hair-game-stage.ts | 共享正式游戏舞台、后期和纹理呈现 | yes |
| src/app/d1-hair-gallery.ts | 环境切换、复用舞台、高清快照 | yes |
| d1-hair-gallery.html | 环境按钮 | yes |

## Validation
| Check | Required | Done |
|---|---|---|
| typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器环境切换、渲染切换、滚动/同步旋转与九款加载 | yes | yes |
| 独立审查 | yes | yes |

## Result
- 总览默认游戏日光，独立保留检查棚光；9款与原编号不变。材质、环境、旋转切换正常。
- 正式createStageRenderer/createStageView/postFx共享太阳、半球光、PMREM、曝光、AO、bloom、grade与默认SMAA。透明画布和棚光画布抗锯齿通过renderer可选参数启用，既有调用方默认不变。
- 单舞台单后期目标；静态完整快照用于滚动，镜头/材质/环境/窗口变化时失效；DPR源与目标尺寸同步。
- npm run typecheck通过；最终npm test 1960通过0失败；npm run build通过（既有大chunk提示）；git diff --check通过。独立core-review/diff-guard通过。
- 浏览器宽屏9款、3列滚动、拖动同步旋转、游戏/棚光与V2往返验证通过，无console error。截图output/hair-gallery/game-pipeline-nine.png。
- 本次仅头发总览接入游戏环境，独立render-lab继续既有检查棚光；头部取景与背景仍不同于游戏全身布景。未修改模型/眼睛，未做长期GPU帧率基准。未提交推送。
