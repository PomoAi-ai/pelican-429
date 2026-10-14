# 闭眼外眼角多瓣的只读归因

根因确定：实际 Head 的肤色表面仍保留旧睁眼上睑凸圈和三瓣实体睫毛。新的眼贴片眨眼只移动颜色/透明覆盖，旧实体不随闭合，因而露出浅肤色多瓣；脸部描边会加强粉色边线，但不是根因。

## 决定性证据

1. `head-base-clay-0.png`、`head-base-clay-45.png` 和 `head-base-clay--45.png` 直接使用当前 GLB 的 `Head / model` primitive，在完全移除 D1 eye、所有纹理和运行时描边后渲染。两侧三瓣实体睫毛与睁眼凸圈仍清晰存在。
2. 主线程在同一 45°、run 0.264 s、闭合 100% 状态切 V8 隐藏全部描边，`../temple-root-continuity-study-01/runtime/run-closed-v8.png` 中多瓣仍在，近侧上眼圈也显露。闭眼黑线独立下降。
3. 50% 闭合的 jump 画面已出现同样残留，说明不是 run 某一帧或头发惯性的特例；睁眼时黑色上睫毛覆盖旧凸缘，半闭/全闭后旧形露出。

## 实际对象与着色路径

实际文件为 `public/characters/human/render-lab/d1-outfit-blender-temple-root-v1.glb`，SHA256 `ea7242b7607b23d6a823c238811fe3b3064fb968d39c404741fd3fc5dc7afde6`。Head 是 mesh 2，其 `model` primitive 为 16160 顶点、29872 三角形；唯一 `D1 eye` primitive 为 14618 顶点、28104 三角形。没有单独 Eyes 节点。

精确坐标焊接后眼贴片为两侧各一张单层拓扑圆盘，各 7241 唯一顶点、14052 三角形、Euler 特征 1、无非流形边。因此不是重复叠放多层眼片。闭眼图集右下象限只有一条深色睫毛弧；alpha > 0.05 的 19076 像素中无粉色像素。提取的实际嵌入图片为 `eye-atlas.webp`，未改动图片。

`src/render/grassy/d1-lab-eyes.ts:52–54` 在 closure=1 时将最终眼部颜色完全替换为闭眼象限，眼睛开口乘以 0。没有残存睁眼图混合或虹膜。`src/render/grassy/d1-anime-material.ts:449` 明确把 eye 的描边材质设为不可见；可见脸部外壳来自 `model outline`，它引用原 Head 几何。`d1-lab-looks.ts:96` 在 V8 隐藏所有描边，和实际消融结果一致。

Head 两个 primitive 都无 morph targets，四动作均只有 translation/rotation/scale 通道，无 weights 通道（见 `runtime-structure.json`）。眨眼闭合度只送入眼部着色 uniform，旧实体持续保持睁眼状态。

生成链 `body-v2/head-look/build.py:2` 明确保留旧 Head 的位置和 UV；第 382–408 行只把旧眼睛/睫毛颜色补成皮肤，第 452 行再把新眼贴片投到该旧表面上。它没有回收旧睫毛实体。当前 Head 与冻结来源逐字节一致，所以本次头发修复没有制造这一缺陷。

## 最小修复方向

在独立新眼部阶段中，只修两侧旧睫毛和睁眼凸圈覆盖的 Head 局部区域，回收到邻近皮肤支持的连续眼周曲面；保留鼻、嘴、眉和区域外 Head。真实眼贴片保持拓扑、UV、四帧图集及闭眼 shader，仅随修复后皮面重新贴合，避免旧凸缘再次传递到贴片。不要整片前推，也不要调头发或关闭整张脸的描边来遮住问题。

先检查灰模及原色的正面、两侧 45°/侧面和 0/50/100% 闭眼，确认没有挖坑、闭眼凹陷、贴片穿插或鼻眉漂移。原图集与四动作可保持不变，本缺陷不要求重写眨眼时钟。

后续眼部导出必须明确保留修后的 Head primitive。现有 `publish_hair.py` 的语义是仅把 Hair 放回冻结原模型，直接沿用它会丢掉 Head 修形；应在本独立眼版中显式构建修后 Head 数据，同时冻结 Hair 所有逐束属性及身体/骨架/四动作，保持既有 Hair-only 发布器语义。

本阶段只读研究未改源码、模型或公开资源。几何/图集细节见 `geometry-report.json`，原三瓣定位见 `rim-landmarks.json`。后续离线候选单独存放，不覆盖这些诊断证据。
