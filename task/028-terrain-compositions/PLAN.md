# PLAN — 有限空间的地形组合

## Status: done
## Task: 028
## Related: 021
## Baseline Commit: 无 HEAD；源代码快照 $TMPDIR/pelican-028-before/src

## Goal
把已确认的概念图转为八种可比较、可进入游戏的小场景。丰富度来自连续轮廓、高差、洞隙和植被疏密，直接共用游戏关卡数据与渲染。

## Non-goals
不把概念图当游戏贴图；不添加远景城堡资源；不重做物理形状；不提交推送。

## Acceptance Criteria
- 平地、土丘、草沟、半格阶梯、缺口崖台、洞口土台、树根坡地、浅水洼地八种连续地形，同范围同尺度比较。
- 整格、半格、斜坡真正参与地图碰撞；洞隙有净空，水体使用真实流体，树木使用已有模型与平台。
- 展示与游戏入口调用同一关卡工厂、材质、植被及环境规则。
- 保留原演示、最多八张卡、镜头旋转、植被分层、网格与站立位置检查。
- 浏览器检查全部八场景，验证进入游戏和基本行动。

## Constraints
遵循 AGENTS.md，共享资源，边界验证，原有工作不覆盖；无 CI 改动。

## Decisions
- 使用 dev 流程，子代理探索共享世界逻辑。
- 当前用户已批准概念方向，可回退实现不再申请确认。
- 现有连续接缝、纹理、群落植被、树根和水岸渲染已满足复用基础，不新增展示专用模型。
- 选择共享组合关卡工厂：游戏通过 level=composition 直接加载，展示同源。随机大世界保持原生成链，避免破坏洞穴、湖泊及出生点契约。
- 新增第八演示并默认打开，原七项保留；每卡进入游戏携带当前构图、种子、材质和环境。
- 同范围八卡采用两列宽幅布局；可站立线读取真实 shapeTopAt，覆盖整格/半格/斜坡和树平台。
- 子代理分别实现纯世界生成及UI；主代理接入应用与共享检视层。无需额外审批。
- 浏览器验收将洞口改为单侧入口盲洞：左坡进入、右侧土壁承托厚顶，可原路返回，避免无承托的悬浮顶盖。
- 地下树平台按 TREE_PLATFORM_CLEARANCE 保留净空；回归先复现穿顶，再修复，独立复审 Approved。
- 首屏精简组合控件并下调观察中心；环境、风力、播放和详细设置保留在更多设置，原七项演示仍可切换。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/terrain-compositions、world/terrain-compositions | 共享目录与可游玩组合生成 | yes |
| config/resource-showcase、scene-demos、ui展示模块 | 八卡组合及保留控制 | yes |
| app/game-level、game-app、showcase装配 | 相同工厂用于游戏和展示 | yes |
| render/resource-preview、resource-inspection | 场景可见性、真实网格/站立面 | yes |
| test/terrain-compositions、showcase | 碰撞/流体/确定性与共享链路验证 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | passed |
| npm test | yes | 1479/1479 passed |
| npm run build | yes | passed，既有大 bundle 提示 |
| 浏览器：八种轮廓、角度、网格、站立面、游戏入口 | yes | passed，地下、材质、种子、原树木演示切换正常，无控制台错误 |
| 独立审查与 diff-guard | yes | Approved，地下树平台净空已修复 |

## Outcome
- 场景功能展示默认进入第08组，八张卡可直接进入同源游戏关卡。
- 组合工厂已在游戏加载路径使用，尚未自动插入随机大世界；不把独立预览误报为随机世界生成完成。
- 除源码外新增行为测试8项，保护半格行走、洞内进出、水守恒、树平台净空与展示/游戏数据一致性。
- 日志：$TMPDIR/pelican-028-{typecheck,test,build}.log。
- 验证后仅更新洞口说明文案及本记录，未改变行为；未提交推送。
