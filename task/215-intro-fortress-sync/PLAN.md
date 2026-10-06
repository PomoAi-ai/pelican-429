# PLAN -- 序章与算力堡垒同步

## Status: done
## Task: 215
## Related: 214
## Baseline Commit: 8a8fe8c

## Goal
完成序章末段五项同步：新版堡垒画面、黑洞与镜头、双语章节名、单次真实落地、正式主线入口。

## Non-goals
不改前半段故事、游戏战斗、存档结构；不生成新概念图，不提交或推送。

## Acceptance Criteria
- 最后一幕直接复用当前堡垒与程序化黑洞，移除旧遗落边境图与落地点坐标。
- 序章展示穿越与落点锁定，实际游戏中仅执行一次黑洞坠落；声画与提示一致。
- 独立序章结束后进入正式主线，不重播序章，不覆盖已有进度。
- 拖动、跳过、暂停、自动结束、双语和窄屏可用；资源正确释放。
- typecheck、全量测试、build 通过，浏览器查看最终场景和游戏交接。

## Constraints
- 保留当前工作区已有改动，仅修改本任务涉及文件。
- 复用共享游戏资源，无新增运行时依赖；不为视觉效果添加源码/网格断言测试。

## Decisions
- 探索复用相关审查已有结果，省略重复探索；另派架构子代理核对实时场景接入与生命周期。
- 真实坠落保留在游戏内，序章改为黑洞前哨揭示，避免重复落地。
- 无破坏性或外部操作，设计收敛后直接实现。
- 架构复核：使用离屏 StageView，释放场景和 renderer 但不清理后台角色预加载；历史缩略图单独调用序奏绘制，不创建 WebGL。
- 序章不表现角色已落地，删除扬尘/落地重击；进入游戏仍沿用原有首次黑洞入场。
- 独立入口通过一次性 intro=skip 参数进入 story，先加载已有存档，使用后移除参数。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/intro-fortress.ts | 共享堡垒的实时序章镜头与生命周期 | - | yes |
| 2 | src/app/intro-app.ts、src/render/intro-story.ts、src/render/intro-editions.ts、src/render/intro-canvas.ts、src/app/intro-gallery.ts | 接入实时场景、同步绘制接口并删除旧图与落地特效 | 1 | yes |
| 3 | src/config/intro.ts、intro-language.ts、src/render/intro-story-hud.ts、src/app/intro-story-audio.ts、intro-finale-score.ts | 场景揭示时间、双语提示和音效同步 | - | yes |
| 4 | src/app/story-app.ts | 独立序章进入主线且保留已有进度 | - | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes — 退出码 0，15.563 秒 |
| npm test | yes | yes — 1751/1751 通过，301 suites，170.337 秒，无跳过或取消 |
| npm run build | yes | yes — 478 模块，10.29 秒；仅大 chunk 与插件耗时提示 |
| 浏览器查看序章场景、窄屏与进入游戏 | yes | yes — 新版全景/黑洞、双语、暂停拖动、竖屏、独立入口与首次主线自动交接通过 |
| 子代理范围内代码审查 | yes | yes — 未发现本次引入且置信度 ≥80 的问题 |

### 已完成的浏览器检查
- 1280×720：黑洞近景、三层机房全景；暂停、拖动与中英文切换正常。
- 390×844：堡垒全景、英文标题、任务面板和进入按钮可见；已恢复默认视口。
- 独立序章进入正式 story，URL 消耗 intro=skip；主线显示鹈鹕、变身未解锁、外围 5 守卫，未重播序章。
- 上述页面控制台无 error/warn；5184 独立本地构建预览无存档首次主线也自动交接成功，鹈鹕骑行、外围 5 守卫、变身未解锁。
- 历史目录的 10 个实际序奏缩略图正常显示，不需要创建堡垒 WebGL 场景。
- 不添加视觉/文案/网格自动断言；现有存档与主线行为测试随全量测试通过。
- 画面证据：output/intro-fortress/fortress-overview.jpg、output/intro-fortress/story-entry.jpg。

## Outcome
- 五项审查问题已完成同步；旧图片、旧章节名、旧落地坐标与撞击音已从序章路径移除。
- 复用游戏堡垒和黑洞生成函数，没有新增依赖、复制模型或新增防御性校验。
- 独立入口新增的 intro 参数属于 URL 信任边界，显式拒绝未知值。
- 类型、全量测试、构建各执行一次通过；未提交、推送或发布。
