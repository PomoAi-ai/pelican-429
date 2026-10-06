# PLAN — Sam / Tibo 人形 NPC 与 Boss 动作精修

## Status: blocked
## Task: 174
## Related: N/A
## Baseline Commit: 3a35077

## Goal
检查并精修Sam、Tibo两个人形NPC及对应的白鼬、鼹鼠Boss形态，让呼吸、眨眼、移动、转身、攻击与形态切换自然衔接。

## Non-goals
不重做已确认的角色身份、服装或比例，不调整伤害、AI、技能命中时间，不提交或推送。

## Acceptance Criteria
- 四个形态有自然的眼部与待机表现，移动/战斗时保持眨眼。
- 动作与朝向切换平滑，保留Boss出招节奏、特效方向及命中时序。
- 游戏与展示场共用实现，暂停、重播和换形不残留姿态。
- 对四个形态做实际浏览器近景和动态验收，保留证据。

## Constraints
- 保留同一工作区已有和并行修改，只修改本任务涉及文件。
- 按仓库规则，渲染动画使用浏览器验收，不新增网格/材质或源码断言测试。

## Decisions
- 采用dev/core-dev、Ponytail Full，两个子代理分别探索人形与Boss，主代理负责实际视觉检查。
- 已确认范围是Sam/Tibo两个角色的human与monster形态，无需另行确认角色名单。
- 探索发现：四形态眨眼只在固定4秒idle中生效；动作和180°转身硬切；人形固定眼睑边缘前推导致闭眼圈状凸起。
- 设计采用共享姿态缓存、0.24秒普通动作/0.14秒攻击衔接、独立随机眨眼、连续yaw；原技能采样seconds和释放时刻不变。无需要用户裁决的方案分歧，直接实施。
- 不通过3–4倍速播放掩盖Boss的短步幅；本次保留原脚步动作和战斗移动速度，避免改变难度或引入过快踏步。
- 人形眼睑用Blender候选精修，保持身体Basis、UV、权重、材质与8个动作；采用landmark-fit-repair检查固定边缘和眼角不移动。
- 跑步额外增加0.065弧度胸椎前倾，经既有动作混合自然进出；不旋转骨盆或根骨，不改变脚底位置。
- 浏览器发现正式角色场景按动作销毁NPC实例，会跳过共享姿态过渡。改为保留同角色实例，切动作重置片段时间但保留姿态；同动作手动重播才清过渡。新旧展示路径同步。
- 实现、浏览器和独立审查已完成；整体验证仍有无关HUD文案断言失败，按dev流程标记blocked。实际HUD文案现为“水中：按住空格 / W 上浮，水面再按跃出，S 下潜；氧气耗尽扣血”，测试仍断言旧文案“水中：空格跃出/上浮，S 下潜”。未修改src/ui/hud.ts或test/render-camera-hud.test.ts。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/npc/npc-pose.ts | 共用动作过渡、转身、眼睛和轻微呼吸 | — | yes |
| 2 | src/render/npc/npc-rig.ts | 眼睑资源边界、共享姿态实例、人形眼睑阴影 | 1 | yes |
| 3 | src/render/npc/npc-animator.ts | 保留绝对采样并接姿态更新 | 1,2 | yes |
| 4 | src/render/npc/boss-view.ts | 实战dt及FX方向 | 3 | yes |
| 5 | src/render/npc/wanderer-view.ts | 人形NPC共享衔接 | 3 | yes |
| 6 | src/render/npc/npc-transformation.ts | 两形态共享调用、重播清状态 | 3 | yes |
| 7 | src/app/showcase/npc-session.ts | 预览暂停/重播 | 6 | yes |
| 8 | src/app/showcase/stage-actor.ts | 正式展示场调用 | 6 | yes |
| 9 | scripts/blender_npcs/human_eyes.py、refine_human_eyes.py | 人形眼睑固定边缘及弧面精修 | — | yes |
| 10 | public/characters/{sam,tibo}/human、对应Blender源与证据 | 导出与开半闭/斜侧检查 | 9 | yes |
| 11 | src/app/character-stage-app.ts | 切动作保留NPC实例与同步取景 | 7,8 | yes |
| 12 | public/characters/{sam,tibo}/{human/,}SOURCE.md | 记录共享表现及资产精修 | 1–11 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，最终exit 0 |
| npm test | yes | no，最终1703项中1702通过；1项无关HUD文案断言失败 |
| npm run build -- --outDir /private/tmp/npc-refinement-dist | yes | yes，exit 0；保留既有chunk体积警告 |
| 四形态浏览器动态/近景检查 | yes | yes，正式5174页面及共享渲染器验收，无浏览器error |
| core-review / diff-guard | yes | yes，姿态层、调用方及后续舞台实例修复均Approved |
| Blender资产指纹及眼角/外缘校验 | yes | yes，原身体属性、材质贴图、绑定矩阵、8动作采样逐字节保留 |

## Validation Evidence
- 首轮全量1700项，1699通过，仅worldgen耗时中位数500.2ms失败；单独`node --test test/worldgen.test.ts`复跑29/29通过。
- 最终全量1703项，1702通过；`node --test test/render-camera-hud.test.ts`单独复核2/3通过，确认剩余失败为上述未涉及的HUD文案。
- `/private/tmp/npc-refinement-delivery-typecheck.log`、`npc-refinement-delivery-build.log`、`npc-refinement-final-tests.log`、`npc-refinement-hud-recheck.log`。
- `assets/characters/{sam,tibo}/human/evidence/refinement/`：开/半闭/全闭/斜侧近景、前后对照、Blender与GLB保全报告。
- `assets/characters/sam/human/evidence/refinement/browser/four-forms-motion.mp4`：四形态待机、走跑、转身、跳跃、招呼、三技能与收招的33秒录像。
- 正式展示场验证同一Sam/Tibo连续切动作、朝向、变身后仍只有4个原始mixer（每角色两个形态），没有销毁重建；暂停同一姿态重复采样100次最大变化为0。
- 本任务未提交、未推送；没有添加渲染细节自动测试。
