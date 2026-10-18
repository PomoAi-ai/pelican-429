# PLAN -- 头发总览共享渲染器

## Status: done
## Task: 462
## Related: 454
## Baseline Commit: 64ef4a38

## Goal
解决总览多iframe卡顿与画面定位问题，保留全部头发、自适应1至5列、顶部统一风格与同步旋转。

## Non-goals
不改角色模型、造型与材质效果，不扩展动画功能。

## Acceptance Criteria
- 全页仅一个WebGL上下文，不卡片独立运行整套应用。
- 可见区域按卡片位置准确渲染，统一头部取景。
- 加载排队，滚动保留轻量画面，交互不进行图片编码。
- 顶部风格、统一视角、同步拖动正常，旧渲染实验页保留。

## Decisions
- 前两轮iframe/编码快照方案仍有并行解码、多个WebGL上下文与同步编码开销，需要替换根因。
- 采用单renderer/scissor，直接复用共享rig、原头发生成器和applyD1LabLooks。
- rig缓存加入显式源路径并支持单资源释放，避免全局URLModifier导致多模型串款。
- 原实验页与新总览共用头发资源目录；去除不再使用的iframe消息/编码快照路径。
- dev探索和实现由同线程子代理分工，方案在原任务探索中已分析，无需重复用户确认。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/grassy/d1-rig.ts | 显式源资源隔离与释放 | yes |
| src/app/d1-lab-hair-catalog.ts / src/app/d1-render-lab.ts | 共用目录、去除iframe代码 | yes |
| src/app/d1-hair-gallery.ts / src/ui/d1-hair-gallery.css | 单renderer、缓存与同步相机 | yes |
| render-lab.html / src/ui/d1-render-lab.css | 去除嵌入专用样式 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器仅1WebGL、滚动定位、拖转、风格切换 | yes | yes |
| core-review | yes | yes |

## Results
- 浏览器实测37卡片、0iframe、1个hair-renderer；1800px宽五列取景居中，拖动同步旋转，普通滚轮正常滚页；V2/V9切换保留模型无需重新下载。
- 快速滚到末尾和返回，画面与卡片对齐，已加载模型正常显示，控制台无错误。首次GLB仍需串行解码，不声称消除所有首次加载耗时。
- 最多12驻留模型(可见超过12时保留可见)，离屏保留2Dcanvas完整快照；避免图片编码。仅完整未裁剪卡片能生成快照，视角/缩放/风格变化使旧快照失效。
- 单资源测试7/7通过，全量1960/1960通过，typecheck和build通过。
- 独立审查发现裁片快照和旧角度快照，均修复并复审Approved。
- 旧实验页保留，模型及材质算法未改。未提交、推送、发布。
