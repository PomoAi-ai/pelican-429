# PLAN -- 基础概念定义页面

## Status: done
## Task: 343
## Related: N/A
## Baseline Commit: 975f136

## Goal
将主角正侧原图比例图接入本地基础概念定义页面，并在左侧目录提供入口，打开本地页面供查看。

## Non-goals
不重绘图片，不修改角色或游戏规则，不发布、提交或推送。

## Acceptance Criteria
- 本地 `?mode=concepts` 可直接打开，显示完整比例图、基础定义、原图来源。
- 角色展示场、历史资料与场景资源左侧均有基础概念定义入口；顶部资源菜单同步收录。
- 概念页自身有左侧锚点目录，图片可打开原尺寸，窄屏可阅读。
- 本地与完整版提供此页面，默认发布模式继续遵守开发页面过滤。

## Constraints
保留已有未提交改动。当前待修改文件已另存 /private/tmp/pelican-concepts-baseline；本任务仅评审自身增量。遵循现有 UI、语言切换与静态页面装配。

## Decisions
- explorer 子代理完成入口与导航探索，已给出完整文件级方案；独立设计轮次略过，因为复用现有静态页面结构即可，无架构分歧。
- 页面内容：统一尺度图、人物比例、背景墙与地形瓦片、原图来源。
- 3.3 头身作为设计参照，与 3.1 格外观高度和 0.8×2.8 格碰撞明确区分；原图未变形校准。
- 图片复制到 public/concepts，保持默认发布资源清单不变，避免把本地概念资料打入正式包。
- 现有本地/发布路由测试表补 concepts；不新增渲染、UI 或源码文本测试。
- 无需用户裁决或不可逆操作，直接实现和验证。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/app-mode.ts、src/main.ts | 本地概念页路由 | yes |
| src/ui/site-pages.ts、src/ui/site-pages.css | 定义页、目录与图片展示 | yes |
| index.html、src/ui/character-stage-panel.ts、src/ui/showcase-panel.ts | 顶部与左侧入口 | yes |
| src/ui/homepage-language.ts、src/ui/showcase-language.ts | 入口翻译 | yes |
| public/concepts | 已确认总图与主角原图副本 | yes |
| test/app-mode.test.ts | 本地可访问、发布拒绝 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，退出码 0 |
| npm test | yes | yes，1842 项测试通过，0 失败 |
| npm run build | yes | yes，退出码 0；保留已有大包提示 |
| 浏览器检查页面、图片、目录、窄屏 | yes | yes，三张图片加载，目录定位正确；场景资源左侧入口可进入；390px 无横向溢出 |

## Outcome
- core-review 与 diff-guard 审查通过，未发现高置信度问题；三张发布目录图片与源图逐字节一致。
- 本次涉及文件的 git diff --check 通过。
- 本地概念页已打开并保留，临时窄屏测试尺寸已恢复；完成后无新浏览器错误，日志中仅保留编辑途中热更新的旧错误。
- 未提交、推送或发布。
