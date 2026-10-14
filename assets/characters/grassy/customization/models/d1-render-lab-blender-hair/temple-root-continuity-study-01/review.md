# Temple 根部连续性修复

结论：`draft-01/Temple-Root-Continuity.blend` 通过本次局部结构与保存动作范围的检查，可作为后续整合候选。它只修复两条 temple forelock 的旧根；没有进行上一轮被否决的缩梢，也不表示整头美术或最终动画已经验收。

## 固定来源与产物

- 来源：`../underfold-return-study-01/draft-03/Underfold-Return-Sculpt.blend`。
- 来源 SHA256：`b8e3f7e6eafa05dc93d415547c211aa06a490f5123999194381e55e7e8524b41`。
- 候选：`draft-01/Temple-Root-Continuity.blend`。
- 候选 SHA256：`86ed3bf38c97c06d0b0004f88fab393541e52e10d79523607c4f25b92f17ecdc`。
- 灰模检查源：`draft-01/Temple-Root-Continuity-Clay.blend`。
- 实际三视：`draft-01/front.png`、`draft-01/right.png`、`draft-01/three-quarter.png`。

源与所有旧阶段保持不变。局部修复完成后已另行导出并接入独立阶段选项，集成记录见文末。

## 旧问题的真实复现

旧源的左右 temple 分别存在 302、288 对根部自交。旧根压扁后的截面发生折返，且部分固定、过渡、全可动面已进入实际 Head。

独立回放使用现有导出器实际生成的 runtime T 与 root/tip，复现 stiffness 0.72、区域权重、TRAVEL、长度约束和 quintic 权重，并采用运行时 float32 位置精度。检查覆盖 idle、walk、run、jump 四动作和 translation、head-turn、single-axis-sway、diagonal-sway 四压力组，共 1780 帧。

旧源固定根最深采样左 -0.009039986、右 -0.009819486；可动采样左 -0.003719193、右 -0.008616453。有限三角检查证实并非仅保守下界为负：左固定/过渡/全可动面分别有 154/19/12 对真交叉，右为 148/15/34 对。最深的过渡面主要是静态已经穿入，压力动作只进一步加深很小的量。

## 本次修复与冻结范围

仅修改 `Left temple forelock`、`Right temple forelock` 的第 0–13 环；第 14 环起的原几何和 tip cap 保留，每条下段共 757 个顶点逐点不变。原网格连接关系保持。薄根截面沿真实头皮外侧连续展开，以平行传递的截面框架接回原第 14 环；校正以整个截面沿实际 Head 法线移动完成，没有逐点投影造成的新折叠。

两个候选均为单一闭壳、正体积，精确自交检查为 0。根导引到实际 Head 距离约 0.003；前 3 环实际皮面距离左 0.001467–0.007737、右 0.001468–0.007779，未用旧嵌皮中心线冒充新根。

另 52 个 mesh、全部图像像素和原活动图集 UV 均逐项哈希或数值核对不变，包括两条已修好的 underfold。没有改色，也没有改 Main。

## 导出与运动参数契约

为两条修复后的网格使用现有 `ordered-closed-sweep` / `sectionSize=28` 约定，新增 `Hair flow native` 层。U 来自原图集条带的归一化值，V 保存旧源实际导出的逐顶点 T；所有顶点的 float32 T 完全相同，`T <= 0.3` 固定掩码也完全相同。没有修改导出器或运行时规则。

`guideBlender` 改为实际新几何截面中心，保存后读回再次核对，包含原导出器对端帽所在层的中心计算。新根真实位置使下段 flow 发生小量合理变化：左最大 0.290811°、平均 0.067958°；右最大 0.274749°、平均 0.082924°。没有为冻结 flow 数值保留虚假的旧根路径。

`draft-01/saved-audit.json` 由重新打开保存文件后生成，确认候选与来源哈希不变，冻结的 52 件、图集、下段顶点、UV、T 和固定掩码均符合上述契约；没有遗漏对应的可编辑曲线句柄。

## 实际动作结果

独立子代理对两条候选各检查 1150 个顶点、3444 个唯一边中点、2296 个三角形中心，固定区与可动区分开统计；可动采样包含跨越 T=0.3 的面。

| 区域 | 左最小间距 | 右最小间距 |
|---|---:|---:|
| 固定根，全部保存帧 | +0.001328669 | +0.001323446 |
| 可动区，全部保存帧 | +0.001686534 | +0.001547591 |

1780 帧全部采样点无负距。有限三角检查覆盖 rest、旧源全部选定帧、候选每组最坏采样帧和最大位移帧，左 42 帧、右 41 帧；固定根、过渡面、全可动面全部 0 真交叉。最坏可动采样分别出现在 single-axis-sway 全局帧 1326 和 1355。

完整证据：`baseline-motion/report.json`、`draft-01/motion-check/report.json`、`draft-01/motion-check/acceptance.json`。可复用回放脚本为 `baseline-motion/replay.py`。

## 三视实看与限制

正面、右侧、45° 灰图均实际打开检查。可见下束和长梢保持来源造型；根仍自然藏在编发与覆盖层下，没有新露出的直茎、缺口或块状肩部。本稿是隐藏根部的结构修复，旧长梢、宽片感和全头参考匹配仍由后续美术判断处理。

检查覆盖保存动作帧的表面采样，以及选定帧的有限三角交叉；不构成连续时间、每帧全部三角内部、共面接触、发片之间互穿的完整证明。原色浏览器动态高光尚未验证，只有 flow 变化量和灰模三视证据。`geometry-report.json` 中整体 `visualApproval`、`animationApproval` 仍保留 false，避免把本局部通过当成整头审批。

离线制作阶段实际运行 Blender 后台制作、灰三视渲染、来源与候选动作回放、保存文件读回验收，均成功；该阶段未触碰应用代码、导出器或发布资源。

## 独立阶段集成

主线程随后实际查看原色三视，接受本次局部根部修复，整体美术仍不合格。依据其授权，使用已经准备的 `draft-01/PBR-Game-Export.blend` 导出独立版本。PBR 源 SHA256 为 `995f9d7feb0afcf89691702a230d2a2da0c833d60a468e31eb2b6aac95f24431`。

实际执行的导出命令如下，退出码 0：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python assets/characters/grassy/customization/models/d1-render-lab-blender-hair/export_assembly.py -- --blend assets/characters/grassy/customization/models/d1-render-lab-blender-hair/temple-root-continuity-study-01/draft-01/PBR-Game-Export.blend --output-dir assets/characters/grassy/customization/models/d1-render-lab-blender-hair/temple-root-continuity-study-01/export
```

导出文件 `export/d1-outfit-assembly.glb` 和新增公开文件 `public/characters/human/render-lab/d1-outfit-blender-temple-root-v1.glb` 均为 34,195,344 字节，SHA256 均为 `ea7242b7607b23d6a823c238811fe3b3064fb968d39c404741fd3fc5dc7afde6`。写入前确认目标不存在，使用独占创建而非覆盖；依据 `public-before.json` 在复制前、复制后、构建后核对，原 28 个 GLB 全部不变。

独立子代理直接解析实际最终 GLB 核对，而非只读取导出器通过标记：原冻结数据的 6,639,984 字节二进制前缀完全保留，5 个非 Hair mesh、对应节点/材质/skins/原有 accessor 和资源声明不变；idle、walk、run、jump 每个动作的 78 channels 与 78 samplers 全部不变。Hair 为 1 primitive、268,990 个导出顶点、72 条 guides，完整绑定到冻结骨架的 head 关节。

实际 GLB 两条 temple 的 guide ID 为 68、70；每条因 UV 接缝复制导出为 1191 顶点、2296 三角形。其 POSITION + T + flow 的 float32 元组、三角拓扑与绕序均与候选一致，T 与 flow 最大绝对差均为 0，root/tip 精确一致。原固定掩码保持，未因导出重新归一化 T。完整审计为 `export-audit.json`，复现脚本为 `audit_export.py`；后台审计退出码 0。

应用仅在 `src/app/d1-render-lab.ts` 的 `BlenderHairStyle`、`HAIR_ASSETS`、`isBlenderHair` 和 `render-lab.html` 增加 `blender-temple-root`。选择文案为「Blender · 鬓发贴根与动画修复〔阶段稿〕」。默认选择、正式游戏资源及运行时均不变。实际本次代码差异保存在 `integration.diff`；检查新增差异未引入额外逻辑、兜底、运行时验证分支或测试。

四项命令各运行一次：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm test` | 退出码 1：1902 条测试中 1901 通过，1 条既有 architecture 失败 |
| `npm run build` | 退出码 0 |
| `npm run build:full` | 退出码 0 |

唯一测试失败为 `test/architecture.test.ts:255` 的纯逻辑扫描，报告 `src/config/art-library.ts uses window`；该文件不在本次修改范围，主线程在任务交付前已指出此既有失败。本次未修改该文件、测试断言或跳过测试。两种构建均成功；完整构建包含 `render-lab.html` 和新 GLB，其 SHA256 与导出/public 相同。构建的大 chunk 警告仍在，没有为本局部接入改动打包配置。

实际命令日志和退出码保存在 `integration-checks/`；集成汇总为 `lab-integration.json`。本子任务没有使用浏览器，原色交互动态验收由主线程进行；未新增渲染或常量测试，未提交、推送或改动主 PLAN。
