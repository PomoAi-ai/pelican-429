# PLAN -- Grassy 正式装备角色与历史资料库

## Status: done
## Task: 081
## Related: 074, 056
## Baseline Commit: 无 HEAD，保留既有未跟踪内容

## Goal
整理角色资料，纳入三张已确认装备概念；正式角色仅展示当前装备版，其他模型与资料移动到可访问历史库；以既有Rodin身体添加键盘/飞行装备和跑跳、攻击、飞行等动作。

## Non-goals
不重做已确认身体，不改鹈鹕与其他角色，不提交推送，不把展示技能特效宣称为已接入游戏伤害逻辑。

## Acceptance Criteria
- 三张用户概念图保存到项目并出现在正式角色资料。
- 页面具备独立历史资料入口，旧模型、旧图与工程实际归档，图片/模型引用可访问。
- 正式角色保留3.1格身体、红毛衣牛仔裤米白鞋，装备为中等体量、蓝白科幻风。
- 键盘非攻击背负，攻击取到身前并收回；装备与角色绑定为真实可编辑三维模型。
- idle/walk/run/jump/codex_attack/bug_attack/server_overload/takeoff/hover/fly_forward/land均可查看，单次与循环动作语义正确。
- 三档精细度复用共享模型/播放/特效，展示场只选择摆放取景控制。
- 实际检查正侧背造型、关键帧、播放控制与历史页面；完成类型检查、全量测试、构建。

## Constraints
- 用户明确授权使用现有生成额度与可用资源，不购买额外额度或订阅。
- 当前工作只在本机及用户授权的生成服务进行；可回退资料迁移直接执行。
- 模型外观通过真实渲染检查，不写外观自动测试。

## Decisions
- 三个子代理完成目录/迁移、骨骼动画、shared runtime探索并返回架构，范围清楚无待裁决分歧，直接实施。
- 沿用Rodin精修身体，正式输出 public/characters/human/models-equipped/grassy-equipped-{detailed,game,light}.glb 与 assets/characters/grassy/model-equipped/ 下Blender工程。
- 历史入口复用showcase模式+library=history和共享静态加载器；保留注册，正式目录过滤历史，动作与精细度分开。
- 历史 public 资源移动到 human/history/；源工程移动到 grassy/history/。当前动画生成先适配历史源路径，搬迁由目录代理统一完成。
- 11动作合同：idle3.2/walk1.2/run0.8/hover2.4/fly_forward1.2为循环；jump1.6/codex_attack1.6/bug_attack2/server_overload3.2/takeoff1.2/land1.2为单次。
- 键盘采用Blender对象动画并与人体NLA合并为同名clips，装备直接包含在最终GLB。发射挂点为fx_keyboard、fx_wrist_L/R、fx_pack_L/R。
- 根代理负责装备资产与模型，目录代理负责UI/归档，动画代理负责Blender clips/最终导出，runtime代理负责共享动作元数据和特效。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | equipment-concepts/ 与 model-equipped/ | 三图归入资料与装备模型 | - | yes |
| 2 | scripts/blender_grassy_rodin/equipment.py | 装备建模与骨骼挂点 | 1 | yes |
| 3 | Blender扩展动画脚本及最终模型 | 11动作、装备装配、三档输出 | 2接口 | yes |
| 4 | config/grassy 与 render/grassy、human-session | shared动作播放和特效 | 3接口 | yes |
| 5 | 角色catalog与UI、资源归档 | 最终角色简洁入口、历史库与资源移动 | 4接口 | yes |
| 6 | SOURCE/证据/来源索引 | 记录实际资源和视觉验证 | 1-5 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender装配/动作关键帧/三档GLB检查 | yes | yes |
| 真实网页动作、精细度、历史库视觉检查 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

## Final Verification
- 正式图库13张，历史图库128张；57项资源实际迁移全部核对通过。
- 身体原始顶点与UV未变，修复原手部蒙皮拉扯；22骨骼、11clips、键盘同名对象轨道。
- 当前全量测试1532通过、0失败；typecheck通过。
- 真网页发现纯加色喷流在亮背景不可见，已改透明青蓝体积层；真实喷嘴已向腕外与后下方调整并重导出。
- 目录、动画、运行时三个子代理完成各自核对，运行时未发现阻断问题。

- 最终三档：587712/85578/46097三角面，39850256/6215472/2641744字节；22骨骼、11动作、5真实挂点。
- 浏览器实际核对三档、呼吸/跑跳/键盘收放/三技能/起降悬停；四喷流及三技能亮暗背景均可读，控制台无错误。
- 最终typecheck通过；全量测试1532通过/0失败；最终build通过（3.55秒，入口chunk体积提示保留）。材质最后修正后复跑typecheck与build；未重复不受视觉材质影响的全量逻辑测试。
- 所有三张用户图SHA-256与资料库副本完全一致。最终证据：browser-flight.jpg、browser-history.jpg、web-codex-attack.png、runtime-asset-check.json。
- 本轮装备和动作均通过Blender真实建模/烘焙完成，未消费新的云生成额度。无提交、推送或生产变更。
- 范围边界：交付可复用角色资产和展示动作/特效，现有游戏没有人形战斗状态，未宣称伤害与玩法已接入。
