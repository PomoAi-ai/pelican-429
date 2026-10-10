# PLAN -- D1 参考造型与材质精修

## Status: done
## Task: 334
## Related: 333
## Baseline Commit: 975f136

## Goal
对照用户确认的七视图修复 D1 肤色、头发色层与局部刘海造型，并在共享角色展示场核对。

## Non-goals
不重做角色、改变头身比、不绑定骨骼、不调整全游戏艺术灯光、不提交或推送。

## Acceptance Criteria
- 保留下载原件和原始预览，精修输出独立且可重复生成。
- 肤色恢复参考的暖白底色，头发保留金铜色层次；检查正、侧、背视图。
- 修复有依据的刘海特征偏差，保持 UV、拓扑和全高。
- 新旧模型在同一共享展示场可以对比，不另写渲染器。
- 类型、测试、构建通过，实际浏览器验收并报告仍存在的差异。

## Constraints
- 原始 Rodin 文件只读；不使用全局曝光掩盖材质与几何问题。
- 只修改本任务资产与共享入口，保留已有工作区改动。

## Decisions
- 已有下载、导入与偏色定位可复用；跳过重复下载与原始质量审查。
- 头发几何子代理负责局部形体，渲染子代理独立审查链路，主代理负责材质与集成。
- 采用 Blender 可重复材质/网格处理与烘焙，输出标准 GLB；保留 UV 和原始贴图。
- 没有需要用户裁决或不可回退的操作，直接实现。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| scripts/character_customization/refine_d1_rodin.py | 精修材质、烘焙、渲染和导出 | yes |
| scripts/character_customization/d1_hair_refinement.py | 局部刘海修复与度量 | yes |
| src/config/grassy.ts, src/config/showcase.ts | 原版/精修版共享展示入口 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| Blender 正侧背预览、UV与尺寸检查、前后颜色对比 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器同场景核对 | yes | yes |

## Results
- 导出独立 d1-rodin-refined.glb；下载原件和原始模型保留。
- 校准基础色，保留金属/粗糙度原图；皮肤法线强度 0.25，头发 0.65，衣鞋 1。
- 241 个头发顶点局部修复，最大位移 0.0670；无翻面，UV/拓扑/3.1 全高不变。
- typecheck、1830 项测试、build 通过；最终 GLB 与烘焙贴图字节核对通过。
- 查看正/侧/背渲染，浏览器同场景新旧对比无错误。
- 明确限制：中央刘海只能局部减弱，完整侧分未重建；源贴图部分高光仍在，未执行全身自相交或绑定形变验证。
- 审查确认全局暖色 grade 的显示空间与线性色值有偏差；本轮保留游戏既有灯光，不把反向补偿写入 D1。
