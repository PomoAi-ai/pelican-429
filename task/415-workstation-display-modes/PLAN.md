# PLAN — 两格半工作站与三态悬浮显示器

## Status: done
## Task: 415
## Related: 412, 413, 414
## Baseline Commit: d2d72f4

## Goal
工作站整件总高改为 2.5 格，悬浮显示器支持地球仪、苹果桌面风格和科幻多层悬屏三种动态形态，接入当前住宅的目录与游戏。

## Non-goals
不实现真实操作系统应用，不改变桌面落脚高度、其他家具、存档格式，不提交或推送。

## Acceptance Criteria
- 工作站占位 2×2.5×1，桌面仍为 .99；三态及动画均在占位范围内。
- 默认自动轮播，控件可手动选定地球仪、苹果桌面、科幻悬屏；切换有投影过渡。
- 原地球仪继续旋转；桌面含菜单、窗口与 dock；科幻悬屏有错层面板和动态图表。
- 游戏/目录使用共享模型；旧家园的断电开机行为继续控制全部显示态。
- 当前存档可正常进入，建造放置、人物落脚不受损；尺寸资料与目录同步。
- 浏览器核对三态白天/夜晚，完成相关检查。

## Constraints
本次基准 /private/tmp/workstation-displays-start；保留历史工作区修改。渲染效果/动画/UI 由浏览器检查，不新增材质/几何断言测试。

## Decisions
- 复用已完成的住宅调用链探索，由两个子代理补充显示器设计和尺寸/存档影响分析。
- 新增半格用于悬浮显示空间，桌台本体尺寸不变。单一资源、三种显示形态，不添加三类家具。
- cycle 每种约 10 秒，手动选定后保持；不增加显示偏好存档字段。
- 共享显示模块承载几何、静态文字纹理及动画，家具工厂只装配，避免重复实现。
- 原有合法存档若恰好在桌顶旧高度紧贴放物会受新占位限制；先核对当前浏览器存档，不静默搬移或丢弃。
- 无不可逆操作或需用户裁决的设计分歧，直接实现。
- 独立审查发现建造 ghost 未更新动画，已在现有帧循环同步更新；浏览器确认苹果桌面预览与实物一致。
- 新 Canvas 纹理使聚落测试暴露缺少 DOM 边界替身，已补充并恢复原 document；不添加生产降级分支。
- 当前浏览器原 210 个构件存档正常加载，未放置、拆除或重置；默认 741 个构件布局也通过新尺寸校验。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/workstation.ts; src/config/residence.ts | 显示模式和高度契约 | — | yes |
| 2 | src/render/definition-furniture.ts; workstation-display.ts | 三态投影模型/动画及释放 | 1 | yes |
| 3 | src/render/residence-view.ts; src/app/definition-scene-layout.ts | 转发显示模式、目录尺寸 | 2 | yes |
| 4 | src/ui/workstation-controls.ts; residence-hud.ts; src/app/residence-app.ts; room-scene-preview.ts | 两入口显示切换控件 | 1,3 | yes |
| 5 | docs/furniture-definitions.md; public/concepts/furniture-definitions.md; src/ui/site-pages.ts | 尺寸说明同步 | 1 | yes |
| 6 | test/residence.test.ts; test/definition-settlement.test.ts | Canvas 边界替身；放置/落脚行为验证 | 2,3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 通过，ghost 修复后再次通过 |
| node --test test/residence.test.ts | yes | 17/17 通过 |
| node --test test/definition-settlement.test.ts | yes | Canvas 替身修复后 6/6 通过 |
| npm test | yes | 已执行：1902 项，1896 通过；5 项 Canvas 失败已修复并重跑通过；余下 1 项为既有 architecture 误报 |
| npm run build | yes | 通过，ghost 修复后再次通过；已有大 chunk 提示 |
| 浏览器三态/轮播/手动/白天夜晚/建造存档 | yes | 完成；现有 210 构件住宅加载，2×2.5 占位与动态 ghost 可见，未修改存档 |
| 子代理独立审查 | yes | 两项发现均修复；尺寸、释放、供电与模式重建未发现其他问题 |

## Evidence / Remaining Limit
- 图片：assets/concepts/ai-city-residence/workstation-desktop-preview.png、workstation-hud-night-preview.png、workstation-globe-night-preview.png、workstation-builder-preview.png。
- 全量日志：/private/tmp/workstation-displays-tests.log；最终构建日志：/private/tmp/workstation-displays-build.log。
- 既有 architecture 误报：src/config/art-library.ts 的英文资料描述含 window，test/architecture.test.ts:232 的正则把普通文字识别为 DOM 使用；与本轮起始快照相同，未越界修改。
- 未重复整套测试；修复后只重跑受影响聚落测试及类型检查/构建。未测试手机性能，未提交或推送。
- 旧家具原画位图仍标 2×2，旁注已明确当前工作站以 2×2.5×1 和游戏模型为准；本轮不重绘历史原画。
