# PLAN -- 全站用户入口加载优先级

## Status: blocked
## Task: 246
## Related: 243
## Baseline Commit: 8a8fe8c

## Goal
优化首页、主线和序章的用户可见加载顺序，复用已有压缩图片。
## Non-goals
不重做画质对比/资源实验室，不降低游戏画质，不改游戏规则，不提交发布。
## Acceptance Criteria
- 非首页不请求首页专属图片。
- 序章开始界面优先出现，游戏资源后续预取；必要资源未就绪时不播放空白画面。
- 目录生产角色使用现有WebP预览。
- 相关检查通过，浏览器确认请求时序。
## Constraints
保留当前并行开发已有改动，仅在本次范围增量编辑；不修改vendor、不新增依赖。
## Decisions
- Explore阶段复用243全站审查，跳过重复探索。
- 序章委派explorer设计及core-dev实现，轻量缩略图独立实施；首页激活图片与story预加载由主代理实现。
- 用户明确弱化展示场优先级，仅做无需重设计的缩略图复用。
- 无需用户裁决或不可逆操作，直接实施。
- 6张WebP来源与目录对应；Sam/Tibo现有WebP是人形，保留怪物目录原图，避免形态错配。6张合计7,014,228 B降至101,906 B。
- 保留并行工作新增的自动播放及主线跳过过渡。序章取消后旧加载错误不再覆盖已进入的游戏。
- 本轮范围实现与浏览器验证完成；全局门禁因其他战斗逻辑错误未全绿，标记blocked而非宣称完整通过。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/intro-app.ts / src/ui/intro.css | 先显示开始界面，随后准备资源，播放等待就绪 | - | yes |
| 2 | src/app/story-app.ts / story-preload.ts | 游戏预加载延后且按需导入 | 1 | yes |
| 3 | index.html / src/main.ts | 首页专属图片仅首页激活 | - | yes |
| 4 | src/config/showcase.ts | 复用现有WebP缩略图 | - | yes |
## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | no：非本次修改的weapon-system.ts:83 number不能赋给字面量18 |
| npm test | yes | no：1769/1770通过，showcase.test.ts:160技能命中1而非6，非本次修改逻辑 |
| npm run build | yes | yes |
| node --test test/architecture.test.ts test/render-camera-intro.test.ts | yes | yes：28/28 |
| 浏览器主线/序章/非首页请求检查 | yes | yes |

## Validation Evidence
- dev页无home/头像请求，首页仍按原顺序激活图片；开发服务及最新生产preview均验证。
- 主线开发环境：图片请求671–719ms，背景985–1059ms，story-preload于1578ms、游戏模型约1613ms后才请求；仅用于顺序证明，不当作网络性能基准。
- 点击播放后state=playing；点击跳过后进入游戏，序章层移除、游戏canvas存在、loading隐藏、错误为空。
- 子代理core-review/diff-guard发现取消后过期错误问题，修正后复核通过。
- 未对资源实验室、五档对比页做结构调整，未部署或提交推送。
