# PLAN -- Grassy 左右横挥与实体技能强化

## Status: done
## Task: 095
## Related: 089, 090
## Baseline Commit: 无 HEAD；当前相关源码与资产保存到 $TMPDIR/grassy-combat-v2-baseline

## Goal
先分别绘制四种攻击效果图，再按图修正左右横挥、强化 Codex 光弹、机械 Bug 虫群和服务器超载，录入角色资料库与共享预览。

## Non-goals
不改人物造型与既有非普通攻击骨骼片段，不新增人形可操控战斗或伤害判定，不提交/推送。

## Acceptance Criteria
- 四幅独立概念图保留既定角色和装备，展示实体与粒子层次。
- 普通攻击为左右连续横挥打人，双手抓键盘、躯干配合，三档模型一致。
- Codex 与 Bug 具有可辨实体和长距离轨迹，收回键盘不牵动已发射物体；超载有大型实体机柜、多层冲击与碎片。
- 展示场复用共享资源，支持暂停、慢放、旋转，并完整容纳攻击范围。

## Constraints
dev / core-dev / Ponytail Full；渲染视觉用真实浏览器与 Blender 图检查，不新增自动视觉测试，不修改 vendor。

## Decisions
- 已先用 built-in image_gen 生成四图，保存 public/characters/human/equipment-concepts/combat-v2/；完整提示词在 assets/characters/grassy/combat-concepts-v2/prompts.json。
- 子代理只读探索发现旧 Codex/Bug 位移只有1.65格，且跟随键盘收回而提前淡出；改为模型坐标系独立飞行，并增强实体几何。
- 探索与方案结合完成，无额外待裁决问题；四图已呈现，随后按用户指定顺序开始可回退的实现。
- keyboard_smash 60帧/2秒，两次命中22/60、42/60；保留ID。远程片段原时长保持，发射后视觉位移Codex9格、Bug7.2格。超载冲击半径约6格。
- 单卡战斗预览使用16:9画幅；共享动作边界用于自动取景。四图归入“战斗效果概念”，明确标注概念图与实时渲染的区别。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| scripts/blender_grassy_rodin/extend_actions.py 与三档资产 | 左右横挥动作与几何保持检查 | yes |
| src/render/grassy/grassy-projectiles.ts | Codex实体光弹、实体机械虫群 | yes |
| src/render/grassy/grassy-overload.ts | 实体机柜、能量柱、冲击环及碎片 | yes |
| src/render/grassy/grassy-effects.ts | 整合共享特效与两次横挥冲击 | yes |
| src/config/grassy.ts、showcase.ts、src/app/showcase/human-session.ts | 动作说明、完整取景 | yes |
| 角色图片配置、资料库UI、SOURCE.md | 新概念图分类与资料更新 | yes |

## Validation
| Check | Required | Done |
|---|---|---|
| 真实GLB原动作/身体保持、两次横挥实际渲染 | yes | yes |
| 浏览器逐技能与取景、暂停/慢放 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

## Results
- 四张概念图先生成并展示，再实现动画与特效；未新增依赖和自动视觉测试。
- 三档GLB的其余12个动画、身体几何/蒙皮/贴图保持一致；两次横挥22帧、42帧已用真实Blender渲染检查。证据在 assets/characters/grassy/model-equipped/evidence/keyboard-combo/。
- 标准档四种攻击均在真实浏览器中查看，检查左右横挥、远端光弹与虫群、服务器爆发、暂停、慢放、转向和概念图目录；截图在 assets/characters/grassy/model-equipped/evidence/combat-upgrade/。
- 超载首次预览后打散粒子分布、提高金属碎片与爆发亮度，最终浏览器复查通过。
- 子代理独立复核未发现实质问题：共享特效资源释放完整，动画进度确定，动态范围位于取景边界内。
- npm run typecheck 通过；npm test 1535通过、0失败；npm run build 通过，仅保留现有大于500KB分块提示。最后粒子与布局调整后重跑typecheck/build通过。
- 本次交付为角色动画、共享视觉特效和展示场；不包含新增人形战斗伤害判定。
