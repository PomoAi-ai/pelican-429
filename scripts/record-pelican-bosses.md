# 两部一分钟 Boss 战斗录像

在仓库根目录运行。需要已安装的 Playwright、Chromium、FFmpeg 和同目录的 FFprobe；脚本不会安装依赖。

```sh
node scripts/record-pelican-bosses.mjs \
  --playwright /绝对路径/playwright/index.mjs \
  --browser /绝对路径/Chromium \
  --ffmpeg /绝对路径/ffmpeg \
  --output output/videos/pelican-boss-films
```

默认依次录制两部独立的 60 秒影片：鹈鹕击败 Tibo；鹈鹕完整变成人形，再击败 Sam。加 `--boss tibo` 或 `--boss sam` 可只录其中一部。脚本启动本地 Vite（127.0.0.1:5182），每部片使用独立页面。

片中保留堡垒雨雪、局部光照和实际游戏原声；镜头跟随双方取景，骑行和飞行时拉远，近身时拉近，传送时保持平滑。画面只显示双方生命条、片头、每个动作阶段前两秒的字幕与击败结尾，不显示演示血量数值或技能验收清单。

## 动作与演出数值

`pelican-boss-director.mjs` 中的 `BOSS_FILMS` 定义片名、文件名和阶段时间。两部片均编排实际骑行、弃车起飞、空中移动和真实传送：

- **Tibo**：鹈鹕喷水、鱼群轰炸、吞弹反吐、瞬移绕后突进、飞越冲击波、光子终结。
- **Sam**：先展示鹈鹕变身，再用人形骑行、飞行 Codex 对射、Bug 弹群、键盘近战、服务器超载与光子终结。

这是以动作和镜头为目标的演示，允许片场数值调整。开场主角生命为 10000，Boss 生命为 1000；导演会编排 Boss 起手与冷却，并增强末段实弹伤害以完成终结。游戏的动作、弹体、传送、碰撞和死亡仍由真实模拟处理，正式游戏文件与数值不受影响。

录制结束检查实际事件与状态：对应形态全技能、上车、弃车起飞、传送、实际飞行帧、移动骑行帧、主角存活、Boss 击败，以及 Sam 片最终为人形。未通过会抛错并保留原始 WebM 和 JSON，不导出成功成片。

## 输出

每个 Boss 的材料分别放在 `--output` 下的 `tibo/` 与 `sam/`：

- `tibo/01-鹈鹕击败Tibo.mp4`
- `sam/02-人形击败Sam.mp4`
- 每个目录中的 `battle.webm` 为完整原始录制，`battle.json` 保存技能与动作次数、击败时间、每秒状态和天气。
- `opening.jpg`、`frame-10.jpg` 至 `frame-60.jpg` 是游戏画面核对截图。

MP4 将完整原片同步调整画面与音频至约 60 秒，1080p、30fps、H.264/AAC，视频码率上限 8 Mbps，保留尾部击败镜头。原片时长超过支持的调整范围会明确报错。已有同名输出会被覆盖，保留旧版本时使用不同的 `--output`。

浏览器临时接入点依赖当前游戏代码；接入点改变时明确失败，需更新脚本后重新录制。

## 本机复录命令

先将 `PLAYWRIGHT_MODULE` 设为本机 Playwright 模块路径、`CHROMIUM_EXECUTABLE` 设为 Chromium 可执行文件路径。

```sh
node scripts/record-pelican-bosses.mjs \
  --playwright "$PLAYWRIGHT_MODULE" \
  --browser "$CHROMIUM_EXECUTABLE" \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --output output/videos/pelican-boss-films
```

## 流畅宣传片重制

`record-pelican-promo.mjs` 复用以上导演，在独立浏览器里停止实时 RAF，用游戏完整帧循环按固定 60Hz 推进；选中镜头每步渲染一张图送给 FFmpeg。机器负载只影响导出时间，不用重复帧补时长。音效由真实模拟事件收集，再使用游戏原生 `FortressScore` 和 `OfflineAudioContext` 按剪辑时间同步合成。

```sh
node scripts/record-pelican-promo.mjs \
  --playwright "$PLAYWRIGHT_MODULE" \
  --browser "$CHROMIUM_EXECUTABLE" \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --output output/videos/pelican-promo-smooth
```

输出 33.85 秒、60fps 的 1080p 重制版和 720p 分享版；保留游戏模型、原动画与技能，近景收紧，删去等待与重复动作。片场血量沿用上面的演出设置。`edit.json` 保存镜头顺序和固定帧数；两份 `*-evidence.json` 保存模拟事件、技能计数、Boss 状态、丢帧计数和音效时间。脚本验收每个镜头帧数、全套技能、骑行/飞行/传送、主角存活、Boss 击败及零模拟丢帧。
