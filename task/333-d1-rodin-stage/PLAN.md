# PLAN -- D1 Rodin 模型质量检查与展示场接入

## Status: done
## Task: 333
## Related: N/A
## Baseline Commit: 975f136

## Goal
检查用户下载的 6e73423c 模型质量，连接原始 PBR 材质并接入现有角色展示场。

## Non-goals
不重新生成、不改变脸型或比例、不自动绑定动画、不替换游戏默认主角。

## Acceptance Criteria
- 原始 OBJ 和贴图保留，输出可加载 GLB 与检查报告。
- 现有共享展示场可以查看新模型，标注静态状态。
- 检查几何完整性、UV、材质与正侧背面效果，说明局限。
- typecheck、测试和 build 各执行一次；浏览器验收。

## Constraints
保留现有未提交修改；不提交推送、不修改 vendor。

## Decisions
- 使用现有角色目录和共享模型加载器，避免独立查看器。
- 子代理负责展示场探索、设计和接入；父代理负责模型转换和质量检查。
- 展示场改动为资源配置与视觉接入，不新增复述实现的测试。
- 两个静态资源已接入 `?mode=showcase&demo=d1-rodin`；材质版与白模共用现有场景、缓存、镜头和视角控制。
- OBJ 原始 19576 面含 8 个重复面，Blender 导入后 19568 面；主连通网格无开放边，另外保留 8 个微小孤立面片供后续精修。原始文件不变。
- 贴图仍有烘焙明暗，面部几何较浅；本次不通过改脸或过曝掩盖差异，不宣称动画就绪。
- 子代理接入和审查通过；GLB 尺寸、UV、法线和材质引用自检通过。

## Validation
| Command | Required | Done |
|---|---|---|
| 模型转换自检及渲染目检 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1816 passed / 0 failed |
| npm run build | yes | yes — chunk-size warning |
| 浏览器展示场检查 | yes | yes — 两模型显示、正面切换、缩放正常，控制台无错误 |
