# D1 独立头部与发型

本目录保存保留原脸眼特征的曲面修复头部、独立编辫短发与装配后的 Blender 源文件。原始 Rodin 文件未覆盖；身体来自 `../animation/d1-animated.blend`。程序生成的候选没有通过视觉对照，已停用，保留在研究记录中。

**验收状态：戴当前发型的预览已接入；完整裸头与自由换发型尚未通过。** 隐藏头发后，源脸壳与头皮支撑存在额角折边和耳根开口。后续封闭/平滑候选仍有头盔状凸沿及片状耳根连接，未进入正式资产。独立文件和骨骼挂接不等于裸头造型已完成。审查证据见 `head-source-study/final-local-review.json`。

## 产物

- `head.blend`：保留脸眼UV，修复鼻唇曲面，增加独立睫毛和头皮支撑。
- `hair.blend`：独立 `D1_Hair_BraidedBob` 网格，保留源发束层次及纹理，补小洞、加内衬并应用曲面细分。
- `d1-modular.blend`：身体、头部、头发三个部件与原有骨架和四动作。
- `assembly-report.json`：部件、实际顶点数、尺寸与动画清单。
- `assembled-*.png`：正面、侧面、45°、背面和隐藏头发的实际渲染。

网页共享资产位于 `public/characters/human/customization/`：

- `d1-modular-animated.glb`：展示场使用的完整角色，包含 idle、walk、run、jump。
- `d1-head.glb`、`d1-hair-braided.glb`：未绑定的独立制作资产。
- `d1-hair-braided-rigged.glb`：已绑定兼容骨架的独立发型，不包含动作。

## 坐标与换发型约定

制作坐标为 Z-up、正面 -Y，脚底 z=0，全高约 3.1；GLB 导出为 Y-up。头骨挂点为原骨架的 `head`，静止原点 `(0, 0, 2.17)`。独立制作文件使用整个人物的坐标，没有额外居中或缩放。

完整模型中的头部和发型分别带 `characterPart=head` 和 `characterPart=hair` 元数据。多材质 GLB 可能将一个部件载入为 Group，显示/隐藏操作作用于带元数据的整个 Object3D。新发型需使用相同坐标和 head 骨绑定；加载独立绑定发型后要复用角色当前骨架，不能把另一套静止骨架直接摆进场景。

展示场的“头部检查 · 隐藏头发”复用同一个角色资产，只改变发型可见性，便于检查脸型与部件分离。

## 曲面与边界

原脸及发束使用已应用到导出几何的一级 Catmull-Clark 细分，脸部切口保持边界以免收缩。鼻唇颏使用连续局部形变，单独控制鼻尖、鼻梁、唇缝和下巴；SIMPLE 细分仅增加控制点，曲面平滑来自前面的 Catmull-Clark。形变后逐项核对UV和保护区域坐标；睫毛根部按实际眼睑位置贴合，尖端向前弯曲并渐细。腿部采用局部法线引导曲面细分，保留已修复的膝盖权重和刚性靴子；不是仅使用平滑法线。

头部和发型跟随现有 head 骨。当前没有眨眼、张嘴、表情形变或头发物理。虹膜和眼线仍保留源贴图，新增睫毛为真实网格；脸壳与闭合头皮支撑重叠衔接，不是焊接完成的表情动画拓扑。此版本用于验证造型，尚未制作低面数 LOD。材质使用可导出的普通 PBR，没有依赖 Blender 专属头发着色节点。

## 重建顺序

依次运行 `scripts/character_customization/d1_head_from_source.py`、`d1_hair_from_source.py`，需要重建腿部和动作时运行 `animate_d1_rodin.py`，最后运行 `assemble_d1_modular.py`。脚本通过 Blender 后台执行；装配脚本保留原动作及原始身体贴图。
