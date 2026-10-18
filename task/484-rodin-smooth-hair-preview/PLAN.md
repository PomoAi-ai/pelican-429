# PLAN -- Rodin 平滑整头拆分头发预览

## Status: done
## Task: 484
## Related: N/A
## Baseline Commit: c292d188

## Goal
把从 Rodin 完整头部拆出的新头发登记为独立 40 号版本，可在渲染实验和全部头发预览中选择。

## Non-goals
不替换现有头发版本，不改正式游戏默认资源、渲染器或眼睛方案。Blender 拆分与资产修形由主任务制作，不属于本代码跟踪范围。

## Acceptance Criteria
- 新款有独立标识、编号和资源路径，既有版本保留。
- 渲染实验按钮与全部头发预览共享现有目录，使用现有 Rodin 适配与动作。
- 新 GLB 完成发布后可加载，项目规定检查执行完成。

## Constraints
- 仓库已有大量未提交修改；只追加本任务所需目录项和按钮，不恢复或覆盖其他修改。
- 资源遵循既有完整角色、骨骼、动作及材质契约；不把裸头 GLB 直接作为角色加载。

## Decisions
- 探索与设计由当前接入子代理完成，范围已收敛为两个目录文件；不再嵌套派生相同职责代理。
- 使用 `rodin-smooth-extracted`，编号 40，发布到 `public/characters/human/render-lab/d1-outfit-rodin-smooth-extracted-v1.glb`。
- 新资产走现有 Rodin 网格适配，不宣称已具有 Blender 逐束导引数据；不启用会替换脸几何的旧球形眼睛资源。
- `d1-hair-gallery.ts` 从 `render-lab.html` 读取按钮目录，无需重复注册。
- 完整角色基底使用 31 号眼周修复版，只替换 Hair；保留原头、眼睛、身体与全部动作。
- Blender 中完成整头头发分离、后脑覆盖调整、发根贴合及耳周开口收紧，独立原稿与可编辑场景保存在 `rodin-smooth-extracted-01`；每次发布均通过冻结源数据不变断言。
- 对照本轮开始时的文件快照审查新增行，无新增错误兜底、防御分支或无效测试。
- 默认 build 只构建正式主页面；实验页入口由 typecheck 与浏览器实际加载验收，不额外执行复制全部公共资产的 full 构建。
- 这是可逆目录追加，无设计分歧或审批停止条件；目录文字不新增复述实现的测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/d1-lab-hair-catalog.ts | 注册资源、URL 值和 40 号 | — | yes |
| 2 | render-lab.html | 添加带阶段稿说明的头发按钮 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes：通过 |
| npm test | yes | yes：1966 通过，0 失败 |
| npm run build | yes | yes：通过，保留既有大 chunk 提示；prebuild 未改变原材料文档 |
| 浏览器加载新款并检查控制台、正侧面 | yes | 通过：V2 正面、侧面、背面与跑步切换实看，控制台 error 为空；截图已归档 |
