# PLAN -- 精简线上发布资源

## Status: done
## Task: 286
## Related: N/A
## Baseline Commit: 5733e8d

## Goal
正式发布仅携带首页、序章、主线与自由世界需要的资源；本地保留全部原始素材、历史模型、开发展示与画质对照。

## Non-goals
不删除源资源，不重新压缩素材，不提交、推送或操作线上服务。

## Acceptance Criteria
- 默认构建只发布游戏使用的 compact 模型和运行贴图。
- 本地开发及显式 full 构建保留完整资源。
- 精简版隐藏依赖完整素材的开发入口，拒绝请求未发布的画质档位。
- 类型检查、全量测试、构建通过，并核对产物体积与资源完整性。

## Constraints
- CI 不运行测试；本次不改 CI。
- 当前为旁支会话，由当前助手独立探索、设计、实现与验证，不联系主会话或子代理。

## Decisions
- 复用 WEB_MODEL_SOURCES 与 compactModelPath 生成模型清单；Vite 构建禁用 public 全量复制，只输出正式运行资源。
- npm run dev 保持完整；默认 npm run build 精简，npm run build:full 显式输出完整版本到独立目录。
- 线上保留首页、主线、游戏、序章与手机操控，开发展示入口仅在完整版提供。URL 在启动边界校验。
- 本次是仓库内可回退变更，无需额外设计审批。
- 对话与 Boss 场还使用 NPC 正面图，直接从 NPCS 的形态配置纳入发布清单，不遗漏游玩期间显示的头像。
- 发布产物由原先 596 个文件、922,815,096 字节缩减为 92 个文件、23,448,185 字节（22.36 MiB），减少 97.46%。完整资源仍在本地。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes — Node 25.9，1795 项通过，301 组，0 失败 |
| npm run build（隔离输出目录） | yes | yes — 最终产物 22.36 MiB |
| 产物体积、资源清单与浏览器检查 | yes | yes — 9 个 GLB 内嵌资源完整、NPC 头像与首页图片齐全；首页、序章、主线、自由世界正常加载，无控制台错误；本地开发目录可访问 |

测试首次因 shell 默认 Node 22.16 不支持直接运行 TypeScript 而未启动，切换到已安装且满足项目要求的 Node 25.9 后全量通过。最终补入 NPC 图片后重跑类型检查、构建和产物校验。full 模式已核对启用 public 完整复制，不重复生成约 880 MiB 的完整包。未执行整局通关、提交或推送。CI 的全量 LFS 拉取保持现状。
