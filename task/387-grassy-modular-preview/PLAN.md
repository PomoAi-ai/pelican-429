# PLAN -- 男主分件底模接入游戏展示场

## Status: done
## Task: 387
## Related: N/A
## Baseline Commit: d2d72f4

## Goal
将已完成的男主分件静态 GLB 接入游戏现有角色展示场，提供直接打开的地址，并在浏览器中确认实际游戏渲染结果。

## Non-goals
不替换可玩角色及其骨骼，不添加动画、LOD、独立查看器或独立着色器，不修改其他未提交工作。

## Acceptance Criteria
- 角色目录和专用 demo 可加载同一个已验收 GLB。
- 复用游戏共享模型加载、材质、灯光与角色展示场；可切换观察角度和缩放。
- 显示原始 3.1 格高度与独立部件材质，不重新拉伸比例。
- 浏览器实际看到新男主，相关静态检查、测试及构建通过。

## Constraints
- 保留当前工作树已有改动；只修改本次资源注册、目录和资源文件。
- 当前资产是静态高细节底模，不声称具有动作或低面数优化。

## Decisions
- 已由 explorer 子代理完成加载链探索及最小接入设计；不另起重复架构阶段。
- 在 Grassy 配置中单独注册当前换装底模，避免混入历史模型。
- 使用现有 staticModel 分支和共享 loadCharacterModel，无需新增渲染路径。
- 动画角色 UI 需按当前 entry 区分静态/动画，避免读取缺失的 grassyAnimation；保留同卡双向切换。
- 本轮原样预览 2K PBR GLB，不生成新的压缩/LOD 档位；将此原始路径纳入 RELEASE_MODEL_PATHS，保证默认构建后入口也有资源。
- 无需用户裁决的设计分歧或不可逆操作，直接实施。
- 本次为资源注册和目录接入，不新增复述常量/渲染内部实现的测试；用已有测试和浏览器目视验证。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/characters/human/customization/grassy-modular-static.glb | 原样发布本地预览资产 | - | yes |
| 2 | src/config/grassy.ts | 注册当前男主底模类型与路径 | 1 | yes |
| 3 | src/render/grassy/grassy-static.ts | 共享加载器支持新配置项 | 2 | yes |
| 4 | src/config/showcase.ts | 当前角色目录和直接 demo 入口 | 2 | yes |
| 5 | src/ui/showcase-panel.ts | 当前人形静态与动画切换的控制显隐及筛选 | 4 | yes |
| 6 | src/config/web-models.ts | 将原始预览资产包含在常规构建清单 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes：通过 |
| npm test | yes | yes：1878/1878，通过；0 跳过 |
| npm run build | yes | yes：通过，产物包含 19,707,400 字节原始 GLB |
| 浏览器实际渲染、角度切换、截图 | yes | yes：正面、右侧、背面、三分之四；同卡静态→动画→静态切换正常；控制台无警告和错误 |

## Delivery
- 地址：`http://127.0.0.1:5174/?mode=showcase&demo=grassy-modular&textures=original`。
- 实机截图：`output/grassy-modular-preview/game-render.png`；浏览器停留在新版男主。
- 独立代码审查无阻塞问题；公开 GLB 与建模交付文件字节一致。
- 仅接入静态底模检查；骨骼、动作、LOD 和压缩不在本次范围，未提交或推送。
