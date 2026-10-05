# PLAN -- 可叠加龙卷风天气

## Status: done
## Task: 067
## Related: N/A
## Baseline Commit: 无（仓库尚无提交，现有 src/test 已备份到 $TMPDIR/pelican-tornado-baseline）

## Goal
增加能与现有雨、雪、风共存的龙卷风天气，具备可见旋转漏斗与卷起角色的物理效果。

## Non-goals
不修改 vendor、不新增依赖、不提交或推送。

## Acceptance Criteria
- 设置独立启停龙卷风，雨夹雪保持生效。
- 露天角色进入龙卷风范围后被吸引、抬升，离开后恢复正常重力。
- 渲染和物理使用同一确定性位置与时间；暂停不推进。

## Constraints
遵循分层、边界校验和项目测试规则。渲染与 UI 由浏览器人工验收。

## Decisions
- 使用独立天气开关，不新增互斥降水模式。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes（1507/1508；唯一性能失败定向复跑通过） |
| npm run build | yes | yes |

- 探索与设计由 explorer 子代理合并完成：独立 env.tornado 状态、固定时间与世界位置、角色更新后碰撞前施力；不存在需要用户裁决的设计分歧。
- 龙卷风在开启点附近往返，不跟随玩家；露天范围内吸引并抬升，屋顶和深水遮蔽。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| src/world/tornado.ts | 共享确定性状态与力场 | yes |
| src/sim/environment.ts、src/sim/sim-world.ts | 生命周期与角色物理 | yes |
| src/render/tornado-fx.ts、src/render/world-views.ts | 风柱与碎屑渲染 | yes |
| src/config/game-settings.ts、src/ui/settings-model.ts | 独立开关与持久化 | yes |
| src/app/settings-wiring.ts、src/app/game-app.ts | 启动及运行时接线 | yes |
| test/settings.test.ts、test/precip-sim.test.ts | 更新设置替身与行为回归 | yes |

- 独立代码审查通过；并行发生的 intro-finale.ts 修改不属于本任务，保留原样。
- 定向检查：node --test test/precip-sim.test.ts（15/15 通过），node --test test/settings.test.ts（21/21 通过，后续补充组合 URL 断言交由全量验证）。
- 已打开雨夹雪 + 龙卷风本地预览；外观与操控手感留给用户浏览器人工验收，不新增渲染自动测试。

- 最终验证：typecheck、build 通过；全量 npm test 共1508项，1507通过，唯一未改动的世界生成性能断言265.3ms略超250ms。保持断言不变，单独 node --test test/worldgen.test.ts 复跑29/29通过，支持并行负载抖动判断。未重复全量测试。
- 独立验证子代理确认全部新增行为与设置用例通过；没有提交或推送。
