# PLAN -- 无人机正式模型与铝热剂火雨

## Status: blocked
## Task: 136
## Related: 132-compact-white-drone
## Baseline Commit: 6a514d6（工作中观察到）；按文件职责及任务前快照隔离并行修改

## Goal
按已批准定稿制作正式无人机资源，完善铝热剂连续火花雨，保留随机白壳饰色与倾斜飞行。

## Non-goals
不改其他角色，不提交/推送，不购买订阅或额外额度，不涉及现实武器技术。

## Acceptance Criteria
- 使用批准定稿匹配低矮白壳机身与四旋翼，实际渲染检查正侧面。
- 10种随机饰色、双/三叶、5动作、尺寸契约继续有效。
- 铝热剂施放阶段有连续下落亮色火花，落地有低矮燃烧区；停止施放与敌人消失时正确清理。
- 游戏与展示共用；本地检查通过并保存真实截图。

## Constraints
用户已授权 Hyper3D/Rodin 订阅及已配置 CLI；仅在现有额度内生成，不新购。原始资源留存。

## Decisions
- 先检查配置CLI能力和原模型构建链，再选择最小制作路径。
- 逻辑伤害继续由已有载荷处理，连续火雨表现绑定真实技能时间与地面，避免增加无意义伤害实体。
- 已确认CLI订阅有效，使用一张单物体建模输入提交一次Gen-2.5-High/Raw60000生成；原模型备份，新生成结果单独留存。
- 沿用前轮已完成探索架构；新增火雨挂无人机视图，地面火区由原投射物视图精修；3秒悬停施放仍只生成一个伤害载荷。
- 模型与地面效果由两个子代理制作，主线程实现连续火雨与资源目录；无需要用户裁决的分歧。

## Implementation Map
| 范围 | 负责 | Done |
|---|---|---|
| 正式模型生成/细化、GLB、真实预览、SOURCE | 模型子代理 | yes |
| 铝热剂火雨与火区、技能时间、展示图引用 | 主线程与效果子代理 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | 最新全仓检查未通过：mobile-play-guide.ts和story-hud.ts的CSS导入缺类型声明，均非本任务改动；同编译规则仅包含无人机改动模块及其依赖的检查通过 |
| npm test | yes | 1600/1600通过；最后active阶段语义调整后enemy32/32通过 |
| npm run build | yes | 最终正式资源构建通过；已有大chunk提示 |
| 真实模型与浏览器技能/飞行验证 | yes | 新模型左右前倾、投弹、连续火雨与地面热斑、随机机群均通过；控制台无error，截图production-drone-*.jpg |

## Review
- TS定向审查Approved：技能取消隐藏火雨、实体移除释放、暂停读取模拟时间、单向平台落点及共享资源释放均无新增问题。
- 现有enemy行为测试32/32通过。新火雨+地面热斑已在浏览器目视验证；最终正式GLB替换后再验收。
- Rodin生成1次消耗1订阅额度，无额外购买；正式GLB9.96MB、6joints、5clips、0.80000007高、8个可切换桨节点；原始资源及前版备份保留。
- skill1总100/60秒释放57，skill2总253/60秒释放72；铝热剂180tick为active，火雨状态与UI攻击阶段一致。
- 最终资源独立审查Approved：材质、6骨骼、5动画和尺寸匹配；嵌入3张纹理SHA与新Rodin源完全一致，UV及蒙皮属性完整。

## Remaining gate
制作与接入已完成；等待仓库其余并行修改补全CSS模块类型声明后，再运行全局npm run typecheck。未修改其他任务的移动引导/故事HUD或类型配置。
本任务模块检查命令：`./node_modules/.bin/tsc --noEmit -p $TMPDIR/production-drone-typecheck.json`（继承仓库tsconfig，包含本任务TS模块及递归依赖），通过。
