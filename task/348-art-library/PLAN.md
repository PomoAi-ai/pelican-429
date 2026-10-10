# PLAN -- 原画资料库

## Status: done
## Task: 348
## Related: N/A
## Baseline Commit: 975f136

## Goal
整理有确认依据的原画，在资源菜单新增独立二级入口，页面左侧提供分类资料列表，右侧展示原图、版本和确认依据。重点纳入用户指定会话中确认的 D1 无外服赤脚基础版。

## Non-goals
不重新生成或修改原画，不替换游戏模型，不发布、提交或推送；不把候选稿和模型截图标成确认原画。

## Acceptance Criteria
- 默认打开 D1 基础版，原确认稿、高清重绘及脚底修订可追溯。
- 确认、派生、候选状态明确；六类目录、原尺寸查看、双语和窄屏可用。
- 原有 public 图片直接复用，非 public 图逐字节复制，来源及哈希集中登记。
- 沿用现有本地完整版资料页访问规则。

## Constraints
保留大量已有工作区改动。只读取用户本次明确指定的会话，不向其发送消息。CI 不增加测试。

## Decisions
- 前轮资料探索已完成，直接复用确认记录清单；本轮补查用户指定会话。
- UI 子代理完成入口探索与文件级方案；沿用现有页面结构，没有架构分歧，合并探索与设计阶段。
- 用户原话“这个就合适”对应 d1-approved-swim-source.jpg；高清重绘和补脚底是后续派生版本。基础造型约 3.3 头身为设计目标，3.1 格为游戏身高，不宣称图片精确校准。
- 采用独立静态资料目录和单条目浏览，不增加依赖或复制模型；无需新的设计审批。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/art-library.ts | 双语分类、版本状态与原图索引 | yes |
| public/art-library | 原图副本与来源登记 | yes |
| src/ui/art-library.ts、art-library.css | 左侧列表、原图浏览、状态与双语 | yes |
| src/main.ts、src/config/app-mode.ts、index.html | 独立本地模式及资源二级入口 | yes |
| src/ui/*panel.ts、*language.ts | 共享资料入口与中英文本 | yes |
| test/app-mode.test.ts | 现有访问范围用例补充新模式 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | 通过，退出码 0 |
| npm test | yes | 已运行一次：1821 通过，架构文件因本次动态导入失败；修复后受影响架构及模式用例 23/23 通过 |
| npm run build | yes | 最终版本通过，保留既有大 chunk 提示 |
| 原图文件与副本 SHA-256、目录引用检查 | yes | 74 路径唯一、全部存在、来源与副本 SHA-256 一致 |
| 浏览器桌面/窄屏、切换、双语、图片加载 | yes | 默认三图正常，条目/筛选/双语/二级菜单通过；390px 无溢出，console 无警告或错误 |
| 本次增量独立审查 | yes | Sam/Tibo 同名图覆盖问题已修复并通过独立哈希复核，其余无高置信度问题 |

## Outcome
- 共 6 类、29 条资料、74 张图：17 条已确认、5 条确认稿派生、7 条待核对。默认只显示前两类，共 22 条。
- 原图来源和哈希：public/art-library/SOURCE.md、sources.json；只复制非 public 来源，已有发布路径直接复用。Sam/Tibo 同名文件使用独立角色前缀。
- 页面沿用静态 UI 导入和 HTML 样式引用；没有更改架构测试断言。纯文字来源使用 source record，避免现有架构扫描器将英文 document 一词误报为 DOM 调用。
- Vite 在容器挂载中未索引新 public 文件，重启现有开发服务后图片正常；没有构建镜像或部署。
- 全量测试发生在初次接线时，修复后只重跑受影响的 architecture/app-mode 共 23 项，不重复无关全量测试。最终类型检查和构建退出码均为 0。
- 浏览器截图：evidence/desktop.jpg、evidence/mobile.jpg。资料页已打开保留。
- 独立 UI 实现、代码审查、验证由三个子代理完成；主代理核对用户指定会话、整理资料并完成集成修正。
- 未重绘原画、替换角色模型、提交、推送或发布。
