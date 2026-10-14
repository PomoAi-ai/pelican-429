# PLAN -- D1 全版本展示与模型动画修正

## Status: done
## Task: 401
## Related: 398, 400
## Baseline Commit: d2d72f4

## Goal
将独立实验页改为全部渲染版本同时展示，继续修正头发与眼睛动画；保留原动画及所有历史阶段供选择。

## Non-goals
不改正式游戏、原始资产或其他工作区改动，不提交推送。

## Acceptance Criteria
- 默认展示 V1–V9，标签明确，镜头与动作同步，可打开单个版本近景并返回全部。
- 检查半闭到闭眼的连续过程、睫毛和瞳孔遮挡、动作切换与暂停。
- 头发动态与实际头部运动一致，发根稳定，修正模型可与原动画比较。
- 浏览器验证布局、模型动画与旧版保留，完成仓库要求的检查。

## Constraints
- 复用同一模型及单个 WebGL renderer，不增加九套资源加载。
- 本轮仅改独立实验代码；已有大量用户工作，不覆盖。
- 视觉/动画用浏览器验收，不新增锁定 three.js 实现的测试。

## Decisions
- 应用 dev / core-dev / Ponytail Full；并行探索全版本布局、头发动画、眼睛动画，根代理统一装配和浏览器验收。
- 前一阶段源码冻结为 checkpoints/before-gallery-animation.tar.gz。
- 保留原动画 original，新修正版 refined 独立可选；几何和原着色器历史不覆盖。
- 默认同一画布九宫格，点击单版放大并可返回全部；桌面三列，小屏两列。
- 眼睛复用既有眨眼时钟，连续收敛睫毛并显式裁切瞳孔；保留原分支可对照。
- 修正版头发按当前 head 蒙皮坐标计算惯性，左/右/后三组发梢独立，耳边发根固定；九种材质共享同一动态。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/d1-render-lab.ts | 全版本多视口、单版放大及动画选择 | — | yes |
| 2 | render-lab.html / src/ui/d1-render-lab.css | 九版布局、控件及响应式 | 1 | yes |
| 3 | src/render/grassy/d1-lab-hair.ts / d1-lab-hair-motion.ts | 头发动画修正候选 | — | yes |
| 4 | src/render/grassy/d1-lab-eyes.ts | 眼睛动画修正候选 | — | yes |
| 5 | src/render/grassy/d1-lab-looks.ts | 原动画与修正版装配 | 3,4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，通过 |
| npm test | yes | yes，1880 tests / 301 suites 全通过，49.8 秒 |
| npm run build | yes | yes，通过；原有大 chunk 提示 |
| 实验页 full 构建 | yes | yes，Vite full 入口，copyPublicDir:false，输出 /tmp，通过 |
| 浏览器全版本/单版/眨眼/头发动作验收 | yes | yes，桌面总览、点击放大/返回、拖动、全身/头部、正面/侧面、原版切回、旧发型、慢放跑步及跳跃切换 |

## Evidence and Review
- 眼睑 0.5 / 0.9 / 0.98 / 1 浏览器观察连续，闭眼不再末端切图，完全闭合无虹膜残留；修正版和原版共用原眨眼时钟。
- 真实冻结模型 CPU 检查：y≥2.3 发根及耳根区动态位移为零；自由梢最大位移 idle 0.00073、walk 0.00729、run 0.01015、jump 0.01498 格。暂停保持、定位重置、整体转向坐标检查通过。
- 九宫格每帧只计算两组阴影；共享同一角色和动画，不重复加载九份模型。
- 独立代理审查蒙皮坐标、时序、资源释放及历史版回切，无阻断发现；UI 复核修正了拖动返回起点时误触点击的问题。
- 实际画面保存在 evidence/；未新增渲染自动测试。未验证其他设备的 GPU 性能，头发采用分区弹性发梢，没有逐根发丝碰撞。
- 源码阶段保存于 checkpoints/gallery-animation-source.tar.gz；本轮不修改正式游戏、源模型或已冻结资产，未提交推送。
