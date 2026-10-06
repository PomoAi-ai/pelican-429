# PLAN -- 游玩卡顿优化与卡键修复

## Status: done
## Task: 255
## Related: 146
## Baseline Commit: 8a8fe8c

## Goal
减少游玩过程中的卡顿（用户原则：以减少卡顿为准），同时修复“松开方向键后角色仍一直跑”。

## Non-goals
- 不改画质档位默认值、不删后期效果（由用户另行用 `?quality=low` 对比后决定）。
- 不把渲染整体搬进 Worker / OffscreenCanvas。

## Acceptance Criteria
- 松开方向键后角色立即停下，焦点在任何拦截按键的界面里也一样；Mac 按住 Cmd 时松开的键不会卡住。
- 生产构建实测：首次跑进新区域、第一次变身、Boss 登场、开关设置面板时不再出现 100ms 以上的长任务（或明显减少）。
- 主线存档每 10 秒写一次（页面隐藏/离开时照常保存）。
- HUD 文字只在内容变化时写 DOM；Boss 技能字幕等画布贴图在加载阶段预渲染成图片并预先上传。

## Constraints
- AGENTS.md：最小改动、fail-fast、不加防御性检查、分层规则、渲染/UI 不写自动测试；修 bug 先写复现用例。
- 其他会话同时在改这些文件：编辑前重新读文件，只改本任务相关行。

## Decisions
- 实测（生产构建、山体堡垒一路右跑跳）：首次进入新区域出现 150–383ms 长任务，回到已访问区域不再出现，且期间无网络请求 → 主因是首次上屏的着色器编译与 GPU 上传；仓库内无 `compileAsync`/`initTexture` 预热。
- 卡键根因：游戏只在 window 冒泡阶段监听 keyup，导航抽屉、Boss 场 HUD、音频面板、自由世界工具栏会 stopPropagation keyup；焦点落入这些区域后松键丢失。修法：window 捕获阶段监听 keyup，并在 Meta 松开时 releaseAll。
- Worker 只用于纯计算；着色器编译和 GPU 上传无法离开渲染线程，用预热解决。
- 用户确认：HUD 做预渲染、使用图片；存档改为 10 秒。
- 预热（src/render/warm-up.ts）：compile 本就遍历隐藏对象编译材质，只有灯光按可见统计；故不整体显示隐藏对象，只把会带点光源上屏的隐藏分组（未登场 Boss、连通世界隐藏机房）逐个显示再编一次，并绑定后期 HDR 目标编译以匹配真实程序键。主线未登场 Boss 视图加载期预建隐藏，登场时取用。
- 强制重排来源为 createProjector 每次投影读 getBoundingClientRect；改为 ResizeObserver 缓存画布矩形。
- 冷启动 A/B（全新配置目录、关闭着色器磁盘缓存、各 3 轮）显示仅 compileAsync 的预热无收益；逐行剖析定位剩余长任务：首次输入时 new AudioContext 约 220ms，程序首次使用时 getUniforms→getProgramInfoLog 同步等链接（含阴影深度程序）约 200ms。
- 预热改为每次 compile 后关闭视锥剔除真实渲染一帧，阴影与后期程序按实际版本编译并完成首次使用；AudioContext 与声部改在 GameAudio 构造时创建（未经手势为挂起态），首次输入只 resume。黑洞声测试不再点按钮解锁：上下文已运行时该按钮语义为静音。
- 复测：最长卡顿 187–297ms → 64–76ms，每轮仅剩 1 个长任务；剖析中剩余约 39ms 为个别首次出现的材质程序。
- 探索阶段由两次只读排查完成（坐标/卡顿源报告），跳过 explorer/architect；工作按文件拆给并行 dev-engineer。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| A | src/input/keyboard-mouse.ts (+ test) | keyup 捕获阶段监听；Meta 松开 releaseAll；先写复现用例 | — | Done |
| A2 | src/render/health-pack-view.ts | 血包共享几何体与材质 | — | Done |
| B | src/app/game-audio.ts, blackhole-audio.ts, fortress-score.ts | 每个 AudioContext 只合成一次噪声/黑洞缓冲，暂停恢复复用 | — | Done |
| C | src/app/game-app.ts 等装配处, player-view, facility-presentation, boss/npc 视图与字幕, story-hud, weapon-hud, hud | 加载阶段预热（隐藏对象临时可见 + compileAsync + initTexture，预建 Boss 视图）；字幕预渲染；HUD 仅在变化时写 DOM；存档 10 秒 | — | ✓ |
| D | src/render/chunk-streamer.ts, tile-view.ts, tree-view.ts | 视野内区块与树分帧构建，加大保留范围减少反复重建（瓦片 keep 维持 2：改 3 会超出 world-views draw call 预算测试） | — | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（1785/1786，唯一失败为黑洞声测试的解锁点击，已改测试并单独重跑通过；此前 game-audio-cues 失败属其他会话，本轮未复现） |
| npm run build | yes | Done |
| 生产构建长任务实测（前后对比） | yes | Done |
