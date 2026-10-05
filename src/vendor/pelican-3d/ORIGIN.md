# vendor/pelican-3d —— 来源说明

## 来源
- 源目录：`../鹈鹕/pelican-3d/src/`（本目录镜像其目录结构，相对 import 路径原样可用）
- 复制日期：`standing-hub/` 6 个文件 2026-09-29（任务 008，原 `src/vendor/pelican/`，2026-10-01 任务 014 整体搬入，哈希不变）；其余 14 个文件 2026-10-01（任务 014）。
- 复制方式：原样逐字节复制，未改动任何内容（含 import 路径）。复制后已与源文件逐个 `cmp` 核对一致。
- 范围：`standing-ride/riding-pelican.js` 与 `standing-ride/ride-bicycle.js` 的完整静态 import 闭包（另含 `createStandingBird` 所需的 standing-hub），共 20 个 `.js`。

下表为全部 vendor `.js` 的 SHA-256（`test/vendor-integrity.test.ts` 逐个核对，并要求目录中的 `.js` 与表格一一对应）：

| 文件 | SHA-256 |
|---|---|
| motion.js | 6ac3034b09b629c7f76ffd9790db746f96efc6bfe4898044ca69da99e8a1f026 |
| svg-animation.js | eff278d8a4bfa432ca6747988772c285f7277bf8b898ab2f21d5514786434be9 |
| standing-hub/standing-accessories.js | c6237e19c8c55b99fae6517a4cae56e3092a03b83858fcaba84537d2d7fc2ff4 |
| standing-hub/standing-bird.js | b33abb4ec5329c7076bfd9b726e3a48937cf08219c6d437cc38bfda888cfe8b8 |
| standing-hub/standing-cap.js | e3a221da5347da49bedbd85c88c075e19e20fbb07bbbcdcdad5b7ac8bc7ff457 |
| standing-hub/standing-feet.js | 159f3a81f9c58b2930913118804474f9bd2938953bd17bf19877ee63b8b8df91 |
| standing-hub/standing-geometry.js | 957131beb01add4f733f128d6878f7262b1d776fd3fbeba58edb98edfd4c0325 |
| standing-hub/standing-plumage.js | 3e955470fe8664880f87eb10eb197ba1c9c374ce9d9e0c5dfb6c2504c4e56675 |
| standing-ride/ride-bicycle.js | b0cfb696f5885d845da22ea091f475c074151cd7619c7229a49d8d2ba519d64d |
| standing-ride/ride-dismount-hop.js | e25cde8bd383f947ac4fe5d2f3651fc62994cd820ce245daca243ea3af69e598 |
| standing-ride/ride-dismount-kit.js | 1528d2be8c7b16c7813b008cf6c2b7f5fa255f2b4b063ce6c520a1a95b87a1d2 |
| standing-ride/ride-dismount-step.js | 1f082e03e71eb1397379caf44ecebb72b3a9f3913ffb024fdc1ffb77465e66c7 |
| standing-ride/ride-dismount.js | 416efe60c4646db98ac1d7c05a6288245df6e6c738f224cce58a3db198e3b68a |
| standing-ride/ride-geometry.js | 9740b1213f9726c09880a053bb46a62a25ee9454e6837df39862228a05251855 |
| standing-ride/ride-leg.js | 0e0dfed2570b335abfbbbb6c694c369793c91240c4b4422b8ccc5b86643dc613 |
| standing-ride/ride-motion.js | 9a08eb875d8fa402c014e683deadb45292e65efa790c87d4411115a3b88fb7b4 |
| standing-ride/ride-rig.js | c86cc2ea390aa4abb997c898d2b64a278b72617790b91f182adb93b18b00a8a7 |
| standing-ride/ride-scarf.js | a5b8a0d8b15bc1f127763a0cabe1a2cd4e7a817a4483f466ad0ecf41e49b46e3 |
| standing-ride/ride-timeline.js | a958fe80ff3b1b67f7586f941fdbca2014ba107dde2cea31d5ee7012ca7cb58d |
| standing-ride/riding-pelican.js | d6c696e8acfe0f39d4259cb069e394d3d34b4c55041dbefea76b77170d6e6835 |

- 未复制：`standing-hub/standing-shading.js`（2D 插画着色）；`standing-ride/` 下的 `ride-rider / ride-versions / ride-world* / ride-stage / ride-controls`（剧情舞台、相机、场景，本游戏不用）。
- 外部依赖只有 `three` 与 `three/addons/utils/BufferGeometryUtils.js`（`ride-geometry.js`），后者游戏已在用。
- `*.d.ts` 是本项目为 TS 编写的类型声明（非源文件的一部分，不在哈希表内，可按需修改）：
  - `standing-hub/standing-bird.d.ts`：`createStandingBird`
  - `standing-ride/ride-rig.d.ts`：`RIDE_RIGS`、`validateRig`、`svgToWorld` 与 RideRig 只读子集
  - `standing-ride/ride-bicycle.d.ts`：`createRideBicycle`
  - `standing-ride/ride-leg.d.ts`：`createBentLeg`
  - `standing-ride/ride-motion.d.ts`：`pedalLegs`、`birdPlacement`、`birdToRide`、`rideToBird`
  - `standing-ride/riding-pelican.d.ts`：`solveRideWing`、`wingPose`、`rideLegOptions`

## 禁止修改
- **不得修改本目录下的任何 `.js` 文件**（`test/vendor-integrity.test.ts` 会因哈希不符失败）。需要不同的姿态/层级时，在 `src/render/pelican/` 中按部件名重挂层级或在外部组合实现。
- vendor 文件只能依赖 `three`（含 `three/addons`）或本包（`vendor/pelican-3d/**`）内的相对路径（`test/architecture.test.ts` 约束）。
- 若要升级：从源目录重新整份复制（保持目录结构），更新上表哈希，并运行 `node --test test/vendor-integrity.test.ts test/pelican-view.test.ts`（rig 测试固化部件名契约与静止包围盒）。

## 使用约定
- `createStandingBird({ round: true, wings: true, smooth: true })` 后调用 `setDepth(1)`（实心 3D 形态）。`setDepth` 会改写 `group.scale.z`，外部缩放只能加在外层 root 上。
- 鸟坐标：喙朝 +X、+Y 向上、+Z 为近侧，原点在脚底；包围盒约 x[-2.56, 2.89] y[0, 5.24] z[-1.07, 1.23]。
- 车型用 `RIDE_RIGS.short`（「矮车」，整车 ×0.6）。骑行坐标系：+X 前、+Y 上、+Z 朝相机，轮胎地线 y = 0。
- 「矮腿版本」说明（任务 008）：`.work/bike/short/` 的鸟网格与 `standing-hub/` 逐字节一致，「矮」只体现在骑行时的 IK 腿；站立腿本身即短腿。
