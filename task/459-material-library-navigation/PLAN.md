# PLAN -- 材料与构件库三级目录

## Status: done
## Task: 459
## Related: N/A
## Baseline Commit: c292d188

## Goal
- 基础概念左侧独立一级“材料与构件库”，二级按块、墙、窗、门、平台、家具、功能设备、植物与盆栽、灯具、建筑装饰分类，三级列具体资源。
- 形状、尺寸、朝向等变体留在资源正文；目录与 HTTP Markdown 同源。
- 完成搜索、祖先保留、定位、高亮、深链接与窄屏支持，保留原章节链接。

## Non-goals
- 不改游戏资源、模型、光照或住宅布局，不扩充未实现的材料。

## Acceptance Criteria
- 材料库不再挂在资源基础下，无第四级导航；原有材料与全部变体保留。
- 三级资源可直接定位，中文 hash、刷新、前进后退正常；搜索保留类别和库。
- 原材料库链接仍可访问；Markdown 生成后不丢失既有尺寸/规则/光照说明。
- 宽屏与窄屏浏览器验收；类型检查、全量测试、构建通过。

## Constraints
- 保留工作区既有改动；修改前相关文件备份到 /tmp/pelican-material-toc-baseline。
- 使用当前 Docker 挂载开发服务，不新开本机 Vite、不构建 Docker 镜像、不提交推送。

## Decisions
- 发现/探索已由前两轮源码核查与子代理完成，用户已确认最终三级方案，直接进入实施。
- 按共享资源注册表生成类别和具体资源 Markdown；网页读取渲染后的标题生成导航，复用现有 marked 与锚点。
- UI 变动在浏览器验收，不添加源码字符串或 DOM 实现细节测试。
- 材料库共 10 类、36 个具体资源、341 个形态；生成时庭院短灯半径随已有共享配置同步为 4.5，其余资源表行与修改前一致。
- 审查修正：仅材料库旧章节别名加文档前缀，保留其他文档显式锚点；提高 hidden 样式优先级；阅读高亮线按标题实际定位间距调整。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/build-material-library.ts | 分类、具体资源分组、旧锚点 | — | yes |
| 2 | public/concepts/material-library.md | 同源生成文档 | 1 | yes |
| 3 | src/ui/concept-documents.ts | 材料库一级分组与正文顺序 | — | yes |
| 4 | src/ui/concept-page.ts | 从材料库标题构建三级导航 | 1,3 | yes |
| 5 | src/ui/concept-toc.ts | 中文锚点、层级搜索与高亮 | 4 | yes |
| 6 | src/ui/concept-markdown.ts | 旧标题锚点命名空间 | 1 | yes |
| 7 | src/ui/site-pages.css | 类别展开与三级排版、窄屏 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1958 通过，0 失败/跳过 |
| npm run build | yes | yes：保留已有 character-model 大于 500 kB 提示 |
| 浏览器：层级、搜索、定位、旧链接、前进后退、窄屏 | yes | yes |

## Results
- 36 个资源目录链接实际跳转到对应标题；九种块、墙窗、平台和家具逐项/抽样检查稳定后的高亮。过快批量点击时需等待浏览器帧，避免把上一帧高亮误判为结果；期间一次 Vite 热更新后重新检查。
- 搜索“岩板”“庭院”和库名，保留相应类别祖先；平台与椅子之间前进/后退、中文资源地址刷新定位通过。
- 原“墙与通行”别名与其他文档 platform-mounts 均定位成功。
- 390×844 窄屏：三级目录抽屉、搜索、选择后关闭通过，测试后重置视口；桌面截图见 evidence/material-library-desktop.png。
- HTTP Markdown 返回 200、text/plain; charset=utf-8，响应内容与本地生成文件逐字一致。
- 子代理分别完成文档生成/341 行完整性核对、只读审查及修正复核、类型检查/全量测试/构建。没有剩余审查问题。
- UI 最终阅读线调整后补跑类型检查和构建；未改逻辑模块，不重复全量游戏测试。
- 无提交、推送、Docker 镜像构建或部署。
