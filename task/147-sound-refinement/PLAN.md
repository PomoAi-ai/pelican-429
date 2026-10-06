# PLAN -- 声音层次与辨识度改进

## Status: done
## Task: 147
## Related: 135, 138, 143
## Baseline Commit: e5fb3bf

## Goal
继续设计机房堡垒的配乐、动作与Boss声音，替换过于相似、单调的合成效果，并修复声音检查中确认的生命周期问题。

## Non-goals
不改序章动画曲谱、不制作真人配音、不增加依赖、不改其他并行游戏/网站功能，不提交推送。

## Acceptance Criteria
Sam与Tibo的角色/技能有不同音色，技能起手/释放/尾音分层。常用脚步、命中与机械效果不过度重复。堡垒探索/战斗有层次，黑洞保留距离衰减但旋涡更有变化。目录继续共用真实音源。BFCache返回可重新播放，序章自然结束释放声音资源。相关验证完成。

## Decisions
- 使用已建立的WebAudio合成与共享入口，不引入音频框架或外部素材服务。
- 143已提供完整调用链和复现，复用探索结论；设计按Boss、黑洞、生命周期、堡垒声音独立分工，由子代理与主代理并行实现。
- 保留主旋律与108BPM，减少刺耳纯方波，增加可区分的材料共振与节奏呼吸。
- 暂停/续播/销毁功能优先于音色复杂度，全部新增声部纳入现有清理。
- 用户授权继续声音开发，无需设计批准；保留其他未提交改动。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| src/app/boss-audio.ts | 两Boss声音辨识与分层 | yes |
| src/app/blackhole-audio.ts | 旋涡与距离环境音 | yes |
| src/app/fortress-score.ts | 动作音色变化与配乐层次 | yes |
| src/app/sound-gallery.ts | 试听说明与缓存恢复 | yes |
| src/config/sound-catalog.ts | 共享音色说明 | yes |
| src/app/intro-app.ts | 自然结束清理与重播 | yes |
| test/boss-audio.test.ts | 蓄力续播与节点释放回归 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | pass |
| 音频相关定向测试 | yes | 29/29 pass |
| npm test | yes | 1636/1636 pass，86.40秒 |
| npm run build | yes | pass，3.50秒 |
| 真实WebAudio波形与浏览器生命周期验证 | yes | pass |
| 后续声音设计复查 | yes | Needs changes：见163-review-sound-design/REVIEW.md；发现Boss实战接线、技能时序和片尾拖动问题，原验证通过不代表这些交互已被覆盖 |

## Results
- Sam改为数据脉冲、路由锁定与玻璃能量；Tibo改为低喉拟声、弹性连击与机械复位，保留统一技能时间轴与暂停续播。
- 常用动作增加有限的音高/力度变化；水、键盘、三种脚步、金属命中、爆炸、火花与旋翼使用可区分的材料声。光子与服务器超载分别使用玻璃泛音和继电器/机柜冲击。
- 配乐保持108BPM主旋律，弱化刺耳高频并加入乐句留白。黑洞增加缓慢引力呼吸、空气旋涡与低音量中频，距离衰减规则不变。
- 浏览器使用真实音源离线渲染57项：37动作、16Boss动作、黑洞和3档配乐；全部为非零有限波形，最大原始峰值0.2412，无削波。
- 声音目录两次模拟持久化pagehide/pageshow事件后均能重新播放不同Boss技能；这是生命周期事件回归，不声称浏览器实际命中BFCache。
- 序章自然走到63秒后，实际IntroAudio实例playing=false、sources=0、nodes=0；界面停在片尾且点击重播从零开始。
- 子代理复核音源启动/停止、噪声偏移、蓄力续播和资源释放，未发现新增的高置信度问题。
- 23秒真实Boss音源合辑：output/audio/boss-refinement-preview.wav；目录截图：output/audio/sound-refinement-library.png。
- 验证使用本机Node 25运行；未新增依赖或CI测试。构建仅保留既有大chunk提示。未提交、未推送。
