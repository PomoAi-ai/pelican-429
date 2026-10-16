# PLAN -- 全部头发实时总览

## Status: blocked
## Task: 446
## Related: 444
## Baseline Commit: 64ef4a38

## Goal
独立页面，顶部选择渲染风格，全部头发每行三个平铺，每个角色可鼠标旋转。

## Non-goals
不改模型、材质、动画和现有实验页的正常布局。

## Acceptance Criteria
- 现有全部头发与名称自动复用，默认V2，可切换V1到V10。
- 三列流动布局，卡片独立拖动、缩放。
- 离屏释放模型与WebGL上下文，滚动后能重新加载。

## Decisions
- 已按dev工作流探索；子代理确认现有rig缓存和全局URLModifier不适合并发多模型。
- 采用可见iframe复用现有实验页：隔离缓存，避免重构共享rig和复制渲染逻辑。
- IntersectionObserver仅挂载可见卡片；embed模式空闲不重画，主动释放WebGL上下文。
- 名称目录来自现有实验页DOM，渲染目录复用D1_LAB_VERSIONS，不维护第二份。
- 方案明确、可回退，无需用户审批；渲染UI以浏览器验收，不新增自动测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| d1-hair-gallery.html / src/app/d1-hair-gallery.ts / src/ui/d1-hair-gallery.css | 独立总览入口、可见卡片与风格切换 | yes |
| src/app/d1-render-lab.ts / src/ui/d1-render-lab.css | iframe模式与资源释放 | yes |
| vite.config.ts | full多页入口 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | no |
| npm run build | yes | yes |
| 浏览器三列、切风格、拖转、滚到末尾再返回 | yes | yes |
| core-review | yes | yes |

## Results
- 功能已实现，37款目录、顶部10种渲染、统一角度、独立鼠标拖转及缩放通过浏览器验收。
- 滚到末尾再回顶部可重新加载；首屏3个、末尾4个活动iframe；700px宽度仍3列，resize后画面正常。
- 独立审查发现按需重画需覆盖缩放/resize，已用controls.change和resize脏标记修复并复审Approved。
- typecheck/build通过；npm test为1934项，1933通过、1失败：src/config/art-library.ts其他改动的文案self-researched被架构正则识别为self。该文件不在本次范围，未改动；因此跟踪状态保留blocked，不声称全仓检查通过。
- embed加载前隐藏原页控制界面，空闲停止重画，离屏释放上下文。旧实验页保留并新增总览入口。
- 切换渲染或统一角度会重新加载可见卡片，手动角度会复位；未做动画功能扩展，未提交推送。
