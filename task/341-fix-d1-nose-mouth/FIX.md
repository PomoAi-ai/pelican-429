# FIX -- D1 鼻唇下巴侧面轮廓

## Status: verifying
## Task: 341
## Related: 339
## Baseline Commit: 975f136

## Problem
原模型鼻尖、鼻下与上唇呈连续鼓面，闭口笑和下巴的轮廓与用户参考差距明显。本次完成局部几何修复与共享资产接入，不代表整张脸已经完全复刻参考。

## Root Cause
原 `d1_head_from_source.py` 的 `refine_nose_lips` 仅做最大不足0.002的外推，保留了源模型口鼻轮廓。简单扩大鼻尖形变会让宽鼻底朝下并产生大灰斑；隔离法线贴图证明该灰斑主要是几何受光。原深棕色唇线另存在于底色贴图，不能靠几何或法线修改完全消除。

## Fix Plan
- [x] 从参考记录12个侧面特征点，以眼颏尺度和鼻根深度分别定位；锚点未经完整注册，不将条件性误差当作严格相似度。
- [x] `d1_nose_mouth_fit.py`：在原有Catmull-Clark曲面后增加SIMPLE控制点，连续局部修正小鼻尖、鼻梁、鼻底过渡、浅唇缝、嘴宽、嘴中央峰和颏部；保护眼睛和头部边界。
- [x] `d1_head_from_source.py`：替换旧微调函数，从原始refined资产重建，不叠加候选形变。
- [x] 导出独立头部与共享动画GLB；身体、独立发型和四动作保持现有装配方式。

## Verification
- [x] Blender有限坐标、UV逐项一致、保护区域坐标不变及位移边界断言通过。
- [x] 正面、侧面、45度同镜头渲染复核，无新增横纹、台阶或独立漂浮唇条。
- [x] 独立QA：526点变化；生成时最大位移0.02058077；相对于旧正式含tiny微调基线最大位移0.01897407；范围外0、UV差0、基础色像素差0、402眼色/眼线点位移0。
- [x] 鼻底灰斑修正：同灯光材质平均亮度0.74777→0.81148；局部法线Z从-0.660→-0.413；没有提高全场灯光或修改肤色。
- [x] 实际浏览器正面、右侧、45度截图检查；呼吸与走路可播放，未捕获控制台error。
- [x] 最终GLB含idle、walk、run、jump四动作、一套蒙皮骨架，装配尺寸断言通过。
- [x] `npm run typecheck`通过；`npm test` 1842项全部通过；`npm run build`通过（保留包体积提示）。最终资源更新后重新构建一次。
- [x] `git diff --check`通过；局部diff审查无吞错或假成功兜底；未添加渲染实现细节测试。
- [ ] 用户复核：侧面有改善，但正面更差、脸仍不到位。几何自检和集成通过不代表造型验收通过；本项重新记为未完成。

## Evidence
`assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular/nose-mouth-fit/` 下保存参考特征、基线、同镜头before/integrated三视图、integration-qa.json、nose-shadow-diagnosis.json与export-check.json。冻结基线的相对材质路径按原modular目录解析，避免候选因roughness等图片缺失而出现虚假镜面高光。

## Remaining differences
- 原深棕唇线仍偏深，45度嘴角偏尖，整体下颌底仍偏平；需要继续造型和材质精修，不能称最终参考复刻。
- 裸头与头皮衔接的未通过项仍由339记录；本次没有解决自由换发型、表情拓扑或低面数LOD。
- 不提交、不推送、不调用外部付费生成。
