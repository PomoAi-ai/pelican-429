# PLAN -- 场景资源展示场

## Status: done
## Task: 006
## Related: 002, 004, 005
## Current Phase: 7
## Baseline Commit: 无 HEAD，相关原文件已留存 $TMPDIR/pelican-resource-baseline

## Goal
场景资源采用左侧目录卡、右侧真实预览，最多同时 8 卡；首页和全局开发导航增加入口。

## Acceptance Criteria
- 树木、灌木、花草、岩石、渔屋、水池、洞穴装饰七类资源均能预览并切换变体。
- 每卡支持固定种子、风力、地上/地下、角色比例参照、纯资源/场景模式及已有播放对照功能。
- 缩略图来自实际渲染，角色展示场原有动作按钮和游戏导航保持可用。

## Decisions
- 用户强调必须重用代码和资源：目录类型直接引用游戏资源类型，尺寸与色板引用共享规则，模型/材质工厂保持单一实现。该约束写入 AGENTS.md。
- 用户“开始完成”批准此前方案，探索/设计沿用已确认内容，不重复确认。
- 用户限制主动跨会话协作，本任务在当前会话完成全部阶段。
- 共享目录/卡片模型、面板与渲染调度，场景夹具与资源模型单独装配；复用实际游戏工厂。
- 不新增渲染/UI自动测试；纯状态和夹具行为测试覆盖独立副本、种子与结构场地。
- 不采用独立复制整套卡片界面的方案，避免两套上限和控制行为分叉。

## Implementation Map
| 文件 | 用途 | 完成 |
|---|---|---|
| src/config/resource-showcase.ts、src/render/resource-catalog.ts | 资源目录与卡片设置 | 是 |
| src/config/showcase.ts、src/ui/showcase-model.ts | 通用目录与独立卡片状态 | 是 |
| src/ui/showcase-panel.ts、src/ui/resource-controls.ts、src/ui/showcase.css | 资源变体与专用控制 | 是 |
| src/app/showcase/resource-scenario.ts、src/render/resource-preview.ts | 实际资源夹具与渲染 | 是 |
| src/app/showcase/session.ts、src/app/showcase-app.ts | 调度与装配接入 | 是 |
| src/main.ts、index.html、public/resources | 入口、导航与真实缩略图 | 是 |
| test/showcase.test.ts | 纯逻辑行为验证 | 是 |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器实际页面验收 | yes | yes |

## Log
- 2026-10-04：沿用批准方案，探索完成，开始实现。

## 验证结果
- `npm run typecheck`：通过。
- `node --test test/showcase.test.ts test/architecture.test.ts`：30 项通过。
- `npm test`：1460 项通过，0 失败、0 跳过。
- `npm run build`：通过；既有的大包体提示仍在（主 JS 约 1.69 MB，gzip 562 KB）。
- 浏览器：七类实际模型、36 个变体入口、真实缩略图加载；抽查各类别变体切换、地上/地下、检视补光关闭、渔屋场景模式与鹈鹕参照；8 卡上限、新增禁用、关闭释放名额、独立种子和独立暂停均通过。
- 回归：首页四个入口、全局导航、角色走路动作、测试关卡加载无错误。没有添加 UI/渲染自动测试，也未做专项 GPU 压力测试。
- 自查：新增渲染使用现有几何/材质工厂；目录引用游戏类型；尺寸/色板读取共享规则。保留工作区同时出现的角色图片浏览功能，未修改 vendor。
- 2026-10-04：实现、验证和说明完成；未提交或推送。
