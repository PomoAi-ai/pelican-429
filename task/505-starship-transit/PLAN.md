# PLAN -- 星舰交通中心试玩

## Status: done
## Task: 505
## Related: N/A
## Baseline Commit: c292d188

## Goal
依据交通中心 V8 原画制作可交互的横版游戏 3D 场景：顶部驾驶舱、独立电梯发射架、登船桥，玩家登舱后选择现有场景，完成收桥、蓄能、升空与消失再抵达目的地。

## Non-goals
不制作新副本内容，不改玩家存档与经济，不提交或推送，不修改既有无关工作。

## Acceptance Criteria
- 场景目录与游戏直达入口能加载真实 3D 交通中心，使用共享正式角色。
- 从地面电梯登到顶部并经桥入舱后才可选目的地；取消可回到地面。
- 发射流程有阶段递进、推进尾焰与科幻消失效果，完成后进入所选现有场景且只跳转一次。
- 游戏视角下可辨认顶部角色和设施，浏览器检验交互与资源释放。

## Constraints
- 遵循 XY 横版玩法 / Z 表现层，以及配置、逻辑、渲染、装配分层。
- 程序化模型在共享渲染模块定义，展示场和游戏使用同一生成函数。
- UI/渲染不写实现镜像测试；状态转换须有行为测试；CI 不添加测试。

## Decisions
- 已有大量其他工作区改动，当前任务只增改本功能相关文件。
- 使用 dev 子代理流水线探索、设计、实现和独立验证；不跨会话通信。
- 现有目的地作为试玩可选场景，名称明确标注；不虚构未存在的副本。
- 探索与架构采用独立 transit app，复用 Stage、城市照明、正式 Grassy 外观与地面控制，避免扩张住宅与通用控制器。
- 共享程序化立体建模符合现有磁悬浮/建筑生成方式，可直接浏览器检查，无需新建 Blender 导出链路。
- 新建纯状态机，选择目的地限定在舱内，完成回调仅触发一次；取消沿桥和电梯返回。
- 无不可逆操作或待用户裁决的设计分歧，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/config/transit.ts | 几何约定、目的地与阶段时长 | — | yes |
| 2 | src/sim/transit.ts | 登船、选关、取消和发射状态 | 1 | yes |
| 3 | src/render/transit-center-model.ts / transit-center-fx.ts | 共享星舰与塔架模型、发射特效 | 1 | yes |
| 4 | src/app/transit-app.ts | 玩家交互、镜头、流程装配与跳转 | 1,2,3 | yes |
| 5 | src/ui/transit.css / index.html | 选关、进度与操控界面及样式入口 | 4 | yes |
| 6 | src/main.ts / src/app/scene-catalog.ts / src/app/scene-workspace.ts | 注册试玩与目录入口 | 4 | yes |
| 7 | test/transit.test.ts | 状态行为测试 | 2 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass |
| node --test test/transit.test.ts | yes | 5/5 pass |
| npm test | yes | 1988/1989 pass；唯一 CSS 导入架构失败已修复，定向复验通过 |
| node --test test/architecture.test.ts | yes | 修复后 21/21 pass |
| npm run build | yes | pass；既有 character-model 大包提示 |
| 浏览器完整登船、取消、发射、目的地跳转检查 | yes | pass |

## Result
- 已完成高挑银色星舰、顶部可见真实玩家的驾驶舱、独立电梯塔、水平伸缩桥和小候船区；展示场与游戏共用建模函数。
- 登船后才显示目的地，未选择时禁止发射；取消会沿桥和电梯回到地面，再次登船清空上次选择。
- 完整演出为关门、收桥、松夹臂、蓄能、离子尾焰升空、扫描环逐段消隐、进入既有目标场景。
- 独立审查发现的输入焦点、镜头状态、返回缓存与资源生命周期问题均已处理；Esc 在选关按钮聚焦时仍能返回。
- 浏览器实测了山体算力堡垒、算力大教堂与光纤深渊的目的地跳转；后退返回交通中心和展示场切走再进均正常。
- 连续帧验收发现推进特效发黑；修正离子场 GLSL pow 的非负定义域后，95 个连续截图没有黑帧，随后再次完整验收。升空镜头同步提高跟随速度，驾驶舱保持完整入镜。
- 证据位于 evidence/：ground.png、cabin.png、retract.png、ignition.png、ascent-mid.png、warp-mid.png、arrival.png、workspace.png。
- 最后修改后 typecheck 与 build 再次通过；渲染效果通过浏览器验收，未新增渲染自动测试。全量测试唯一失败修正后仅重跑受影响架构测试，没有重复全量运行。

## Limits
- 当前是独立可试玩交通中心，目的地使用三个已有场景预览；未新增副本内容、存档联动或主世界地图布点。
- 本地展示场入口仅开发模式提供，普通生产构建按既有规则关闭 lab；游戏入口可在构建预览正常运行。
- 未做移动真机性能测试，未提交或推送。
