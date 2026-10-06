# PLAN — 草地角色展示场与直接添加

## Status: done
## Task: 162
## Related: 149, 158, 161
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Goal
左侧角色点击即添加并移除 Add 按钮；操作栏悬浮于场景顶部；角色站在最简单的游戏草地场景中；点击空白轻微切换角度。

## Non-goals
不改变角色资源、动作或战斗逻辑，不做自由环绕，不默认批量对比，不提交推送。

## Acceptance Criteria
- 目录可重复追加，保留已有角色与动作，上限可见。
- 操作栏悬浮且不挤压场景，相机不因展开控制变化。
- 复用游戏草地瓦片和植被；默认横版，空白点击切换小角度，控件点击不影响角度。
- 类型检查、全量测试、构建、浏览器验收通过。

## Constraints
保留工作区其他修改，不新增渲染/UI自动测试。

## Decisions
- 使用 dev/core-dev/core-test 和 Ponytail Full。前两次实现已完成目录与控制组件探索，直接复用其结构。
- 草地复用由子代理探索并实现；主代理完成目录交互、悬浮布局与角度装配。设计没有需用户裁决的分歧，直接实现。
- 复用单 Stage，角度限制在小范围，不引入新依赖或完整世界模拟。
- 草地子代理确认直接复用 createTileView，无树、水、天气与额外世界模拟；土层加深为64格，按视口加载。
- 审查子代理发现旋转后的瓦片视口范围不足，已改为相机四角射线与旋转瓦片平面求交；复核通过。
- 操作栏增加直接关闭入口，避免高缩放下唯一收起入口被挡；角色与控件点击不改变角度。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/character-stage-panel.ts、character-stage.css、showcase-language.ts | 直接追加与悬浮栏 | yes |
| src/app/showcase/stage-ground.ts | 最简单的共享草地 | yes |
| src/app/character-stage-app.ts | 地面接入、小角度与生命周期 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | 首次1655/1656通过，唯一世界生成性能门槛失败（同期系统load115.96）；单独复跑该用例通过，无断言修改 |
| npm run build | yes | 首次共享dist复制文件ENOENT；源文件存在，改用 --outDir /tmp/pelican-showcase-meadow-build 重跑通过；保留包体积与插件耗时提示 |
| 浏览器交互与视觉验收 | yes | yes，1360×900及390×844；目录重复追加、8角色上限、清空/移除、操作栏开关、小角度、角色点击不转角均通过 |
| core-review / diff-guard | yes | yes，修复后复核通过 |

## Evidence
- `evidence/meadow-controls.jpg`：双角色草地和顶部悬浮控制。
- 验收后恢复单角色默认角度，未提交推送。
- 性能失败定向复跑：`node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts`，1/1通过。
