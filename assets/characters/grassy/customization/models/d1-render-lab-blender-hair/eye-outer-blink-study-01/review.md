# 独立眼周修复阶段

本轮修复已由主线程实际看过 Verified 正面、45°、侧面开闭眼后接受为局部阶段。整体脸部与头发美术仍未通过；不能据此宣称角色制作完成。

## 当前可用离线候选

- Blender：`draft-02-corrected/Eye-Surface-Verified.blend`。
- Blender SHA256：`8acda82cff95f6618a6e681a9e0df8f9458858c45b5eb61cd9d3ed9e43358d2f`。
- 实际开闭眼三视：`draft-02-corrected/verified-color-open-*`、`verified-color-closed-*`；灰图为 `verified-clay-*`。
- 导出：`export/d1-outfit-blender-eye-surface-v1.glb`，SHA256 `32e1a8de3965b65db2cc3e787fa2ba6879b9433320789e2391c2a3f65ca026d7`，38,531,280 字节。
- 导出重新读取原色端点图使用 `export/exported-color-*`；这些仅检查离线模型与材质，不能替代浏览器中的实时 shader/动作验收。

## 根因与实际修复

旧粉色三瓣及睁眼凸圈属于 Head 原肤色皮面的旧实体睫毛/眼圈，不是三个重复眼片或仅 outline 问题。Head 原 skin 是一张连续皮面，唯一开放边位于颈底；V8 关闭描边后旧外眼角仍存在。100%闭眼 shader 已切到正确闭眼象限，旧皮面却静止，所以出现多重粉色弧。

切除双眼旧折返皮面的 6,195 个三角，重建 5,707 个连续三角。原鼻嘴眉、保留皮面顶点、其它 53 mesh 全冻。眼贴片继续使用原 UV 与拓扑，改用原 UV 到 theta/z 的单值拟合，再沿实际新皮面径向留 .0025 间距，避免延用旧法线 offset 造成折返。

新局部连续 UV 与新肤色图去掉旧 UV 岛跨岛拉线。原真实皮面颜色先逐像素采样，随后只在实际切口内按健康周边调和重建肤色；切口边界权重为 0，.010 距离内平滑接回原色。新补面 roughness=.68、metallic=0、平法线，消除旧眼区域 MR 白亮反射条。实际切口范围外颜色像素改变 0。原 16 张图均在最终源中保留。

## 静态几何与冻结证据

独立有限三角检查：skin 自交 9→0，eye 自交 146→0，eye-skin 交叉 501→0；无退化三角。眼片 14,618 顶点／42,690 边中／28,104 面心到皮面最小间距分别 +.002214076／+.002207561／+.002210689。皮面焊接后单连通，眼周开边和非流形边为 0；原 160 条颈底开放边保留。

保存重读确认其它 53 mesh、旧 14 图、骨架与 idle/walk/run/jump 四动作不变；修正版的材质收尾又确认全部 54 mesh 与原 16 图不变。所有顶点仍为 head 骨骼权重 1。保留 polygon/UV 和 eye 完整 UV/拓扑一致。保护角法线最大量化差 .000683647，未宣称其逐字节冻结。

## 独立导出契约

`export_eye_surface.py` 是新独立脚本，没有修改 `publish_hair.py` 的 hair-only 语义。

为适配现有 runtime 对 `model` 精确材质名与整体 bbox 的处理，导出将原保留皮面和新补面合并成一个 model primitive。另一个 primitive 仍用原 D1 eye 材质/atlas，UV不变。三张专用扩展图集均 2080×1040，gutter=8：旧 skin 区域原像素逐值保留（保存 PNG 差0）；右侧放 clean 色、MR(.68,0)与平法线。UV仅按 export-report.json 记录的两组仿射搬移。BaseColor 为sRGB；MR/normal为Non-Color。

冻结源 `d1-outfit-blender-temple-root-v1.glb` 的全部 34,073,008 binary 字节原样保留。所有 nodes、skin、4 actions、非Head mesh、Hair 72 guides，以及旧 material/image/texture/sampler/accessor/view 条目均保留，仅追加新Head数据和图集材质。头部绑定仍为源 head joint index17，IBM对照通过。原29个public GLB hash不变，未写public/app/HTML。

## 保留且明确否决的状态

1. `draft-01`：旧拓扑压薄后仍有残圈裂线，并新增交叉，否决。原名 closed 的三图实际未改 OBJECT 材质，仍睁眼，已更名 `invalid-closed-still-open-*`。
2. `draft-02`：连续皮面有效，但每角独立转旧UV跨岛（591/5707面）产生锯齿，眼片仍143对交叉，否决。
3. `draft-02-corrected/Eye-Local-Retopology.blend`：几何通过，但原色/MR仍有旧眼痕，属于材质诊断阶段。
4. `Eye-Surface-Final.blend` 与 `final-*`：Image.copy继承旧packed，保存重读仍旧肤色；原local color无user而掉失。此状态不验收。磁盘clean PNG正确，Verified从新PNG重新load/pack、保留旧图fake user，保存后actual packed SHA与PNG完全一致。
5. `export-preflight-UV-float32`：原生导出位置差0、eyeUV差0；skin UV期望未模拟Blender float32存储，最大5.96e-8舍入差，检查失败但未生成最终GLB。修复期望读取实际meshUV后精确多重集对照通过。

## 实际执行与待验边界

执行了 Blender 后台建模、材质消融、实际保存重读、九图/导出图渲染与独立审计。主要成功脚本：`build_retopology_corrected.py`、`finish_local_skin.py`（其packed缺陷由后续独立脚本修正）、`pack_final_skin.py`、`render_verified_skin.py`、`export_eye_surface.py`、`render_exported.py`。均以 `--background --python-exit-code 1 --python` 运行；检查日志位于 `/tmp/d1-eye-*.log`。各独立审计JSON位于对应draft/export目录。

本子任务未改应用代码，未运行npm检查、未操作浏览器、未发布、未提交推送。实时中间闭眼状态、四动作回放与渲染变体仍由主线程集成后验收；静态零交叉不替代实时验收。

导出实际重导入检查补充：六张 `exported-color-*` 原色开闭眼三视均已实际查看，旧三瓣/静态睁眼粉弧/白反射条消失，未见图集接缝或眼周凹坑。证据 `export/visual-review.json`；实时中间态及动作仍待主线程。

最终实际GLB读回：三张新增PNG的内嵌buffer字节各自与磁盘图集完全一致，只有一个model primitive；详见 `export/texture-readback-audit.json`。主线程独立结构审计 `export/root-glb-audit.json` 已通过，公开集成由主线程负责，本子任务未复制public或改app。
