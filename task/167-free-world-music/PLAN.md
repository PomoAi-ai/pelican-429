# PLAN -- 大世界区域配乐

## Status: done
## Task: 167
## Related: 147, 163-review-sound-design
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Goal
为自由大世界接入可循环的探索配乐，覆盖原野营地、湖畔、沙丘、洞穴、浮岛和相连机房，按真实位置过渡并随危险增强，声音目录逐项试听。

## Non-goals
不改模拟、地形、Boss机制或原序章曲谱；不扩大到上一轮报告的全部修复；不新增依赖、不提交推送。

## Acceptance Criteria
- 自由世界与主线进入的自由世界都有声音入口，首次手势解锁，暂停/后台/关闭/离开释放或停止声音。
- 六套区域配乐共用实际游戏音源，探索/警戒/战斗层次可听，区域切换避免重开Context和拍子跳变。
- 地图坐标用于选择主题，洞穴与浮岛不能被地表同列区域覆盖；相连机房用全局实例位置。
- 目录可单独试听六区域及战斗层；中英文文案同步。
- 相关逻辑检查、真实浏览器音源渲染、类型检查、全量测试与构建完成。

## Constraints
复用GameAudio生命周期与FortressScore合成基元；保持逻辑层不依赖音频；不修改其他并行工作。

## Decisions
- 尝试探索子代理时工具拒绝“agent thread limit reached”，由主代理完成探索、架构、实现和复核；不发起跨会话协调。
- 自由世界入口已有freeWorld判定，GameAudio目前只在独立堡垒创建；使用必需scope参数同步调用方，不复制控制器。
- 六主题统一90BPM与相容调性，短和弦跨小节淡出；实际区域稳定1.2秒后在4拍边界换编配，重用正在运行的音频图。
- 选择规则先洞穴/浮岛/相连机房，再营地/湖泊/沙丘/原野，避免用固定堡垒坐标识别大世界位置。
- 用当前位置附近命中提升音乐强度，避免大地图远方战斗拉起背景战斗音乐。
- 复用动作音源时发现旧脚步规则按独立堡垒坐标将原野判为金属，随新接线改为相连机房的全局范围并加入回归用例。
- 增加区域选择行为用例；波形音质与UI通过浏览器验证，不锁定曲谱常量或节点数量。
- 用户要求明确，操作均为本地可回退开发，无需设计批准。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| src/config/world-music.ts | 区域曲目元数据与节拍 | yes |
| src/app/world-music.ts | 从真实关卡选择区域主题 | yes |
| src/app/fortress-score.ts | 六主题音乐与环境编配，复用声源基元 | yes |
| src/app/game-audio.ts | 大世界播放、区域过渡与强度 | yes |
| src/app/game-app.ts | 自由世界入口接线 | yes |
| src/ui/game-audio-panel.ts | 当前曲目与通用声音控件 | yes |
| src/app/sound-gallery.ts | 共享区域配乐试听 | yes |
| src/ui/sound-language.ts | 新目录中英文 | yes |
| test/free-world.test.ts | 区域识别行为回归 | yes |
| src/app/game-audio-cues.ts | 相连机房全局脚步判定 | yes |
| test/game-audio-cues.test.ts | 原野/机房脚步回归 | yes |

## Validation
| Command / method | Required | Done |
|------------------|----------|------|
| npm run typecheck | yes | yes，通过 |
| node --test test/free-world.test.ts test/*audio*.test.ts | yes | yes，区域用例通过；脚步用例改用真实moveX输入后单文件7/7通过，全量覆盖所有音频用例 |
| npm test；node --test --test-concurrency=2 'test/**/*.test.ts' | yes | yes，首轮1675/1676通过，既有地形耗时断言单独复跑通过；保留全部用例、仅降低并发的全量复跑1684/1684通过（190.46秒） |
| npm run build | yes | yes，3.82秒通过，保留既有大chunk提示 |
| 浏览器大世界入口、区域切换、暂停/静音与目录 | yes | yes，小地图真实游戏解锁、浮岛/沙丘/洞穴快速旅行换曲、静音、暂停及恢复；71项目录中的8项新增曲目逐项启停，中英文检查通过，无控制台错误 |
| 真实WebAudio六主题及过渡完整循环波形 | yes | yes，六探索主题、警戒、战斗与区域过渡共9组，每组89.333秒；无非有限采样、削波或dispose后的残音 |

## Review and Evidence
- 主代理沿真实入口、区域坐标、曲谱调度、音源释放和试听目录复核，未新增依赖、内部兜底或CI测试。任务开始前已有的音频修复与其他并行修改保留。
- 六探索主题峰值0.065–0.081，带环境声和战斗的过渡峰值0.155；这是实际WebAudio渲染的客观信号检查，不等同于人工主观听感验收。
- `output/audio/world-music-preview.wav`：56.33秒合辑，六区域各8秒，最后接遭遇战；仅导出试听文件提升音量，峰值0.458，游戏音量未随导出改变。
- `output/audio/world-music-game.png`、`output/audio/world-music-library.png`：实际游戏声音菜单和新增试听目录。
- 全量首轮失败位于未修改的`test/worldgen.test.ts`，耗时中位数789.2ms超出250ms，单独复跑原用例通过；未改阈值、断言或测试选择。
- 全量复跑使用同一测试集合、仅将本次命令并发限制为2，1684项全部通过；用例数量增加来自工作区并行开发，本任务未修改测试运行器或npm配置。类型检查、构建和所有测试使用本机Node 25。
- 浏览器交互覆盖小地图；普通自由世界与主线自由世界入口共用同一接线，后者通过代码路径确认，未另跑主线全流程。
