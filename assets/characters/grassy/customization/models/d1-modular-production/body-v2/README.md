# D1 身体 v2（Rodin ce912294，白色两件式细腿）

旧身体链路（`../assembled-base`、`../animated-base`、`../game-lod`、`../outfit-v3`、`../equipment`）保持不动、可复现；本目录按同样结构复制脚本，只改源路径与新身体的骨位、权重分区。

| 目录 | 脚本 | 产出 |
|---|---|---|
| `rodin-log/` | — | Rodin 逐版记录 |
| `source/` | — | Rodin 导出 zip 与解压 |
| `head-shape/` | `build.py` | 读 `../head-hair-fit/head-hair.glb` 的已认可 v9 头，按无发原画 `public/catalog/d1-bald/d1-bald-slim-legs-v1.png` 的正侧轮廓叠图修形：后脑收短、耳朵放大外翻、后颈与下颌底收进、颈部收细（鼻子和嘴的立体保持原样）；只动顶点，UV 与贴图不变。导出 `head.glb`，后续各步都读这个头 |
| `hair-rodin/` | `fit.py` | 已停用（由 `hair-v2/` 取代）：Rodin 头发（资产 0eb6a0de 第 5 版，对称，`source/` 为 2K PBR 导出）：缩放到旧发型外轮廓、头顶 2.12，穿进头骨的顶点沿径向软外推（保留发束厚度），脸前与两侧离头骨超过 0.16 的部分平滑收回（侧发贴住脸颊，后脑和头顶的发量不动）；保留 Rodin 法线贴图作发丝凹凸；贴图亮度压到 0.27–0.58、保留色相（运行时头发着色按亮度三次方加深）；读 `../head-shape/head.glb`（不改），导出 `fitted.glb` |
| `hair-rodin/` | `braids.py` | 已停用：读 `fitted.glb`（`fit.py` 输出）：Rodin 两侧的鱼骨编发块沿编发路线压平成贴头皮的薄层，上面补细发束，再按原画放两条三股辫（太阳穴 → 耳上 → 耳后）；耳朵扇区编发以下的发束删掉露出耳朵，耳前耳后补长发束遮住切口。新几何用第二个头发材质 `Golden hair roots`，贴图取 Rodin 贴图自身的暗/中/亮发色。导出 `head-hair.glb` |
| `hair-v2/` | `build.py` | 程序化头发（发片表示，同 VRoid/CHARM：每缕一条控制点线加宽度厚度）：读 `../head-shape/head.glb`（不改），后脑发束根部收窄成楔形、间距约等于宽度、每缕独立层（重叠面会闪烁），下层错开半格填缝；发尾逐渐外扩；斜扫刘海、耳前侧发、耳后补发、两侧三股编发（分线旁 → 头侧 → 耳上后方），耳朵露出；每缕独立贴图格，Cycles 烘焙接触阴影只轻微压暗，亮度压在 0.27–0.58（运行时头发着色按亮度三次方加深）。导出 `head-hair.glb` |
| `head-look/` | `build.py` | 读 `../hair-v2/head-hair.glb`：眼睛移到独立贴片（Head 第二材质 `D1 eye`，眨眼四帧图集 `eye-atlas.png`，虹膜由运行时着色器画），头部贴图眼区补肤色；眉毛按原笔画拟合二次曲线重画成细弧，厚嘴唇擦掉改画原画的细微笑线（补色在头部弧长/高度网格上取周围肤色，不跨 UV 岛），头发原样透传，导出 `head-hair-look.glb`；`style-compare.jpg` 为原画/旧版/新着色对比 |
| `assembled-base/` | `recolor_skin.py`、`assemble.py` | 皮肤按 v9 头调色、接头与头发，`d1-base-static.glb` |
| `landmarks.json` | — | 新身体关节位置（装配单位，水平切片 + 正交网格图测得） |
| `animated-base/` | `build_animation.py -- --preview`、`validate_export.py` | 22 骨四动作，`d1-base-animated.glb` |
| `game-lod/` | `build_lod.py`、`validate_export.py -- game/light` | `d1-base-game.glb`、`d1-base-light.glb` |
| `outfit-v3/` | `fit.py` → `animate_outfit.py` → `build_game.py`、三个 validate | V3 裙装 + 旧靴，26 骨，`d1-outfit-game.glb` |
| `equipment/` | `assemble_equipped.py`、`validate_equipped.py` | 复用 `../equipment/equipment-game.glb`，`d1-equipped-game.glb` |

所有脚本用 `Blender -b --python-exit-code 1 --python <脚本>` 运行（`--cycles` 会被 Blender 当作自身参数，循环小图用 `animated-base/render_cycles.py`）。

## 与旧链路的差异

- `build_animation.py`：手臂测地种子、腿/躯干分界 .70–.84、头颈 1.255–1.315、脊柱 .82–1.0、手腕 .77–.83、肘 .92–1.05、踝 .10–.175、脚趾 y -.10–-.06 按新身体重设；验证门槛不变。
- `fit.py`：裙装源与靴子仍读旧目录；对位常数（`SCALE=.654`、腰缝 1.57、`Y_SHIFT=.027`）不变，新身体腰最细处在 z≈1.575，与旧身体一致。
- 靴子沿用旧左右靴，正/侧/斜前检查无脚部穿出；鞋底与鞋面绑 foot，靴筒在 z .15–.26 渐变到 shin，走跑时靴筒随小腿。

## 验证

- 四动作逐帧：颈缝 0、支撑脚离地 <8e-6、小腿/脚刚性 <3e-7、循环端点差 0；穿衣版与 LOD 同样通过。
- 导出重导入：base animated/game/light、outfit（26 骨、6 部件、高 3.1、脚底 0）、equipped（3 挂点逐帧相对矩阵误差 <6e-7）。
- 展示场截图：`showcase-three-variants.jpeg`（基础 / 穿衣 / 装备）。
