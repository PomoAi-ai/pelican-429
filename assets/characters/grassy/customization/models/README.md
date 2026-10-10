# 主角捏人与女性模型源资产

本目录保存实际 CLI 生成的六套模型、参考图、Blender 注册工程及真实渲染。`generation-ledger.json` 记录每套完整模型与 BANG 分件任务 ID。`s1` 至 `s6` 分别对应 `royal`、`urban`、`explorer`、`soft`、`dark`、`sport`。

生成使用 Hyper3D `Gen-2.5-Medium`、`Quad`、目标 18,000 面，共完成 6 个模型生成任务和 6 个分件任务。账户读数从普通额度 25 / 订阅额度 24 / 冻结 0 变为 25 / 18 / 0，确认订阅额度总共减少 6；服务未返回每个请求的独立扣费明细。保留的结果 JSON 已删除有时效的签名下载地址，不保存认证信息。

男性源资产及形变契约在 `male/`，对应生成脚本是 `scripts/character_customization/male.py`。

## 源文件与重建

每套 `reference-front.png` 是生成输入；完整原始网格位于 `s1/source.glb` 或其余目录的 `original/base_basic_pbr.glb`；BANG 结果位于 `parts/base_basic_pbr.glb`。完整源网格保留原始贴图。BANG 用于头发分件及头脸分割引导，服装始终从完整源网格提取，避免自动分件遗漏深色夹克或裙子。

已有源文件的本地重建不消耗模型额度。先生成公共头脸所属的 royal，再生成其他五套：

```sh
blender --background --python scripts/character_customization/female.py -- --style royal --render
blender --background --python scripts/character_customization/female.py -- --style urban --render
blender --background --python scripts/character_customization/female.py -- --style explorer --render
blender --background --python scripts/character_customization/female.py -- --style soft --render
blender --background --python scripts/character_customization/female.py -- --style dark --render
blender --background --python scripts/character_customization/female.py -- --style sport --render
blender --background --python scripts/character_customization/preview.py --
blender --background --python scripts/character_customization/preview.py -- --style royal
```

如需重新付费生成，可对相应参考图调用：

```sh
hyper3d generate --image assets/characters/grassy/customization/models/s1/reference-front.png --tier Gen-2.5-Medium --mesh-mode Quad --quality 18000 --format glb
hyper3d status GENERATION_ID
hyper3d bang GENERATION_ID --strength 10 --format glb
hyper3d result GENERATION_ID
```

新生成或重新分件的部件编号可能变化，必须先检查并更新 `female.py` 的 `PARTS`，不能将旧部件编号盲用于新结果。下载时将 CLI 新返回的结果 JSON 临时保存在仓库外，再执行 `uv run python3 scripts/character_customization/download.py 临时结果.json 输出目录`。不要把签名下载地址提交到仓库。

## 运行时资产契约

- 输出位于 `public/characters/human/customization/female-{style}.glb`；其源工程保存在本目录对应的 `female-{style}.blend`。
- 全身注册到原主角 3.1 单位高度与现役 22 根骨骼。运行时按骨骼名重绑到原主角骨架，复用原背包、腕部装备、背带及 15 组动作。女性 GLB 不重复导出装备或动画。
- `royal` 导出 `body`、`hair`、`outfit`；其余五个 GLB 只导出 `hair`、`outfit`。公共头脸与连续圆颈来自 royal。头部下沿和服装领口采用真实平面切分，避免按面中心或肤色删除造成碎片；独立圆颈与头体交叠，换装时不会夹带 S1 的衣领。每份 Blender 源工程仍含公共头脸，供真实完整渲染。
- 网格 extras：`customPart` 为上述部件名，`customStyle` 为款式名。材质 `custom.skin`、`custom.hair`、`custom.top`、`custom.bottom`、`custom.shoes` 保留原贴图；`customizationChannel` 指明调色通道，`customBaseColor` 为比例调色的基准十六进制颜色。
- 脸型为 `FaceWidth`、`FaceLength`、`JawWidth`、`ChinLength`、`EyeSize`、`EyeSpacing`、`NoseSize`、`MouthWidth`，范围 -1 至 1，0 为中性。头发同步包含这 8 个目标以跟随头围。
- 眼睑含 `Blink`、`BlinkHalf`，并含每个脸型目标与两种闭眼状态相乘的 16 个修正目标，名字为脸型名直接拼接闭眼名。所有新增 morph 显式归零后导出。
- 头发另含 `HairFrontSway`、`HairFrontLift`、`HairCrownSway`、`HairCrownLift`、`HairRearSway`、`HairRearLift`、`HairTurn`。
- 服装以表面距离区分袖子和躯干，再以连续权重约束裙摆；每个点最多 4 根骨骼。贴图导出最长边为 1024，原始高分辨率贴图仍在源 GLB。

## 可视验收产物

每套的 `registered-front/right/back.png` 为实际 Blender 网格渲染，`neck-front/right.png` 为头颈至胸部近景；`pose-ride/takeoff/keyboard_smash.png` 使用游戏当前动作；`female-six-styles-render.png` 为六套真实网格的正面联系表。`s1/blink-closed.png`、`face-extreme-1.png`、`face-extreme--1.png` 用于中性闭眼及 8 个脸型轴同时达到正负极值时的闭眼联动检查。上述图片均由模型渲染，不是 AI 概念图。

衣袖与裙摆采用游戏原有线性蒙皮，无布料模拟。大幅屈肘时衣袖会产生折叠；动作检查重点是手臂轮廓连续、无分叉手臂，以及骑行时腰裙和腋下无大面积裂缝。已按同一修正重新导出全部六套，并分别渲染骑行、起飞与键盘攻击姿势。

## 网页资源生成与验收

在项目根目录执行以下命令，覆盖男女七份定制模型的六档网页资源。需要已安装 ImageMagick、WebP CLI 和 KTX-Software；KTX 工具不在 PATH 时通过 `TOKTX` 指定 `toktx` 的绝对路径。

```sh
node scripts/build-web-models.ts --only=characters/human/customization/
node scripts/build-web-models.ts --web-1k --only=characters/human/customization/
node scripts/build-web-models.ts --ktx2 --only=characters/human/customization/
node scripts/build-web-models.ts --ktx2-256 --only=characters/human/customization/
node scripts/build-compact-models.ts --only=characters/human/customization/
```

纹理转换通过临时文件输入输出，避免 macOS 原生图片工具双向管道挂起；转换器会检查非图片缓冲区、数据贴图和透明度。压缩报告记录源 SHA-256，compact 报告另含几何量化误差。最终六档每档7份定制资产都已核对源哈希与输出大小，默认512 compact档合计12.43 MiB。

应用端已通过 `npm run typecheck`、`npm test`（1816/1816）与 `npm run build`。浏览器实际检查了原始及默认compact资源、男女切换、独立发型/服装搭配、捏脸与调色、取消/保存/刷新、游戏内换装及双向变身，以及390×844布局。最终界面截图为 `editor-preview.jpg`。死亡/传送流程和实体手机性能未专项实测。
