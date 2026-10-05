# PLAN -- Grassy 骑自行车

## Status: done
## Task: 083
## Related: 081
## Baseline Commit: 无 HEAD，保留既有未跟踪内容

## Goal
正式装备主角增加真实骑行姿态和循环：坐车座、握车把、双脚跟随脚踏、自行车传动同步，在角色展示场直接查看。

## Non-goals
不重做已确认身体与装备，不修改vendor，不改鹈鹕或现有11动作；当前任务不增加独立人形玩法系统。

## Acceptance Criteria
- 自行车复用游戏已有模型及生成函数，骑行逻辑位于共享Grassy渲染模块。
- 真实骨骼ride循环，坐垫/把手/脚踏接触合理，车轮链条踏板与人物同一时钟同步。
- 键盘背负、推进器关闭，三档精细度均支持骑行。
- 页面有骑行入口，暂停/慢放/旋转/动作切换正确；切换后自行车隐藏且资源释放。
- 浏览器实际检查侧面与三分之四，完成项目要求的现有检查。

## Decisions
- 复用上一任务已完成的人体、22骨、键盘对象烘焙及shared加载器。
- 两个子代理分别探索自行车复用与Blender接触IK；根负责目录、集成、页面验证和文档。
- Ponytail延续Full模式；无必须用户裁决的问题，不重复申请已授权本地操作。

- 架构合同由两个探索代理联合完成：createRideBicycle(RIDE_RIGS.short)派生人形车，整体.48、握点调整；完整ride为3.6秒108帧，每1.2秒踩踏一圈，三次踩踏对应一圈车轮，坐垫/握点/脚踏共用派生数据。沿既有shared模型管线直接实施。
- 骑姿只新增骨骼片段，车体复用既有生成函数；Blender导入该函数生成的实际几何进行接触对照。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | 骑行几何与相位合同 | 两套模型统一空间和时间 | - | yes |
| 2 | Blender脚本与三档模型 | 新增ride骨骼循环 | 1 | yes |
| 3 | shared Grassy骑行模块 | 复用自行车并同步传动 | 1 | yes |
| 4 | showcase目录和角色资料 | 骑行动作/入口/实渲资料 | 2,3 | yes |
| 5 | 来源文档与证据 | 记录真实交付、检查 | 2-4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 三档GLB骑行/接触与循环检查 | yes | yes |
| 浏览器骑行/切换/暂停/旋转 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

## Result
- 正式角色新增“自行车”动作分类和 `?mode=showcase&demo=grassy-ride` 入口，三档GLB均含12动作；正式资料15张，其中2张为真实骑行渲染。
- `grassy-riding-game.blend` 包含实际共享自行车和同步人体，供直接打开检查。独立人体GLB不重复包含车体。
- Blender逐帧接触检查109帧：鞋掌球部/踏板最大误差7.34e-7格，腕位置8.15e-7格，骨盆座位5.96e-8格；这是约定接触点检查，外观另由实际图片和浏览器查看。
- Three解析三档文件，均22骨、12动作，ride首尾节点世界矩阵最大差0，静息高3.1格。轻量版旧11动作关键帧哈希与导出前一致。
- 独立运行时代理通过三档加载、侧面、慢放、暂停、ride/呼吸来回切换；只读审查代理无阻塞问题，vendor 20个JS哈希保持。
- root在实际IAB确认新图库、侧面和三分之四取景。截图为 `assets/characters/grassy/model-equipped/evidence/browser-ride.jpg`。
- typecheck成功；1532测试全部通过（48.85秒）；Vite构建成功。构建仍提示主bundle超过500kB，未扩大本任务做拆包。
- 未新增自动外观/网格测试，未提交或推送。人形可操控玩法、上下车动作和独立手指绑定不在本次交付内。
