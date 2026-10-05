# PLAN -- Grassy 单手挥击与空中技能

## Status: done
## Task: 099
## Related: 095
## Baseline Commit: 无 HEAD；相关文件备份在 $TMPDIR/grassy-airborne-before

## Goal
按已经绘制的单手挥击与四张空中技能图，完成单手左右挥键盘、起飞/悬停/前飞施法，以及更清晰的 Codex/Bug 实体与粒子。录入角色资料，使用共享动画和特效在展示场验收。

## Non-goals
不改变人物原造型，不新增人形实体控制器/伤害规则，不提交或推送。

## Acceptance Criteria
- 普通攻击仅右手握键盘短端，远端左右横击；左手分离，三档模型一致。
- 四攻击可与起飞、悬停、前飞组合，键盘随握持位置，推进器在攻击时继续工作。
- Codex/Bug有清晰实体、较粗粒子与代码碎片、命中爆散和独立残留时间。
- 展示场可切换地面/起飞/悬停/前飞施法，保留精细度/慢放/旋转，图片清楚标记概念图。

## Constraints
应用 dev、core-dev、Ponytail Full。渲染与动画通过实际图片和浏览器验收，不新增自动视觉测试，不修改 vendor。

## Decisions
- 先图后实现已在前两轮完成。用户本轮继续即落实已绘概念。
- 子代理完成现有链路探索与设计；组合原13段动画，无需重复烘焙12组空中攻击。独立采样飞行下身与原攻击上身，通过胸骨差矩阵同步独立键盘和特效。
- 单手挥击仅替换 keyboard_smash，保留2秒与22/60、42/60撞击时点，保持其他12段动画和所有模型数据。
- 展示目录保存flight姿态，面板通过一个施法姿态选择器切换，避免堆积12个重复按钮。
- 粒子增强仅在攻击模块调整，不改变推进器、NPC共用材质或全局Bloom。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| Blender脚本与三档装备资产 | 单手挥击、导出与接触检查 | yes |
| grassy-rig / animator / flight-pose | 共享空中施法组合 | yes |
| grassy-projectiles | Codex/Bug形体、尾迹与爆散 | yes |
| grassy-effects | 单手轨迹同步、空中攻击容器与推进 | yes |
| grassy / showcase / human-session / panel | 施法姿态入口、时钟、取景 | yes |
| character-assets / language / SOURCE | 概念图录入、标签与资料 | yes |

## Validation
| Check | Required | Done |
|---|---|---|
| Blender单手握持、头部无碰入、其余动作/几何保持 | yes | yes |
| 浏览器四攻击、施法姿态、精细度、暂停/慢放/重播/取景 | yes | yes |
| 独立子代理审查 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

## 实现与验证结果
- 三档装备 GLB 已替换单手 `keyboard_smash`；其余 12 段动画、几何、UV、蒙皮和材质数据与备份一致。61 帧握持检查最大误差约 0.00000114，头部碰入 0，左手保持分离。实际 Blender 图位于 `assets/characters/grassy/model-equipped/evidence/keyboard-one-hand/`。
- 真实 GLB 的 132 个空中组合采样、重复采样、地面/飞行/骑行切换检查通过；键盘相对胸骨最大偏差 0.0000000625，变换与粒子数据均有限。
- 浏览器已实际查看：地面左右单手挥击、起飞挥击、起飞 Codex 光弹、悬停 Bug 虫群、轻量版前飞 Codex、精细版悬停超载及爆发。截图保存在 `assets/characters/grassy/model-equipped/evidence/airborne-combat/`。页面恢复后补充查看轻量版前飞单手挥击，握持与尾迹正确。
- 独立子代理审查通过；粒子后续只调整散布、大小与亮度，消除串珠和彩带形态。
- `npm run typecheck` 通过；`npm test` 1528 通过、0 失败；`npm run build` 通过。粒子最终微调后再次 typecheck/build 通过。构建仅有现存的大 chunk 警告。未新增自动视觉/网格/材质测试。

## 环境恢复
验收中曾被同目录的其他改动打断：旧维护机器人导入暂时失效，开发服务器随后停止。相关目录后来已更新，不再导入旧实体；重新启动 5174 开发服务器，并在新预览标签确认展示场恢复、补完前飞挥击检查。恢复后 `npm run typecheck` 与 `npm run build` 再次通过；四张空中技能图的分类与概念图标注也已在页面确认。未覆盖或撤销其他任务代码。
