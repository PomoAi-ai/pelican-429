# D1 Blender 头发候选

本轮候选为 [native-07/D1-Hair.blend](native-07/D1-Hair.blend)：55 条可编辑 Bézier 发束、普通发束与嵌入式编辫两种截面。完成偏分刘海、分层后冠、露耳短发、细鬓发和贴头编辫；所有历史阶段保留。

实时页面：`http://127.0.0.1:5184/render-lab.html?hair=blender&framing=head&angle=0`。九套渲染一行两个；头发下拉框可选择本轮四个 Blender 阶段及此前六种候选。

| 页面参数 | 原生阶段 | 游戏用资源 |
| --- | --- | --- |
| blender-bob | native-02 整体短发 | d1-outfit-blender-bob.glb |
| blender-ear | native-03 露耳版 | d1-outfit-blender-ear.glb |
| blender-crown | native-04 冠发分层版 | d1-outfit-blender-crown.glb |
| blender | native-07 贴合细化候选 | d1-outfit-blender-hair.glb |

资源均位于 `public/characters/human/render-lab/`，仅在独立实验页使用。发布时把原生发束插入冻结全身文件，身体、头部、眼睛、骨骼和四个动作的二进制数据保持原样，没有重采样。`publish_hair.py` 的发布检查确认数据一致，并将发束绑定到冻结骨架的 head。

native-01 到 native-07 都保存了独立模型和正/侧/斜/背/顶视图。初始建模准备文件 `D1-Hair-Studio.blend` 也保留，它不包含最终新发型。

- 场景：D1 Hair Studio；坐标为 Blender Z 向上、正面 -Y。
- 头部、身体、服装、骨骼与 idle / walk / run / jump 来自独立实验页冻结资源 `public/characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb`。
- 原 Hair 隐藏，只作尺寸参考；新发束与截面自行绘制，没有使用旧头发网格生成新造型。
- 七视图原画已打包在 blend 中：`public/art-library/d1-seven/character-seven-views-slim-legs-v1.png`。
- Blender 5.2.2 LTS，MCP for Blender 2.1.3，插件版本 1.8，协议 13；本地服务端口 9876，当前场景开启自动启动。
- 已实测 MCP 读场景、返回最终视口并保存 blend；CLI 负责独立建模、GPU 渲染和导出。

在 Blender 编辑时，隐藏 `Hair` 导出网格，显示 `Editable hair curves` 中所需曲线；各控制点可修改位置、半径和倾斜，截面位于 `Editable bevel profiles`。生成配方同时保存在最新 blend 的文本 `Native hair recipe.py` 中。后台配方重新生成需使用新的阶段目录，避免覆盖历史阶段。

实时动画固定帽壳、冠发和编辫，自由发梢按根梢进度弯曲；眼睑沿用游戏的眼部着色。离线 Blender 图的眼白不包含游戏着色器生成的蓝色虹膜，眼睛效果请在实时页面看。

最终四视图遮罩、叠图和测量位于 [reference/comparisons/native-07](reference/comparisons/native-07/README.md)。原画的顶部深度与侧面不完全一致，原画冠顶估计约 3.14，运行时保持 3.1 的尺寸契约；冻结头部也与原画脸形不同。当前仍为候选，`all_views_pass=false`，没有宣称像素级完全匹配。
