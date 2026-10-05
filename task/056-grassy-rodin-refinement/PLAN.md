# PLAN -- Grassy Rodin 局部精修

## Status: done
## Task: 056
## Related: 054
## Baseline Commit: 无 HEAD；现有文件均未跟踪，保留旧资源

## Goal
在 Rodin 原始模型上继续修正侧脸曲线、眼睛、后脑发束、手与材质，导出精细及游戏简化档并接入角色展示场。

## Non-goals
不重做其他模型，不生成动作，不重新购买云端生成，不提交推送。

## Acceptance Criteria
- 保留 Rodin 的身份、UV 和主体造型，只做有视觉依据的局部修改。
- 总高 3.1 格，脚底为 0；有完整三维体积。
- 原版保留，新版有 Blender 源文件、无损贴图 GLB、五向渲染与前后对比。
- 查看正、侧、背、45 度；轮廓指标不作为艺术相似度结论。
- 共享展示场资源接入和现有检查通过。

## Constraints
- 侧面母版优先；四向原画的手势和逐簇发型存在冲突，保留自然统一造型。
- 仅通过可复现脚本调整；不改 shared Opus studio，不改共享加载器。
- 渲染外观不写代码测试；代码检查仅用于接入。

## Decisions
- 两项只读子任务已完成探索与设计：保留当前比例，从 raw-01/base_basic_pbr.glb 原始50万面制作新独立 refined 组。
- 原版导出把所有贴图压为 JPEG 88；本轮保留无损PNG，按材质区域处理，不用灯光掩盖脏斑或几何问题。
- 三档共用同一精修高模与材质，精细保留原始面数，游戏45k、轻量20k。
- 所有操作本地可回退，无需再次确认；既有参考与授权足够确定设计。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_grassy_rodin/refine.py 与 model-rodin-refined/models-rodin-refined | 几何精修、三档导出与渲染 | - | yes |
| 2 | scripts/blender_grassy_rodin/refine_materials.py | 保留Rodin UV的材质校准 | - | yes |
| 3 | src/config/grassy.ts、src/config/showcase.ts | 精修资源与原版对比入口 | 1,2 | yes |
| 4 | 精修 evidence、SOURCE.md | 前后视觉证据与来源说明 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 多方向与局部实图、MCP 实际打开 | yes | yes，三档15张正式渲染、最终头部3图、实际MCP对比视窗 |
| 原画轮廓/局部锚点对比与UV检查 | yes | yes，背面原画宽度差仍保留为未通过项 |
| 浏览器旋转与同方向前后对比 | yes | yes，整页刷新后3档加载正常、正背侧/45度及方向键旋转正常，控制台无error |
| npm run typecheck | yes | yes，exit 0 |
| npm test | yes | yes，1499通过、0失败、0跳过，303 suites |
| npm run build | yes | yes，exit 0，最终三档GLB与15张渲染均已复制 |

## Visual findings
- 最终精细版正面、右侧、背面头图和五向全身图已逐图检查。侧面虹膜可见面积增加；鼻唇、面颊及下巴过渡调整；后脑卷束末端改为更下垂的尖端，手指稍展开。
- 材质使用第二候选，肤色饱和度系数 0.90、毛衣颜色混合 0.30、牛仔颜色混合 0.22。实际导出并重新导入 GLB 后，三张 PNG 材质仍正确连接。
- UV 哈希保持一致，局部变形 Jacobian 最小行列式约 0.187，没有在采样顶点检测到翻转。锚点是操作中心最近源顶点，不声称自动语义关键点匹配。
- 四向统一配准后，精修版正面 IoU 0.9328、右侧 0.9356、左侧 0.9341、背面 0.9011，均较旧版略低。背面宽度差约 5.1%，手势和发束参考冲突仍未完全解决。这些数值只用于记录轮廓，不是还原度评分。
- 独立复核发现原先手填的左右参考横向中心不准确，已改为与模型相同的完整包围盒中心并重跑全部叠图。
- 在两个减面档发现三角黑缝，独立只读子代理解析二进制与几何代理实图实验共同确认根因为UV拆点未经焊接就直接减面。仅在LOD副本先按1e-6焊接重合几何顶点，保留逐面UV后再减面；边界边228326→0，45k与20k减面后仍为0，焊前后UV哈希一致。所有两档正式渲染已重出并实图复核，裂纹消失。

## Delivery
- 展示入口：`http://127.0.0.1:5174/?mode=showcase&demo=grassy-rodin`，原版加三档精修共4卡，旧资源保留。浏览器已刷新并实际加载最后导出的简化模型，页面保留为交付标签。
- 最终三档GLB字节数：29,728,476 / 4,379,564 / 1,445,256；分别500k / 45k / 20k三角，3张2048 / 1024 / 512 PNG，全高约3.1、脚底0、无动画。
- 源文件：`assets/characters/grassy/model-rodin-refined/grassy-rodin-refined-master.blend`、三档正式`.blend`与`grassy-rodin-before-after.blend`。最终对比工程实际在Blender中打开。
- 交付截图：`evidence/showcase-before-after.jpg`是实际网页；`evidence/mcp-before-after.png`、`mcp-side-before-after.png`是实际Blender视窗。两类截图明确区分。
- 几何、材质及接入由三个当前会话子代理分别完成并交叉复核；根代理检查最终实图、MCP、四向配准及浏览器。
- 没有新增外观代码测试；既有检查仅验证代码接入。没有运行CI、提交或推送。构建保留现有大chunk提示，不扩大任务范围。
