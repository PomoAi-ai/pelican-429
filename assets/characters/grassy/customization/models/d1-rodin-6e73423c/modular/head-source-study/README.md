# 原 Rodin 头部曲面研究（未接入主产物）

结论：推荐以原头+原UV为底稿，胜过继续修程序头。原眼睛、眼睑、耳朵与脸颊之间的关系已经存在；本次全部保留。原头抽出约985顶点，一级Catmull-Clark后3719顶点/3496面。没有重画眼睛或替换贴图。

## 推荐候选
`head-source-pinned-cc1.blend`，对象 `D1_Head_Source` 和 `D1_Hair_Source` 分离。源完整模型仍在文件中但隐藏，仅用于上下文/回溯。
`cc1-pinned-front/right/three-quarter.png` 是推荐方案。对比 `base-*`，下巴与鼻唇轮廓更圆，眼睛形状身份保留。

## 实测淘汰方案
- `cc1-*`：普通一级Catmull-Clark，切口边界收缩会在刘海附近露缝。
- `curved-*` / `curved-sculpt-*`：基于原法线的曲面插值，以及局部0.005以内鼻唇增厚。实际渲染放大了原嘴角凹陷，形成酒窝/噘嘴，不建议使用。推荐文件没有这些局部增厚。

## 换发型的真实限制
原头并非封闭头骨。剥离头发后只剩脸/耳/部分颈部壳体，缺后脑和头顶；`cc1-pinned-bare.png` 展示原拓扑缺口。推荐候选仍有448条边界边（含细分后的开口），必须补不穿出原脸的头皮支撑壳，保留原脸UV，然后单独换发片。直接拆发型会露空。

当前裁剪还带有少量项链/领口碎片，集成前应按连通区域剔除；不是最终可直接上线的头资产。

## 可复用代码
`study.py` 包含 extract()、一级Catmull-Clark、边界edge crease=1固定切口、UV PRESERVE_BOUNDARIES与三视角渲染流程。只读取refined/d1-refined.blend，全部写入本研究目录，未修改动画GLB、源refined或主modular路径。

一级细分确实改善轮廓，但原贴图上锯齿睫毛/嘴线和缺少独立眼球仍然存在；需要后续局部人工贴图与头皮补面，不能宣称已经复刻参考。

## 正式采用
正式脚本 `scripts/character_customization/d1_head_from_source.py` 已输出上一级 head.blend/head-report.json 和 public d1-head.glb。程序头已备份至 procedural-study。最终正式方案保留源颈皮UV，与身体按同一选面函数分离；补闭合头皮及藏于原颈内的小盖，避免外露颈部接片。误分为头发的眉区转回原脸并压平贴额；保留源脸眼UV，增加贴合原上眼睑的6根渐细睫毛。当前正侧45图在上一级 head-front/right/three-quarter.png，图中源头发仅供上下文，没有写入head资产。
