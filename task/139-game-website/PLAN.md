# PLAN -- 游戏官网与静态发布

## Status: blocked
## Task: 139
## Related: N/A
## Baseline Commit: 6a514d6

## Goal
将默认入口改为玩家网站，介绍鹈鹕 429，串联序章与已开始制作的主线，支持 GitHub Pages 静态发布。

## Non-goals
不新增剧情关卡，不提交、推送或实际发布，不修改既有角色资源。

## Acceptance Criteria
- 首页有游戏介绍、序章、主线试玩引导，明确开发中状态。
- 序章结束进入现有主线山体堡垒，保留开发工具访问。
- 项目子路径下链接、图片和模型加载正常；提供无测试命令的 Pages 工作流。
- 本地 typecheck、全量测试和 Vite build 通过，浏览器检查页面。

## Constraints
保留当前大量未提交改动；复用真实游戏资源；不增加依赖；CI 不运行测试。

## Decisions
- 网站沿用现有 Vite 项目和查询参数入口，不引入站点框架。
- 本次只准备可发布代码；提交和外部发布需要用户明确授权。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | no |
| npm run build | yes | yes |
| 浏览器首页、序章、主线与子路径检查 | yes | yes |

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | index.html, src/ui/homepage.css | 玩家首页与移动端布局 | — | yes |
| 2 | src/main.ts, src/ui/navigation.css | 首页独立导航与启动分流 | 1 | yes |
| 3 | src/config, src/ui, src/app 静态路径 | 统一页面相对资源和导航；序章衔接主线 | — | yes |
| 4 | vite.config.ts, .github/workflows/pages.yml, README.md | 相对构建与 Pages 发布 | 3 | yes |

## Final Decisions
- 探索与架构子代理确认复用 fortress 自由探索，首页明确主线尚在开发，不新增关卡逻辑。
- 统一角色图片目录为页面相对路径，去除混合目录解析；无新依赖或通用路径层。
- 首页中文展示，既有游戏及工具语言切换保留。
- 无需用户裁决或不可回退操作，直接设计并实现。
- UI 和路径常量变更不新增复述实现的测试，验证真实浏览器加载和现有检查。

- 验证发现仓库架构契约禁止动态 import，恢复静态模块导入，不修改架构测试；首页仍不启动游戏实例。

## Delivery Evidence
- 网站实现与浏览器验收完成。桌面1440和手机390宽度无横向溢出，图片正常，锚点与章节入口可用。
- 子代理审查通过；验证子代理发现动态导入违反架构契约，已恢复静态导入。
- 最终 typecheck 通过；architecture 定向重跑21/21通过；Vite build 通过（最终日志 $TMPDIR/pelican-website-build-delivery.log）。
- 全量 npm test 初次1580项、1577通过、3失败；架构项已修复重验通过。其余settings与weapons-render两项中文文案断言失败，定向重跑仍失败，关联本任务之外 language.ts 浏览器语言默认识别改动；未修改断言或该功能。故保留blocked状态，不能宣称全部验证通过。
- 工作期间同工作区新增了正式mode=story主线接入，保留这些同步修改。最终静态产物实际走通首页→mode=story→序章跳过→资源已就绪→主线1山体算力堡垒（清理外围守卫），没有跨会话通信。
- 前一版独立序章→堡垒探索也已验收，模型贴图正常；CSS HUD图标重写为 ../ui/hud-icons.png。
- 产物约874MiB，含既有历史模型；没有删除资源。GitHub工作流未实际执行，未提交、推送或发布。
- 首页与章节截图：$TMPDIR/pelican-website-evidence/home.jpg、chapters.jpg；主线截图story.jpg。
