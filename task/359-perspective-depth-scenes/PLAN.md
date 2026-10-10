# PLAN -- 可进入的场景分层透视演示

## Status: done
## Task: 359
## Related: 357
## Baseline Commit: 975f136

## Goal
在现有「透视」入口加入玩家可正常进入、走跑跳跃并切换观察的场景分层演示，覆盖两层背景格子、三层远景、云、太阳、月亮和星星。

## Non-goals
不改变主线世界生成、存档或战斗；不实现完整天文周期、天气系统或重新制作图片。不开新依赖，不提交或推送。

## Acceptance Criteria
- 「透视」可发现并进入分层演示，概念定义有直达链接。
- 山谷、错落建筑、洞穴三种组合可切换；户外可切换白天/夜晚查看日月星云。
- 玩家使用现有游戏模型、动画、移动及碰撞控制，出生有支撑，背景不阻挡人物。
- 两层背景格子与多层远景可辨；日月按画面尺度显示，云与地形遮挡正确。
- 自由观察与游玩切换、场景切换及释放资源正常。

## Constraints
- 复用 DefinitionKit、createBackdrop、天气云、GrassyRig 和 perspective 控制器；缺失的天体放入共享 render 模块。
- 天空与远景不进入玩家碰撞或可玩包围盒；定义坐标镜像Z只作用于构件布局。
- 已有其他任务未提交改动保留，以本轮快照界定diff。
- 渲染/UI人工浏览器验收，不添加材质/网格或源码字符串测试。

## Decisions
- 探索由两个子代理分别检查玩家路由与共享环境；已有三层山脊和分层云可复用，尚无天体组件。
- 新增 scene=depth，沿用 resources 模式和透视宿主；无需新页面模式。
- 架构子代理推荐同一48格可玩区切换三套环境；固定bounds避免天空/远山撑大镜头或回生范围。背景独立构件组，不汇入碰撞。
- 天体跟随相机平移、保持世界方向，按FOV和观察球半径控制画面大小；旋转镜头时可自然移出视野。
- 户外提供白天/夜晚切换，洞穴隐藏天体与云；不新增天文周期。没有需用户裁决的方案分歧或不可逆操作，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/definition-depth-layout.ts | 共用可玩区、三种背景组合、环境装配与释放 | — | yes |
| 2 | src/render/celestial-sky.ts, src/render/stage.ts | 共用天空渐变与独立日月星空 | — | yes |
| 3 | src/app/room-scene-preview.ts, src/app/perspective-controls.ts | 深度变体、昼夜控件、布局生命周期与观察角度 | 1,2 | yes |
| 4 | src/app/showcase-app.ts, src/main.ts, src/ui/site-pages.ts | 路由与透视/概念入口 | 3 | yes |
| 5 | test/perspective-player.test.ts | 新场景出生与行走行为检查 | 1 | yes |
| 6 | docs/depth-definitions.md, public/concepts/depth-definitions.md | 演示入口、当前实现与概念的区别 | 3 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass |
| npm test | yes | 1858/1859；唯一耗时用例单独重跑通过，见下 |
| npm run build | yes | pass（6.07s；已有大chunk提示） |
| 浏览器进入、行走跳跃、组合与昼夜切换、自由观察 | yes | pass |

## Validation Results
- `node --test test/perspective-player.test.ts`：新增场景出生与横向通过行为通过；定向执行4/4通过。
- 全量唯一失败为未修改的 `test/worldgen.test.ts` 耗时检查，中位数259.2ms略超250ms；单独执行 `node --test test/worldgen.test.ts` 后29/29通过。未修改用例或阈值，未重复全量。
- 首次类型检查遇到同工作区并发太阳追光编辑的 Stage 接口未完成，待该接口落盘后重新执行通过；未越界修改该功能。
- 浏览器确认：48格路径移动、跳跃；山谷/建筑/洞穴切换；白天太阳与夜晚月亮星空；洞穴不显示天空；全景/跟随镜头切换；背景与玩法格线/半透明同步。控制台无错误。
- 日月实体约占画面高度10%；窄视口可见。洞穴调整为430个环境构件，正常游玩镜头可见层叠洞拱。
- 子代理复查未发现本次高置信问题；确认环境不参与碰撞、检查材质释放顺序正常。
- 验收截图：day-overview.png、night-preview.png、cave-preview.png。

## Delivery
本地入口：`http://127.0.0.1:5174/?mode=resources&scene=depth`。已保留浏览器在分层演示，恢复跟随玩家。未提交、推送或部署。当前为共享构件组成的空间演示；建筑远景复用远山，自动昼夜、天体轨迹及完整天气不在本轮范围。
