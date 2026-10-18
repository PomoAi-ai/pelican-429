# PLAN -- 独立滨水城市透视场景

## Status: done
## Task: 468
## Related: N/A
## Baseline Commit: c292d188

## Goal
独立制作能观察真实透视与视差的滨水未来城场景；近处和远处均有轨道电车与飞行器，水面下方延伸，多层景致遮挡形成置身城市的感觉。

## Non-goals
不替换住宅或已有天际线，不改其他会话的文件，不提交或推送。

## Acceptance Criteria
- 独立页面、独立开发端口与构建入口，原场景无需改动。
- 使用透视相机、真实 Z 层距与可移动镜头；近、中、远处均有可见城市内容。
- 复用现有城市构件、载具模型、游戏水材质与图片，不复制原场景实现。
- 浏览器检查默认构图、移动视差、近远电车和飞行器、水面与控制台错误。

## Constraints
- 工作区已有大量其他会话的改动，仅新增本任务文件。
- 不重启现有服务，不操作现有 Blender 会话，不发起跨会话通信。
- 渲染、动画与 UI 采用浏览器人工验收，不新增自动测试。

## Decisions
- 已只读核对用户指定 Claude 会话与附件，目标以第 02 张原画和最后的近远交通要求为准。
- 独立 HTML、app、render、CSS 与 Vite 配置，复用共享资源 API；独立页面不接入现有目录，避免修改共享入口。
- 新场景无需持久化、外部操作或不可逆变更，无需暂停审批。
- explorer 子代理完成目标与架构核对；最终港湾仅需水平水面，直接复用 createWaterMaterials 与游戏水面 shader，使用港湾网格和晚霞色板，避免建立无玩法用途的流体模拟。
- 使用独立 WebGLRenderer，避免受现有宿主和后期的并行改动影响；图片清单同时供渲染和独立构建复用。
- 仅新增本任务文件，构建输出放在已忽略的 dist/harbor/；开发服务 5186，原有 5174 服务未重启。
- reviewer 子代理发现 pagehide 对浏览器往返缓存不兼容；已仅在非缓存离开时释放，并通过离开/后退验证画面与交互。
- 全仓 typecheck 的 3 项错误均在未修改的 ai-city-environment.ts:355、356、479，与只读会话中的并行开发相符；保留原文件，新增独立 tsconfig.harbor.json 验证本场景完整依赖树。
- 主构建使用 npm --ignore-scripts run build，跳过会重写共享资源文档的 prebuild；Vite 主构建成功，保持其他会话文档不受生成器影响。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/harbor-perspective.ts | 分层城市场景、共享资源实例与交通动画 | — | yes |
| 2 | src/app/harbor-perspective.ts | 独立相机、交互、加载和释放 | 1 | yes |
| 3 | src/ui/harbor-perspective.css | 全屏场景与轻量观察控制 | — | yes |
| 4 | harbor-perspective.html | 独立页面入口 | 2,3 | yes |
| 5 | vite.harbor.config.ts | 独立开发/构建配置与所需资源 | 4 | yes |
| 6 | src/config/harbor-perspective.ts | 共用图片清单与场景摆放配置 | — | yes |
| 7 | tsconfig.harbor.json | 独立检查场景及共享依赖类型 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | no（无关文件阻断） | 已执行：ai-city-environment.ts 有 3 项既有并行修改错误 |
| ./node_modules/.bin/tsc --noEmit -p tsconfig.harbor.json | yes | yes：成功 |
| npm test | yes | yes：1960 通过，0 失败 |
| npm --ignore-scripts run build | yes | yes：成功 |
| ./node_modules/.bin/vite build --config vite.harbor.config.ts | yes | yes：成功 |
| 浏览器检查默认视图、镜头移动、交通、水面、错误、往返恢复 | yes | yes：画面与控件正常，控制台无错误或警告；evidence/ 保存 4 张截图 |
