# PLAN -- 鹈鹕变身过场与飞轮律动

## Status: blocked
## Task: 032
## Related: 024, 028, 030
## Baseline Commit: 无 HEAD；相关源文件快照位于 $TMPDIR/pelican-transform-before

## Goal
把变身做成独立可读的短过场；完成后由完整鹈鹕骑车，飞轮与音乐节拍联动。

## Non-goals
不重做序章模型演出、人物资产和游戏世界，不改变路由、降智、空拍、封号的先后与拍点。

## Acceptance Criteria
- 失控之后有明确的羽化变身动作，而非直接切到完整鹈鹕静图。
- 中间态只出现在变身过场，正式骑车段始终为完整鹈鹕。
- 车轮聚拢、悬停、甩飞与音乐节拍同步；身体/车架的律动和音符加强节奏。
- 暂停、拖动、重播以及各开局的不同序奏长度仍正确同步。

## Constraints
- 共用既有场景与图片，不增加运行时依赖，不改变其他开发中的文件。
- 动画由真实秒确定，不通过上一帧累积，所有音频源继续交给宿主管理。
- 只做本地可逆修改，不提交、推送。渲染效果由浏览器验收，不加源码文案断言测试。

## Decisions
- 使用 `$dev` 流程；音频探索与过场架构由当前任务的子代理并行完成。
- 复用同构图中间态与纯鹈鹕底图，在过场中做局部羽化揭示；不再次生成资产。
- 探索与架构已完成，无需用户裁决的分歧；本地可回退，直接实现。
- canonical 32–34 秒为四拍变身，34–40 秒为纯鹈鹕骑车，40–40.5 秒定格静拍；世界、落地、目标和结尾整体后移两秒，终版完整时长为55秒。
- 变身使用羽片边缘的空间裁切，局部揭示纯鹈鹕，避免两张图透明度混叠。34秒后完全排除中间态。
- 骑行采用短促的整幅下压/回弹、轮轴光环与旋律音符，图片和动画轮子共用相机；不宣称实现人物骨骼踩踏。
- 共享四拍变身、骑行起点、渐强点、八音动机、量化轮次。保留前段降级演出的所有拍点。
- 新音效复用 StoryAudioHost 现有节点管理、包络和seek逻辑，定格时环境声与全部骑行尾音同时归零。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/intro.ts | 共用变身、骑行、旋律与尾部时刻 | — | yes |
| 2 | src/app/intro-app.ts | 加载中间态资产及分段状态/字幕 | 1 | yes |
| 3 | src/render/intro-story.ts | 四拍羽化与纯鹈鹕骑车节拍联动 | 1 | yes |
| 4 | src/app/intro-story-audio.ts | 羽化声音、旋律律动、渐强和静拍 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | yes |
| 浏览器检查变身、纯鹈鹕骑车、拖动和世界衔接 | yes | yes |
| 子代理代码复核 | yes | yes |

## Verification Results
- npm run build 通过，保留既有大包体积提示。
- 独立复核四个实现文件通过；临时 Web Audio 边界替身覆盖29个起播点（含变身/骑车/静拍边界前后），无过去时间、逆序包络、非有限参数或未管理节点，静拍雨声gain严格为0。
- npm run typecheck 未通过：test/worldgen-compositions.test.ts 中 y 的 TS7022。该文件不在本轮修改范围，检查期间仍有其他地形文件写入；再次检查同一错误行号由139变为142。
- 额外使用继承仓库同一严格配置、仅包含 src 与 vite.config.ts 的临时配置检查生产代码，通过。配置与日志在 $TMPDIR/pelican-transform-source-tsconfig.json 和 $TMPDIR/pelican-transform-source-typecheck.log。
- npm test：1483 项，1475 通过、8 失败。失败在 contracts-013、islet-jump、render-desert-rocks、render-smooth、worldgen-terrain 和 worldgen 的地形/生成用例，均不消费本次 intro 文件；未改断言或跳过用例。
- 全仓日志：$TMPDIR/pelican-transform-typecheck.log、$TMPDIR/pelican-transform-tests.log、$TMPDIR/pelican-transform-build.log。
- 开发服务器被其他文件编辑持续热刷新，浏览器验收使用本地构建预览 http://127.0.0.1:5187/?mode=intro&opening=finale。
- 1280×720 实看终版36.5秒羽化中、37.4秒完成鸟形、38.5–43.7秒真实播放的飞轮/音符、44.2秒定格和47.5秒游戏落地；390×844 检查41.5秒骑行取景并恢复默认尺寸。没有人物透明叠影、骑行人体残留或图像与轮位错配。
- 预览截图位于 output/intro-preview/finale/transform-36_5s.png、pelican-rhythm-playing.png、pelican-rhythm-mobile.png。

## Delivery State
- 本轮动画、配乐、预览和范围内审查已完成；无新增图像、依赖或仓库测试，未提交、推送。
- Status 为 blocked 仅表示全仓交付验证仍受范围外的地形类型错误与8个生成测试失败阻塞；不修改其他工作中的地形实现、测试断言或校验配置来使其通过。
