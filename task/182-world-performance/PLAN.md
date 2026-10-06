# PLAN -- 自由世界与主线场景性能优化

## Status: done
## Task: 182
## Related: N/A
## Baseline Commit: 3a35077

## Goal
检查自由世界和主线场景资源、加载与程序热点，实现有证据支持的最小优化。

## Non-goals
不改变玩法或视觉效果，不重构无关模块，不改 vendor，不提交推送或部署。

## Acceptance Criteria
- 根据真实调用链减少重复加载或计算，保留已有工作区改动。
- 记录实际测量和限制，完成类型检查、全量测试、Vite 构建。

## Constraints
- 工作区已有大量用户改动；以任务开始时文件内容为本次变更基线。
- CI 不运行测试，禁止镜像构建和本地部署。
- 渲染和 UI 不新增自动测试；逻辑回归用公开接口验证。

## Decisions
- 定时启动一次后关闭自动化，避免重复触发。
- 先并行探索加载与运行热点，再选取有证据且可回退的改动。

- 探索与设计子代理确认：7 个 app 的静态入口合并为 2,514,586 B 单块 JS；按模式拆分，继续主线存档不加载序章。保留游戏资源预热。
- 堡垒 5 张贴图 8,619,819 B，改并发加载，保留 URL 顺序和失败后完整释放；不压缩图像或改变视觉。
- 液体静止后仍周期扫描全图；在既有 markChanged 契约上维护 revision，消费者独立跳过无变化扫描。
- 小地图满实心填色候选逐像素等价，但 large 五轮中位数 250.37→250.91 ms 无收益，撤回该分支，仅保留有确定收益的液体扫描优化。
- 无需用户裁决的方案分歧，也无不可逆或仓库外变更，直接实施。基线保存在 /tmp/pelican-performance-baseline，仅用于本轮比较。
- 动态导入仍参加架构依赖检查；只允许 main/app 到 app 的固定字面路径，继续拒绝逻辑层、变量路径和其他目标。
- 工作期间其他来源继续修改了 facility-app、facility-environment、home-hero、pelican-controller、control-surface、hud 和对应控制器测试，且重建了共享 dist；这些修改全部保留，不纳入本任务成果。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/main.ts | 按模式动态加载应用 | — | yes |
| 2 | src/app/story-app.ts | 仅新档加载序章 | 1 | yes |
| 3 | src/app/facility-presentation.ts | 并发贴图及失败释放 | — | yes |
| 4 | src/world/fluid-map.ts | 变化版本供独立消费者读取 | — | yes |
| 5 | src/render/light-texture.ts | 静止液体免扫描 | 4 | yes |
| 6 | src/ui/minimap-model.ts | 静止水免哈希 | 4 | yes |
| 7 | test/minimap.test.ts | 水量修改后仍刷新，满足原有直接写入契约 | 4,6 | yes |
| 8 | test/architecture.test.ts | 固定路径懒加载纳入依赖边并保留分层限制 | 1,2 | yes |

- 独立 core-review/diff-guard 审查 Approved，无新增缺陷；撤回未测得稳定收益的满实心栅格分支。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，两次通过，后一次覆盖架构扫描器修改 |
| npm test | yes | yes，最终 1712/1712，301 suites，0 fail/skip，117.427s |
| npm run build -- --manifest | yes | yes，5.23s，保留大 chunk 告警 |
| node --test test/fluid-map.test.ts test/fluid.test.ts test/light-texture.test.ts test/minimap.test.ts | yes | yes，71/71 |
| node --test test/architecture.test.ts | yes | yes，21/21 |

首次全量运行因旧架构规则禁止所有动态 import 而失败；扫描器适配后定向及完整测试通过，未跳过测试。构建后只有测试扫描器修改，不重复构建。

通过 Node 标准输入调用真实 preloadFortressTextures 并替换 TextureLoader 网络边界：5 个请求同时启动、缓存 Promise 复用、逆序完成仍按 URL 返回；失败后的晚到成功纹理全部释放，保留原错误对象。两场景通过。

浏览器使用现有本地预览服务，确认自由世界营地、同世界快速旅行至堡垒、新档序章进入主线、重新加载继续主线均正常，控制台无 error。继续存档的 Network.requestWillBeSent 捕获 10 个 JS 请求，没有 intro chunk。共享 dist 被其他来源重建，因此浏览器验证为当时工作区构建，不作为严格前后 FPS 对比。

## Measurements
下列为本轮构建时 manifest 静态依赖闭包去重求和，包括入口和页面共享代码，非单一入口大小，也非网络耗时。后续共享 dist 重建不影响已记录测量。

| 路径 | 优化前 JS 原始字节 | 本轮构建 JS 原始字节 |
|------|-------------------|---------------------|
| 自由世界 | 2,514,586 | 2,174,677（减少约 13.5%） |
| 有存档主线 | 2,514,586 | 2,179,139（减少约 13.3%） |
| 新档主线含序章 | 2,514,586 | 2,348,583（减少约 6.6%） |

同进程 Node 对照临时基线、seed 429、空 THREE.Scene（只测液体扫描与同步开销），100 次光照扫描帧 / 200 次小地图扫描平均值：

| 世界 | 光照扫描帧更新，前→后 | 小地图静止水扫描，前→后 |
|------|----------------------|-------------------------|
| 堡垒 | 0.0648→0.00205 ms | 0.0224→0.000587 ms |
| 中型 3072×192 | 1.6076→0.00104 ms | 0.7080→0.000040 ms |
| 大型 4096×192 | 2.2077→0.00027 ms | 0.9887→0.000091 ms |

小量后值主要是调用与计时开销；收益是未变化时不扫描全图，不能换算为整帧 FPS 提升。水变化时保持原有扫描与刷新。原始结果保存在临时 measurements.json，三种地图像素与光照数据一致。

贴图并发仅缩短堡垒主线/预览的请求依赖链，5 图总计 8,619,819 B 不变；自由世界本身只取黑洞贴图，不宣称享有 5 图并发收益。没有压缩模型或贴图，没有测量 GPU 显存与长时间 FPS；共享渲染块仍约 1.67 MB，构建大小告警尚在。
