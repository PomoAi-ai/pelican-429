# PLAN -- D12实时渲染预览

## Status: done
## Task: 440
## Related: N/A
## Baseline Commit: 64ef4a38

## Goal
把现有D12头发真实几何接入独立render-lab，在网页里旋转缩放查看。

## Non-goals
本次不重做D12造型，不替换旧版本，不发布游戏默认资产。

## Acceptance Criteria
- 模型下拉有明确D12选项，URL可直接打开。
- 使用D12实际生成纤维及辫子，保留原眼、身体、骨架和动作。
- 正面、侧面、旋转、缩放与原画对照在浏览器可见。
- 旧模型版本保持，所需检查通过。

## Constraints
独立新增模型；不能用离线图片或旧发型代替；避免不可用的巨大圆管网格。

## Decisions
- 使用dev流程并沿用Ponytail Full；UI探索与Blender几何导出并行。
- 新增可回退本地预览，无须额外批准。
- 真实全纤维圆管约824万面过重，选择有误差界的中心线简化与GPU相机朝向带；保留38720根、实际半径和原2辫。
- 复用原GLB眼睛/身体/蒙皮/动作二进制，独立新增资产与blender-d12入口。
- 新shader只处理d1FiberRibbons标记资产；保留原材质回调，匹配深度投影，隐藏新纤维粗描边。旧模型不变。
- 连续Catmull样条有限采样最大偏差.002667约原图0.60px；.00095仅是存储点折线误差界，不能当连续严格界。
- 独立审查发现并修正GPU带绕序与受光法线反号；四视真实三角复核全部法线同向，GPU浏览器需最终复验。
- D12预览禁用CPU发梢惯性，保留GPU骨架动作与眼部；当前不宣称头发完整物理。
- UI/资源导出/GPU适配由子代理独立实施；完整GPU/浏览器验证由主线程执行。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/d1-render-lab.ts | D12资源与URL、控制适配 | N/A | yes |
| 2 | render-lab.html | 新模型选项，保留旧项 | N/A | yes |
| 3 | src/render/grassy/d1-fiber-ribbon.ts | 新纤维GPU展开及匹配深度材质 | N/A | yes |
| 4 | src/render/grassy/d1-lab-looks.ts | 所有材质版本应用纤维适配 | 3 | yes |
| 5 | public/characters/human/render-lab/d1-outfit-blender-d12-v1.glb | 真实D12实时导出 | N/A | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes（GPU适配子代理） |
| npm test | yes | yes（1930通过） |
| npm run build | yes | yes（最终shader修正后通过） |
| 浏览器真实模型、旋转和视角验收 | yes | yes（D12十种材质、正侧面、缩放、动作、闭眼、球眼与旧版切换） |
| 导出结构/几何/原资产保留检查 | yes | yes（独立读回/四动作/原BIN保留） |

## Outcome
已在用户当前render-lab标签页打开D12，URL可直接进入单视图，也可返回10版双列对照。原旧模型和默认选项保留。新资产112448672字节，SHA256 29ea54bc0fd9d82fc869d919c42bdb9a2a4d63b23ff06d8127376de934aff3cd。

独立审查的法线反号已修正，并以实际GLB四视各20579三角复核。最终浏览器无warning/error。球眼首次载入遇CDP观察超时，继续观察同一标签后确认加载成功，未重启或改资产。

导出、读回、误差及GPU证明在 assets/characters/grassy/customization/models/d1-render-lab-blender-hair/reference-fiber-realtime-study-01/。没有新增实现镜像测试、提交或推送。D12仍是阶段稿，PBR近似及有限样条采样误差已明确；整体头发造型目标继续推进。
