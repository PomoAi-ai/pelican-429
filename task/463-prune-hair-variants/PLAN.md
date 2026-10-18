# PLAN -- 仅保留用户选定头发

## Status: done
## Task: 463
## Related: 462
## Baseline Commit: 64ef4a38

## Goal
保留原编号01、05、13、17、22、31、34、35，共8款；删除其余展示入口、专用发布模型、制作源文件和截图。

## Authorization
用户先明确“其他删除、彻底删除”，随后确认“对一起删除，只保留我保留的”，包含专属Blend、贴图、脚本和截图。共用依赖不能删除；保留编号避免重排混淆。

## Non-goals
不更改保留款造型、材质、动作与文件内容；不清理非头发项目资源和task历史记录。

## Decisions
- 保留05仍需Rodin共用底模；保留D12、眼修复等制作链存在旧版本冻结输入，必须先建立依赖闭包。
- 展示仅8款；仍被保留款使用的输入不作为展示版本，必要时移入制作共享依赖目录。
- 删除前记录保留发布模型哈希，删除后验证未变化。删除清单保存供核对，不额外保留待删文件备份。
- 代码收敛与制作依赖审计由同线程代理分工；根完成实际资源删除与浏览器验证。

## Validation
| Check | Required | Done |
|---|---|---|
| 8款发布资源哈希及制作依赖闭包 | yes | yes |
| 删除清单核验 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器8款及原编号、旋转/风格 | yes | yes |
| core-review | yes | yes |

## Result
- 实际删除7409个文件，20741983040字节（19.32 GiB），含被淘汰版本发布资源、专属制作源、贴图、脚本和旧截图；没有额外创建备份。
- 保留8款发布模型及共用球眼，共9个GLB；全部哈希与删除前一致。6个最终原生Blend哈希一致，图片均已打包，无外部library。
- 31所需冻结输入迁入_shared-inputs/head-body-container.glb，导出脚本引用同步更新；保留制作闭包审计通过。
- npm run typecheck通过；npm test共1960项通过、0失败；npm run build通过（现有大块体积提示）。git diff --check通过。
- 浏览器核对8款原编号、宽屏5列、统一V2/V9、拖动同步旋转；无控制台error。截图output/hair-gallery/retained-eight-v2.png。
- 独立代码审查通过。未提交、推送，未改CI。
