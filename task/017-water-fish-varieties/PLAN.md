# PLAN -- 水中新增六种鱼

## Status: done
## Task: 017
## Related: N/A
## Baseline Commit: N/A（仓库尚无 HEAD，现有项目文件均为未跟踪文件）

## Goal
- 保留现有水中小鱼，新增六种可从轮廓和配色辨识的鱼，让游戏水体中的鱼群更丰富。
- 角色展示场复用游戏的鱼模型、动画和品种选择规则。

## Non-goals
- 不增加捕获、战斗、奖励或鱼类生态系统。
- 不修改 vendor 模型，不提交或推送代码。

## Acceptance Criteria
- 游戏水体可以出现原有小鱼及新增六种鱼；同一 seed 的外观稳定。
- 六种新鱼具有不同体形、尾鳍或花纹，不只更换身体颜色。
- 保持游动、受惊、搁浅、回水状态可用，鱼模型始终处于水体渲染厚度内。
- 展示场可逐种查看，并直接复用游戏实现。
- 所需类型检查、测试及构建通过；视觉效果由浏览器人工验收。

## Constraints
- 遵守 AGENTS.md 和 docs/coding-guidelines.md、docs/testing-guidelines.md。
- 不新增防御性检查，不写网格/材质细节或源码字符串断言测试。
- 设计经用户批准后开始实现。

## Decisions
- 当前水中鱼只有一套低多边形模型，按 seed 分为橙、蓝、银三种配色。
- 湖鱼不进入通用战斗实体列表，但现有武器系统可以捕鱼并增加库存；保持现有捕鱼行为。吐出的鱼使用独立 cartoon-fish 模型，当前需求聚焦水中鱼。
- Git 无初始提交，后续审查以实际改动文件及实现前快照比较，不能使用 git diff HEAD。
- 推荐新增金鱼、锦鲤、神仙鱼、鲶鱼、鲈鱼、虹鳟，保留原有小鱼及其三种配色，共七种外形。
- 品种区别由共享模型和外观配置实现，沿用现有游动、惊散、搁浅逻辑及鱼群数量，不引入新玩法。
- 探索与架构设计使用当前会话的 subagent；现有信息足以形成建议，无须先询问额外偏好，统一在设计批准时确认。
- 推荐按品种建立最多七个实例批次，共享尾摆材质；动画平滑状态继续按鱼 ID 保存，避免捕获或移除后串鱼。
- 品种由现有 seed 加独立 salt 确定，不消费逻辑 RNG；全部模型及最大尾摆的联合半径用于水体深度留白。
- 金鱼采用圆身扇尾；锦鲤采用修长红白斑身；神仙鱼采用菱形身和高背腹鳍；鲶鱼采用扁头和触须；鲈鱼采用厚身与锯齿背鳍；虹鳟采用纺锤形身、粉色侧带和斑点。
- 用户已批准方案并要求开始实现。实现前 src/ 与 test/ 快照保存在 $TMPDIR/pelican-fish-017-baseline/，用于无 HEAD 仓库的改动审查。
- 七鱼对照复用既有 demo 入口；实际复现发现 showDemo 会对角色卡片的 null resource 执行 Object.assign 并抛错。仅在 demo 提供资源选项时应用资源选项，补充公开场景接口的回归验证。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/fish-appearance.ts | 新增共享品种目录、外观参数、确定性选择规则，承接原鱼配色 | — | yes |
| 2 | src/render/fish-model.ts | 提取共享鱼模型生成，加入六种轮廓、鳍形与花纹 | 1 | yes |
| 3 | src/render/fish-view.ts | 按品种批量渲染，保留动作并以所有模型计算车道边界 | 1, 2 | yes |
| 4 | src/render/cartoon-fish.ts | 配色改从共享配置导入 | 1 | yes |
| 5 | src/config/showcase.ts | 从共享目录增加鱼种展示条目 | 1 | yes |
| 6 | src/app/showcase/fish.ts | 按品种选择确定样本，复用真实鱼群与游戏视图 | 1, 5 | yes |
| 7 | test/render-fish.test.ts | 适配分批实例结构及配色导入，收敛无价值细节断言 | 3, 4 | yes |
| 8 | test/fish-spit.test.ts | 同步共享配色导入路径 | 1 | yes |
| 9 | src/ui/showcase-model.ts | 支持角色对照 demo 没有资源选项的正常路径 | 5 | yes |
| 10 | test/showcase.test.ts | 验证七鱼对照、样本映射及真实游动 | 5, 6, 9 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器人工验收游戏和展示场中的鱼类外观 | yes | yes |

## Final Validation
- `npm run typecheck`：通过。
- `npm test`：1468 项测试通过，303 个 suite，0 失败、0 跳过，约 68 秒。
- `npm run build`：通过，281 个模块；仅有主 JS 超过 500 kB 的体积提示。
- 审查发现凹鳍轮廓的扇形三角化会导致面重叠；已改用 ShapeUtils.triangulateShape，按原索引保留三维顶点。复核 Approved。
- 该修正后重跑 `npm run typecheck`、`node --test test/render-fish.test.ts test/fish-spit.test.ts`（24 项全部通过）、`npm run build`，均通过。
- 默认种子 20260930 共 35 条鱼，七种外形全部出现：小鱼 3、金鱼 4、锦鲤 7、神仙鱼 5、鲶鱼 7、鲈鱼 1、虹鳟 8。
- Browser 人工查看七种鱼实际渲染，放大核对锦鲤红白斑、神仙鱼高鳍、鲶鱼触须、鲈鱼锯齿背鳍、虹鳟侧带斑点；主游戏正常加载并能看到新鱼，控制台无 error/warn。
- 展示场真实场景手工推进七种游动演示及地上/地下重新入水，行为正常；公开接口回归用例验证角色对照不再对 null 资源选项赋值。
- 收敛旧渲染测试：删除只断言三色字面数量与 instanceColor 细节的用例；原增删同步用例适配混合品种分批，保留行为断言。
- 实现期间工作区出现其他来源的 intro 模块及 resource-scenario.ts 改动；它们不属于本任务，未修改或回退。
- 本地开发预览由本会话启动于 http://127.0.0.1:5175/ （5174 已占用）；未提交或推送。
