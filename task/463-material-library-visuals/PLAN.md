# PLAN -- 材料库简明形态与真实材质资源

## Status: done
## Task: 463
## Related: 459
## Baseline Commit: c292d188

## Goal
将材料与构件库每项的形态改为简明表格，实际贴图和材质外观直接可见。

## Non-goals
不修改游戏材质、光照、建造行为；不新增材料；不改变已确定的三级目录。

## Acceptance Criteria
- 保留“材料与构件库 → 类别 → 具体资源”的导航。
- 形态表仅展示支持的形态；公共尺寸和规则只说明一次，不逐行重复全名与内部 ID。
- 显示真实游戏工厂生成的资源预览；自然材质显示实际纹理，程序材质准确标为表面预览。
- 图片有同源 HTTP 地址，Markdown 和网页共用同一份图文。
- 浏览器验证桌面和窄屏，完成项目要求的交付检查。

## Constraints
复用游戏工厂和已有缩略图渲染器，无新依赖。保留工作区已有改动，不提交、不推送。

## Decisions
- 延用上一任务对导航和 Markdown 的探索，不重做导航设计；本轮子代理补充纹理来源核验。
- 资源图使用共享工厂导出 PNG 文档快照，避免资料页为每项保留 WebGL 渲染器；材质或模型变化后重新导出。
- 自然块导出 generateTileTextures 的真实色彩图；建筑材质无独立贴图，展示实际程序材质表面并标明。
- 用户已明确简化方向，无需要再次确认的方案分歧。UI 改动以浏览器验收，不新增重复实现的测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/build-material-library.ts | 简明形态表、资源图片与说明 | — | yes |
| 2 | scripts/export-material-previews.ts | 复用工厂导出真实资源与纹理快照 | — | yes |
| 3 | src/render/resource-thumbnail.ts | 支持文档预览的输出分辨率 | — | yes |
| 4 | public/concepts/material-library.md、material-previews/ | 同源图文资源 | 1,2,3 | yes |
| 5 | src/ui/site-pages.css | 紧凑资源图布局及窄屏展示 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器桌面与窄屏、Markdown/图片 HTTP | yes | yes |
| 子代理代码与资源覆盖复核 | yes | yes |

## Results
- 36 个资源族保留，9 种块各 33 个形态归成 7 行支持表；341 个已登记形态没有遗漏。
- 导出 46 张 PNG：36 张构件图、4 张程序材质表面图、6 张自然色彩图；Markdown 引用 47 次（草地与泥土共用 dirt）。
- 子代理只读复核通过：分组、导航标题、规则保留、资源来源、图片引用、RGBA 翻转及渲染器释放均无问题。
- npm run typecheck 通过；npm test 1960 项 / 301 套件通过，0 失败和跳过；npm run build 通过。仅有既有 character-model 755.02 kB 分包警告。
- 浏览器验收桌面与 390×844 窄屏，图片正确显示，页面无横向溢出；36 项资源目录仍可定位，浏览器无错误日志。
- 同源 Markdown HTTP 200，text/plain; charset=utf-8；46 个 PNG HTTP 200。6 张自然色彩图解码后与生成器数据逐像素一致（包含上下翻转）。
- 资料图片为静态快照，材质或模型改动后需重导；维护方式已写进正文折叠说明。
- 未修改游戏材质或建造行为，未提交、推送或变更 Docker 环境。

## Evidence
- evidence/alloy-desktop.png
- evidence/grass-desktop.png
- evidence/grass-mobile.png
- 检查日志：/tmp/pelican-material-visual-{typecheck,test,build}.log
