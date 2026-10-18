# FIX — 飞行车侧面动作与非塑料质感

## Status: done
## Task: 513
## Related: 508, 501
## Baseline Commit: c292d188

## Problem
横版游戏主要看到侧面，上一版以透视效果验收，白色表面高光均匀显塑料，尾喷机构被侧壳遮挡、侧面喷流过细，起飞和前进不易辨认。

## Root Cause
- assets/vehicles/white-vtol/build_model.py：大块白色表面材质一致、金属分区弱；固定尾侧壳覆盖可动喷口。
- src/render/flying-roadster-view.ts：尾流侧面光片仅0.18宽，主喷流从侧面接近细线。
- src/ui/showcase-model.ts / src/ui/model-camera-controls.ts：飞行车沿用通用45°初始与复位角度，偏离游戏侧面。

## Fix Plan
- [x] 精修共用Blender模型材质分区，显示尾喷侧面可动结构；保留侧面比例与固定三轮。
- [x] 按实际喷口厚度改善侧向离子流的可见性。
- [x] 飞行车默认和复位使用右侧，其他角色不变。

## Verification
- [x] npm run typecheck：通过，见 evidence/typecheck.log。
- [x] node --test test/showcase.test.ts：34/34通过，见 evidence/showcase-test.log。
- [x] npm test / npm run build（共享模块交付检查）：全部通过，构建保留已有chunk体积警告。
- [x] 浏览器严格侧面检查静止、起飞、前进、轮滚和开罩；保存同角度截图。
- [x] diff-guard：不新增渲染细节或常量测试，不引入防御兜底；定向审查未发现高置信回归。

## 验收记录
- npm test：2003/2003通过，见 evidence/test.log。
- 默认右侧90°，改正面与俯仰20°后按复位，回到右侧90°、俯仰0°。
- 浏览器检查侧面悬停、巡航、面罩打开和地面滚动；最终资源重新载入，截图为 evidence/hover-after.png、evidence/cruise-after.png，控制台无错误。
- 未新增自动渲染细节测试；外观以同一游戏资产的浏览器实际截图验收。

## 最终资源
- 白漆metallic 0.32，保留清漆高光；下裙、进气分流片和尾喷外框为独立铝合金，玻璃使用原共享透射材质。
- 尾侧壳缩短露出转轴，方向针随整块尾喷转动；固定壳体为尾喷旋转轨迹让位。独立Blender检查-90/-60/-30/0度，未发现尾喷与固定尾部三角面相交。
- GLB：33 meshes / 34 primitives / 8 materials；SHA256 `6b5dea53ff30fd8b1caccd76183cd6cdc12dce1c26bdb9ac2d1a6b03f2f06ab8`。
- 定向子代理审查：关节、喷口方向和站立标记保留，未发现高置信回归。
- 本轮没有重新人工验证港口登车与场景性能，没有提交或推送；游戏和展示场直接共用这份GLB与驱动。
