# PLAN -- 角色 WebGL 贴图压缩

## Status: done
## Task: 190
## Related: N/A
## Baseline Commit: 3a35077

## Goal
常规游戏默认使用最大 1K 的压缩贴图，保留高清原始模型供特殊使用，游戏与展示场复用同一资源选择和模型实现。提供实际体积及纹理预算变化。

## Non-goals
不修改 vendor、不减面、不改骨骼动画/玩法、不实施按场景延迟加载、不引入 GPU 压缩解码器或部署/提交。

## Acceptance Criteria
- 原始 GLB 保留，生成可重现的 Web GLB；非图片缓冲区及节点/动画语义保持一致。
- 颜色使用 WebP Q90，数据贴图无损编码；原 2K 缩到 1K，已为 1K 不放大。
- 默认游戏/展示場共用 Web 资源；有明确原始高清入口。
- typecheck、全量测试、build 各运行一次；浏览器人工观察加载及渲染，报告局限。

## Constraints
保留已有大量未提交改动；不修改 CI，不添加运行时依赖；不把文件压缩误报为 GPU 原生压缩或 FPS 提升。

## Decisions
- explore: 前轮已完成 GLB 逐项分析、WebP 试压、真实加载调用链与屏幕尺寸研究，本轮复用这些结论，不重复全仓探索。
- design: 同会话架构子代理检查资源选择和高清入口；工程实现按独立文件分工。
- 1K 减少纹理像素/显存预算，WebP 减少下载；避免本轮加入 KTX2 初始化和解码器生命周期改造。
- 原始模型已存在未提交变动，生成物取当前文件；后续源资源重新导出后需重跑压缩命令。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/web-models.ts | 共享源模型列表和 Web 输出路径 | — | yes |
| 2 | scripts/build-web-models.ts | 离线生成/校验 Web 资源并输出尺寸报告 | 1 | yes |
| 3 | src/render/character-model.ts 与三个 rig 入口 | 共用默认 Web / 高清选择 | 1 | yes |
| 4 | public/characters 下 *.web.glb | 生成压缩模型，原件不变 | 2 | yes |
| 5 | docs/character-web-textures.md | 使用入口、生成命令和测量说明 | 2,3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run assets:web | yes | yes — 8 GLB，全部完整性/像素断言通过 |
| npm run typecheck | yes | yes — exit 0 |
| npm test | yes | yes — 全量 1722/1723；唯一负载敏感耗时断言单独复跑通过，详见下文 |
| npm run build | yes | yes — exit 0；保留大 chunk 警告 |
| 浏览器手工查看游戏及展示场 | yes | yes — 自由世界/主线/8模型/原始Sam入口，截图已保存 |

- 设计完成：共享8个源路径，加载时通过 textures=web|original 选择；不改变缓存键。符合既有授权，无需额外设计批准。

## Final Decisions and Validation

- Reviewer: Approved；未发现本轮新增缺陷。三个 rig 仅接入共享路径；原先工作区改动保留。
- 生成脚本首轮因 cwebp 标准输入参数失败，改为 -- - 后完整生成 8 份资源；24 张贴图完成编码/透明度验证，所有非图片缓冲区与其他 glTF 字段不变。
- npm run typecheck：exit 0。npm run build：exit 0，24.90 秒，仍有既有 >500 kB chunk 告警。
- npm test：仅运行一次，1723 tests，1722 pass、1 fail，368.18 秒。唯一失败为 worldgen 生成耗时中位数 929.7ms；期间存在另一份 npm test 和本轮压缩负载。
- 资源生成结束、关闭本轮活动预览后，执行 node --test --test-name-pattern=生成耗时中位数 test/worldgen.test.ts：1/1 pass，exit 0，918ms；没有修改测试或阈值，没有重复全量测试。
- 源文件 SHA-256 与生成报告一致；public 与 dist 中 8 份 Web GLB 字节长度均匹配。未提交、推送或部署，未修改 CI/vendor。
- 理论 RGBA8 mip 数据预算与文件体积可量化；未取得实际驱动显存、移动端 FPS 或受控网络耗时，不宣称对应实测提升。

## 本地实测

生成资源（MB 为十进制文件字节，不含 HTTP 压缩）：

| 模型 | 原始 MB | Web MB | 减少 |
|---|---:|---:|---:|
| Grassy 游戏版 | 6.50 | 4.63 | 28.7% |
| Sam 怪物 | 15.78 | 3.47 | 78.0% |
| Sam 人形 | 13.95 | 3.50 | 74.9% |
| Tibo 怪物 | 13.70 | 3.12 | 77.2% |
| Tibo 人形 | 12.30 | 3.26 | 73.5% |
| 巡线犬 | 12.55 | 3.82 | 69.6% |
| 哨蜂 | 9.96 | 3.72 | 62.6% |
| 搬山 | 9.95 | 3.02 | 69.7% |
| 合计 | 94.69 | 28.55 | 69.8% |

在本机 Vite 构建预览中读取浏览器 Resource Timing，确认自由世界 7 个 GLB 数据体共 25,585,304 字节，主线 7 个 GLB 共 25,420,468 字节，包含未改动的守门人；原对应文件预算为 68,841,392 / 72,072,008 字节。这仅为角色模型，不是页面全部资源。展示场全部 8 个 Web 模型响应 200，原始 Sam 两形态入口也返回原始 GLB。

每个场景这组角色图片的 RGBA8＋完整 mip 链理论数据预算约从 336 MiB 降至 96 MiB（减少 71.4%）；未测量驱动实际显存、移动设备帧率或受控网络首屏时间。

已人工查看自由世界、主线开场、展示场八种压缩模型及人形/怪物切换，并对照 Sam 的 1K / 原始 2K 近景。当前画面未见明显材质或光照异常；不能据此保证所有设备与所有近景画质等同。
