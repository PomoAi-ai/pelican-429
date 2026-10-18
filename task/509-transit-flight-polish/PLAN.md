# PLAN -- 交通中心金属细节、自由登舱与重型发射

## Status: done
## Task: 509
## Related: 505
## Baseline Commit: c292d188

## Goal
加强星舰的抛光金属与工业细节；玩家可以直接飞到顶部发射架，点舱门看到进入提示并确认入舱；起飞具有厚重燃烧喷流、缓慢离地、逐渐加速与最后瞬间化光消失的节奏。

## Non-goals
不新增副本、存档或主世界地图布点，不改通用角色物理，不改全局后处理，不提交或推送。

## Acceptance Criteria
- 金属有可读的环境高光、细密表面变化和引擎/舱门/发射架结构细节。
- 正式角色能飞行、落在顶部桥上；点击舱门弹出进入按钮，确认后才进舱选目的地。
- 地面电梯仍可用；到顶不强制入舱，取消出舱后可自由飞走或乘梯下降。
- 发射具有重型白热喷流、橙色燃烧边缘、地面烟尘、同步低频轰鸣与受控震动；初始缓慢升高，随后加速，末尾冲刺化为光迹。
- 完成仍只跳转一次，取消/重复交互不会绕过阶段；浏览器检查完整流程和资源释放。

## Decisions
- 沿用上一任务的模型/场景装配探索，子代理分别细化模型材质、状态机与发动机特效；主代理承担交互、飞行控制、镜头与整体验收。
- 直接复用正式角色飞行控制器和单向平台碰撞，补齐飞行输入，不另造移动机制。
- 自由控制保留 ground 状态，电梯到顶回到自由控制；开门/入舱单独有过渡，记录实际进入起点。
- 银金属使用局部环境反射，保留城市既有天空和光照。
- 跃迁短时爆白并向上冲刺，取代原先缓慢分段扫描消隐；保持末段光轨在镜头内。
- 只为新的入舱和电梯状态行为补测试，模型、火焰、手感使用浏览器验收。
- 无需用户裁决的方案分歧或不可逆操作，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/config/transit.ts / src/sim/transit.ts / test/transit.test.ts | 顶部自由交互、开门入舱和电梯状态 | — | yes |
| 2 | src/render/transit-center-model.ts / transit-surface.ts | 金属、工业细节、门拾取与化光舰体 | — | yes |
| 3 | src/render/transit-center-fx.ts / transit-exhaust.ts | 重型喷流、地面气浪、跃迁光迹 | 2 | yes |
| 4 | src/app/transit-app.ts / transit-pilot.ts / transit-controls.ts / src/ui/transit.css | 飞行落台、舱门弹窗、镜头和流程装配 | 1,2,3 | yes |
| 5 | src/app/transit-audio.ts | 用户交互后启动的发射低频声与燃烧轰鸣 | 1 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/transit.test.ts | yes | yes：6/6 |
| npm run typecheck | yes | yes：通过 |
| npm test | yes | yes：首次 1993/1994，唯一分层失败已修复，相关文件复测通过 |
| node --test test/architecture.test.ts | yes | yes：21/21 |
| npm run build | yes | yes：通过，已有大体积 chunk 提示 |
| 浏览器飞到平台点门、入舱选关、取消、乘梯与最终发射检查 | yes | yes |

## Final Verification
- 独立审查发现 UI 值导入逻辑层、声音按钮点击后的键盘焦点、空电梯时顶部落脚深度三个问题；均已修复。输入装配移至 app，按钮交互恢复画布焦点，塔架补永久等候平台并对齐角色深度。
- 实机验证正式角色按住空格飞行、落在桥面、点击实体舱门读卡器弹出进入确认；确认后开门进入，未选目的地时不能发射。
- 验证取消出舱留在桥上、走向电梯召梯下降、再次上楼恢复自由控制，没有强制入舱；点击声音开关后键盘移动仍正常。
- 点火先建立推力再松开支架；7 秒升空曲线由约 0.3 m/s 逐渐加速至约 12 m/s，随后 0.7 秒跃迁冲刺、舰体化光。喷流实机二次调整为白热核心、橙黄湍流，去除长段紫色光柱。
- 两次完整发射分别抵达算力大教堂、光纤深渊。展示场切换至住宅再返回，交通中心正常重新挂载；浏览器 error/warn 日志为空。
- 最终 typecheck/build 均通过；全量测试仅运行一次，修复其分层失败后按仓库规则只复测相关 architecture 文件，不重复全量测试。
- 未做手机实机性能测试、外接音响试听与长时间内存剖析。未提交或推送。

## Evidence
- [门口确认进入](evidence/hatch-entry.png)
- [驾驶舱选择目的地](evidence/destination.png)
- [重型燃烧升空](evidence/heavy-ascent.png)
- [化光冲刺阶段](evidence/light-escape.png)（速度栏换行已在最终 CSS 修正）
- 本地开发试玩：`http://127.0.0.1:5174/?mode=game&level=transit`；稳定构建预览：`http://127.0.0.1:5187/?mode=game&level=transit`。
