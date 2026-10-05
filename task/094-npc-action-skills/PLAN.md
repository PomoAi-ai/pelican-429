# PLAN -- Sam 与 Tibo 跑跳和特色技能

## Status: done
## Task: 094
## Related: 066, 086
## Baseline Commit: 无 HEAD；本次修改文件保存快照以核对范围

## Goal
补齐两位角色的跑步、跳跃、两个小技能和一个大招，拥有鲜明的动作轮廓、绚丽的共享特效和可读文字助威。Sam 大招为 AGI 降临，Tibo 为重置降临。

## Non-goals
不扩展 NPC 战斗数值、AI 或关卡刷怪；本轮制作游戏可调用的共享角色动作与技能表现。不更换已验收形象、不重新生成或重绑蒙皮。不提交推送。

## Acceptance Criteria
- 每位八动作：idle/walk/run/jump/greet/skill1/skill2/ultimate；旧 special 直接由明确技能替代。
- 跑步有独立步态和腾空期；跳跃有预蹲、腾空、缓冲；裤裆、尾根、肩部不出现明显撕裂。
- 每位两个小技能和六秒大招，有蓄势、爆发、余波、收招；Tibo 文字弹幕可读。
- 动作与 FX 使用同一绝对时间；暂停、重播、结束、切换清理正确；双预览互不串光。
- 正式 GLB 与展示场复用；静态网格、UV、贴图、已有蒙皮及旧基础动作保持。
- 实际浏览器视觉验收，typecheck/test/build 验证；不新增渲染细节自动测试。
- 绘制两位角色共六技能效果图，对照实际游戏截图调整主要形状、色彩、层次和文字避让。

## Constraints
仅 three 运行时依赖。遵循项目分层与 Ponytail Full。新任务与现有共享工作区其他修改隔离。原帖不可读取的资料标注证据限制，未核实薯片梗仅作原创游戏对白。

## Decisions
- 三个探索子代理分别完成社交资料、动作管线、共享运行时架构；无需要用户裁决的设计分歧，直接进入实现。
- 技能：Sam Route Cascade / Compute Surge / AGI Advent；Tibo Snack Taunt / Quota Encore / Reset Descends。
- 动作时长（秒）：idle4、walk1.2、run0.8、jump1.6、greet3、skill1 2.4、skill2 3、ultimate6；主要释放时刻0.9/1.3/2.8秒。
- 从修复后的 rigged.blend 重烘动作，复用现有导出函数；不运行重建形体的 build.main。
- FX 独立共享模块由 rig 拥有，绝对时间采样；复用现有软粒子工具。展示场只做取景和本场景灯光/镜头响应，不修改共用 renderer 曝光。
- 动作说明与最终画面一致：Sam 大招屈肘抬爪，Tibo 额度返场在胸前按下按钮，大招使用绿金刻度；中英文同步更新。
- 目前 NPC 尚无 sim/伤害实体；本轮“技能”是可复用的动作和视觉资源，不声称实现伤害判定。
- 基于正式正面渲染使用内置 imagegen 绘制两张三技能概念板，图与完整提示词存入各角色 skill-concepts。对照后增加路由光带、晶核、立体重置按钮、上升额度条和漫画对白框；浏览器二次纠正过曝与遮脸，保留模型及蒙皮。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_npcs/animation.py | 跑跳及六种角色技能动作 | - | yes |
| 2 | scripts/blender_npcs/rebake_actions.py | 对已修复模型重烘与导出 | 1 | yes |
| 3 | assets/characters 与 public/characters 的 sam/tibo | 八动作资产与逐帧变形证据 | 1,2 | yes |
| 4 | src/config/npc.ts | 八动作定义、节拍、构图与技能文案 | - | yes |
| 5 | src/render/npc/npc-effects.ts | 六种技能、粒子、文字、光效 | 4 | yes |
| 6 | src/render/npc/npc-rig.ts 与 npc-animator.ts | 动作/FX 生命周期与绝对采样 | 4,5 | yes |
| 7 | src/app/showcase/npc-session.ts、src/config/showcase.ts 与 src/ui/showcase-language.ts | 取景、冲击响应、动作分组与英文文案 | 4,6 | yes |
| 8 | 资产来源与验收记录 | 社交资料证据、SHA与静态等价链 | 3 | yes |
| 9 | assets/characters/{sam,tibo}/skill-concepts 与本任务 evidence | 效果图、提示词和实际画面对照 | 3,5 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| Blender 新动作逐帧蒙皮、接地/腾空、循环、静态等价 | yes | 每角色668帧；静态/绑定/旧基础动作字节不变 |
| 浏览器跑跳和六技能，慢放/暂停/重播/切换/双角色 | yes | 通过，截图见 evidence 与 VISUAL-REVIEW.md |
| npm run typecheck | yes | 通过；首轮其他模块并行改动报错已在复跑中消失 |
| npm test | yes | 最终1535/1535通过，305 suites，93.31秒 |
| npm run build | yes | 通过，6.08秒；仅既有大chunk/prepare-out-dir性能提示 |
| core-review 当前变更范围审查 | yes | InstancedMesh资源释放问题已修复，最终窄范围复查无新问题 |

没有新增自动测试；纯表现变更采用浏览器和离线资产证据。未提交、推送或修改 CI。
