# PLAN -- Grassy 不同制作方法的静态模型对比

## Status: done
## Task: 054
## Related: N/A
## Baseline Commit: 无 HEAD；仓库现有文件均未跟踪，修改保留旧资源

## Goal
尝试原画形体校准、多视图纹理，以及可用的专用图像转三维服务，制作不同方法的真实静态模型并录入角色展示场。

## Non-goals
不制作动作，不覆盖旧版，不购买订阅，不提交或推送。

## Acceptance Criteria
- 新模型有完整三维体积，能旋转查看；总高 3.1 格。
- 交付 Blender 源文件、GLB、正侧背与斜侧真实渲染。
- 按实际方法命名，真实说明云端服务可用情况，不将程序模型称为云生成。
- 展示场直接使用共享模型配置、加载器与真实资产。
- 实际查看正侧和45度预览并修正发现的问题。

## Constraints
- 用户已确认人物为短黑发、红毛衣、蓝牛仔裤、米白鞋；侧面主图优先。
- 原画目录 public/characters/human/turnaround-master-v2。
- 仅渲染/UI改动不新增自动化外观测试；代码检查只用于接入正确性。

## Decisions
- 上轮只读诊断已完成四套建模流程与原画分析，本轮沿用结果，不重复全量探索。
- A 版在可编辑基础上按参考修正关键轮廓和局部体积；B 版比较多视图投射的原画质感。
- 云服务通过实际工具/网页检查账户与能力；无可用入口时明确记录，不冒称已生成。
- 两个模型目录隔离；展示场独立接入，旧版本不变。
- 无需再次确认可回退的本地制作；超出既有授权的购买不执行。
- 按用户追加要求安装 mcp-for-blender 2.1.3 和 Blender 5.2 插件，注册 Codex 的 blender MCP（localhost:9876，遥测关闭）。已通过 MCP 实际打开模型、创建并保存双模型对比工程、读取场景和获取视口截图。
- 安装并实际阅读使用 multiview-fit-loop、landmark-fit-repair、orthographic-registration、reference-look-calibration 四个技能。指标仅验证比例和配准，不能替代外观验收。
- Meshy 和 Tripo 的实际页面均需账户登录；本轮没有云端生成、上传或付费，交付两条本地制作路线。
- 原画校准版仍有发束偏规则、衣服细节偏简单的限制；多视图版具有完整厚度，但细五官和发丝主要来自贴图，保留参考光照，未视作逐部位精雕。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/grassy_reference_fit/ 与相应 assets/public 目录 | 原画形体校准版本 | - | yes |
| 2 | scripts/grassy_multiview/ 与相应 assets/public 目录 | 多视图贴图版本 | - | yes |
| 3 | src/config/grassy.ts 与 src/config/showcase.ts | 共享资源接入与 grassy-methods 三卡入口 | 1,2 | yes |
| 4 | Meshy / Tripo 实际入口 | 已尝试，账户未登录，未生成云模型 | - | yes |
| 5 | model-method-comparison/ 与 public/characters/human/SOURCE.md | MCP 对比工程、真实截图与来源说明 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 实际预览与导出检查 | yes | yes，两版五视图、GLB 尺寸、MCP 场景与截图 |
| 浏览器旋转与参考对照 | yes | yes，A键盘旋转，B右侧/背面/三分之四，四向参考可见 |
| npm run typecheck | yes | yes，退出码 0 |
| npm test | yes | yes，1499 / 1499，303 suites，无失败或跳过 |
| npm run build | yes | yes，退出码 0，既有大 chunk 提示 |

检查通过后发现当前树另有共享模型按需加载改动导致短暂 HMR 导入失败；未修改该实现，页面恢复后重新执行完整三项检查并通过。最终日志位于 $TMPDIR/grassy-methods-final-{typecheck,test,build}.log。未新增外观自动化测试，未提交或推送。
