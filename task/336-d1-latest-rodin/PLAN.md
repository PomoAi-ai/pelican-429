# PLAN -- D1 新版 Rodin 模型制作与接入

## Status: validating
## Task: 336
## Related: 333
## Baseline Commit: 975f136

## Goal
完成用户指定的 Rodin 资产 private-source-049 的材质、下载、质量检查与展示场接入。

## Non-goals
不覆盖旧版源文件、GLB 或精修成果，不替换默认主角，不宣称静态模型已经支持骨骼动画或捏人。

## Acceptance Criteria
- 下载保留新版原始模型和贴图，独立输出 PBR、白模 GLB 与质量检查结果。
- 新展示场预设并排展示新版 PBR 与旧版参考校准模型；新版白模可从目录选择。
- 旧预设和旧模型保持可用。
- 运行必要的项目检查并完成浏览器目检，披露几何、材质与动画局限。

## Constraints
保留工作区历史和其他任务的未提交改动；不修改 vendor，不提交推送。

## Decisions
- 复用已有导入、共享模型加载和展示场流程；文件级方案已完整指定，沿用任务 333 的探索结果，跳过重复探索与设计。
- 导入脚本要求通过 Blender 的 `-- --source-id UUID` 显式指定资产；来源目录、报告 ID 与导出文件名使用同一 ID，避免覆盖旧模型。
- 新预设使用 `?mode=showcase&demo=d1-rodin-latest`，旧 `d1-rodin` 预设和默认角色不变。
- 全仓查找未发现 `import_rodin_obj.py` 的脚本调用方；旧精修脚本仍引用原始资产，保持不改。
- 本次配置与视觉接入不新增复述实现的测试。父代理负责下载、运行 Blender、构建与浏览器验收；本地集成子代理执行 typecheck 与全量测试各一次，避免重复执行。
- 有限复核只覆盖本次三个文件的新增改动及共享加载调用关系，按 core-review 与 diff-guard 未发现需修复问题；已有未提交变更不纳入本次结论。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/character_customization/import_rodin_obj.py | 显式来源 ID 与隔离输出 | — | yes |
| 2 | src/config/grassy.ts | 登记新版 PBR 与白模 | 1 | yes |
| 3 | src/config/showcase.ts | 新版与旧参考校准版比较预设 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 下载完整性、模型导入自检与渲染目检 | yes | no |
| npm run typecheck | yes | yes — exit 0；日志 /tmp/d1-latest-typecheck.log |
| npm test | yes | yes — 1830 passed / 0 failed；日志 /tmp/d1-latest-test.log |
| npm run build | yes | no |
| 浏览器展示场及控制台检查 | yes | no |
| 本次编辑 diff 检查 | yes | yes |
