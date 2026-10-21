# PLAN -- 按最新 46 精修 47

## Status: done
## Task: 557
## Related: 553
## Baseline Commit: 47a8232a

## Goal
用户要求继续参考 46 完成 47。以本轮最新 46 的实际形体为参考，改进刘海厚度、耳下短发体积与后脑分束，保持头皮贴合。

## Non-goals
不改 46、48、已认可球眼、脸、耳朵、身体、原始动作、共享渲染器及正式游戏默认资源。不提交或推送。

## Acceptance Criteria
- 冻结本轮参考 46 与上轮 47，可追溯及回退。
- 实际检查相同 V2 正、侧、背以及耳侧视角；新 47 不能再停留于上轮偏短、偏薄轮廓。
- 保留足够发量和连续内层，减少大叶缘、整齐锯齿和空洞；局部贴合不能制造毛刺。
- 最终头发静态接触、GLB/源拓扑、非 Hair 数据与球眼冻结检查通过。
- 正式独立渲染和全部头发预览同步更新，真实浏览器验证。

## Decisions
- 复用已完成的源码结构探索、Blender CLI、发布器与独立审计工具，不重复安装或重新设计渲染器。
- 最新 46 仍可能被并发修改，先复制并验证一致快照；本轮只修改 47。
- 模型代理负责构造，探索代理核对参考变化和资产审计，主代理以实际多视图判断视觉效果。
- 已查看最新 46 的 V2 正面、侧面、背面和 45°，以及旧 47 的同镜头对照。46 的薄刘海、较长鬓角、耳下向内收拢的丰满短发作为本轮基准；保留完整覆盖后再弱化后脑上层整齐叶缘。
- 46 冻结于 `draft-latest-reference/reference-46-snapshot`：GLB `96acb37994a4b3b1638616e8b7c4cdabb66f2365d9739ec7f9ff9a658395ba73`，脚本 `3646840cee0b82db706214fedb5c617c294cc5c8180884151a0e01b9c9f2e4bb`。
- 旧 47 已保存到 `revisions/before-latest-reference`，包含 11 个根文件、review 及 SHA256 清单；旧 GLB `3297e9f1b5c07d8431dea0a1d2e3a04c695a8b05c1d606eb094dd039de894495`。
- 实机候选将逐点耳侧避让改为相邻截面平滑位移，扩大转向过渡、渐隐辫尾压发，使耳后针刺消失、横折减弱；中央后束加大斜弯并错开终点。第二候选完整独立审计通过，但正面内层外移形成凸肩，继续仅修耳后绕行路径。下缘发束间隙不作为新增补片的理由。

## Validation
| Check | Required | Done |
| --- | --- | --- |
| 正侧背顶参考与实际 V2 | yes | passed — 正式 V2 正侧背、45°、灰模与顶面检查 |
| 静态接触 / 导出拓扑 / 非 Hair 与球眼不变 | yes | passed — 70,560 顶点、202,855 边无穿入；132,770 有向三角精确相同 |
| 源/public 一致及两入口 | yes | passed — 6086178d…；实际两页显示新版 47 |
| npm run typecheck | yes | passed |
| npm test | yes | passed — 2041 tests / 304 suites, 0 fail |
| npm run build | yes | passed — 现有 chunk 大小提示 |

## Final decisions and outcome
- 最终仅扩大既有最外卷发束中下段的内侧搭接，长缝收掉且未新增补片；视觉复核代理认可可停止该项修改。
- 冻结最终 GLB `6086178db7e7b202a216d8bc95be7cca003b8cf282188b3dc26f3d38d6007ad6`，Blend `6cce904cffe52826ec872d54016b169fed2ac0dcf46b97fb5aac6fb5d2c88749`。精确复制到正式源与 public；源脚本只调整输出名和发布器相对路径。
- 正式入口已检查正侧背、45°、注视向右、完全闭眼及行走中段；无控制台 warning/error。全部头发页的 47 加载成功。
- 探索代理确认最终非 Hair、原动画、球眼 v3 均未变化；静态审计不作为动态全帧或自交证明。
- 本轮未更改 TypeScript、共享渲染或游戏默认资源；仓库其他并发改动保持原样。未提交、未推送。
- 对照图：`evidence/comparison.png`，上排冻结 46，下排最终 47；均为真实 V2 正交网页截图。
- 实际执行：`npm run typecheck`、`npm test`、`npm run build` 均成功；未增加测试。归档保留本轮旧 47 及更早阶段。
- 最终源十张彩色/灰模五视图已刷新并复制正式 review，render-manifest 记录最终输入与图片 hash；未重存 Blend。
