# D1 细腿模型对比

## 状态

2026-10-08：用户确认使用 Rodin Gen-2.5 High，已通过 CLI 完成一次生成，任务 ID：`private-source-057`，最终状态 `completed`。正面、右侧面按顺序输入；Quad、目标 18,000 面、GLB。模型和三视图已保存至 `rodin-high/`。

## 输入

- 已确认的设计：`../../female/concepts/d1-standard/slim-legs-front-right-v1.png`。
- 两个服务共用 `references/front.png` 和 `references/right.png`，分别为正面与右侧面。独立图使用图像生成工具从已确认设计提取，非逐像素裁剪。
- 短金发、大眼睛、圆耳、紧凑头身、短细腿、蓝白裙；带原有腕部装备和背包。
- 模型结果首先保留原始几何、材质和比例，用同一镜头与灯光对照；未确定效果前不替换游戏现役模型。

## 入口核对

- Hyper3D CLI 已认证，提交前账户读数为普通额度 25、订阅额度 18、冻结 0。CLI 的远端 `rodin_generate` schema 仅支持 Medium、High、Extreme-Low，不能用这个入口提交 Extreme-High。
- Hyper3D 官方 API 文档与网页支持 Extreme-High；当前浏览器需要用户登录原账户。
- Tripo 官方文档的 P2.0 API 模型标识为 `P2-20260801`，支持前/右多视图。官方 `tripo-cli@0.5.1` 已通过 npm exec 准备；当前未登录。
- 不自动降档，不在结果未知时重复提交付费请求，不将账号密钥或签名下载地址存入仓库。

## 本次结果

- `rodin-high/base_basic_pbr.glb`：原始 PBR 模型，11,266,972 字节；另保留 Shaded GLB 和服务单独返回的发光贴图。
- `rodin-high/mesh-report.json`：实际 GLB 为 37,546 个三角面、23,054 个顶点、1 个网格/图元、1 个材质、3 个纹理条目。生成请求中的 Quad 不等于 GLB 保存了四边面源拓扑。
- 骨骼蒙皮、动画和 morph targets 均为 0；不能作为已经完成的捏人或动画资产。
- `rodin-high/inspection/`：正面、右侧、背面 PNG 和等比归一化至 3.1 高度的 Blender 检查文件。只统一尺寸和居中，未改身体比例。
- 视觉检查：大眼睛、短金发、蓝白裙和细腿轮廓基本保留；背包背板存在不规整块面，护腕边缘和金属表面需整理。装备尚未做可换装拆分。背面无输入参考，由服务推断。
- 原始几何未修改，未替换游戏现役角色；后续游戏化需要结构清理、部件拆分、绑定和动作检查。

## 面部验收未通过

用户指出肤色、鼻子、嘴巴与下巴偏离参考。重新渲染面部特写，并将原始 Base Color 直接连接至 emission 做无灯光对照，输出 `inspection/face-pbr-{front,right}.png` 和 `inspection/face-albedo-{front,right}.png`；仅用于诊断，未写回原始材质或模型。

- 原色对照仍偏粉，渲染灯光进一步加重下半脸灰感；不能仅靠曝光修正。
- 嘴线颜色深，原图嘴部柔和的色彩和体积过渡丢失。
- 侧面鼻尖、唇部之间的轮廓分化不足，下巴偏尖且向前；形状偏差在无光照对照中仍存在。
- 该模型仅作为生成底稿，脸部不接受为最终 D1。应先按正侧面校正鼻尖、唇部、下巴与脸颊，再校准肤色和嘴部贴图；尚未实施修形或重绘。

## 官方文档

- https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5
- https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/p
- https://developers.tripo3d.ai/en/docs/cli
