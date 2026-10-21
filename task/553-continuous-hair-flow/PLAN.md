# PLAN -- 头发分束与头皮贴合精修

## Status: done
## Task: 553
## Related: 552, 549
## Baseline Commit: 47a8232a

## Goal
继续精修 47 的头皮贴合与正侧后造型。用户明确指定借鉴 46 的分层刘海、编辫与耳后组织，保留阶段版本，在实际渲染中检查结果。

## Non-goals
不修改已认可的眼睛、脸、耳朵、身体、动作、共享渲染器、正式游戏默认资源或其他发型。不提交或推送。不宣称本阶段已完成原画定稿或独立头发物理。

## Decisions
- 用户确认参考款为 46 `procedural-braid`。按原画边线组织宽根叠压刘海、侧视厚度、耳后内衬及上下层后发，显式记录借鉴来源。
- 参考锁定为 46 的 GLB `02733a2e5e07c4e8b45184c2f487d83d22c15b4fbdf3a9f6f1582090847dd125`、构建脚本 `f1c726f9f159dfeea8f38cd0ea04dfd8e2d12bdcf18db2d206bee1d9fe9306b2`。46 在本轮期间另有并发更新，本任务未改其文件，旧对照与穿插基线不能代表之后的 46。
- 47 连续软块阶段完整归档，最终采用参考分束方案。保留原脚本实际的 7 束上层和 11 束下层覆盖，局部调整厚度、尾长、间距与耳下外翻位置；稀疏减束首稿未发布。
- 耳部采用完整截面外距修正、局部外侧包络和自适应细分。最终显式三角化后检查所有边，不把顶点在外当作整片网格无穿插。
- 71 条导引保留合法运行元数据，所有发束刚性绑定 head。它们是可编辑参考路径，单独编辑曲线不会实时重建网格；没有新增发梢动力学。
- 本阶段使用 Blender CLI 与已有共享发布器，不需额外付费工具。此前使用 Hair Tool 的连续体实验源仍在快照中，不混称当前两股辫为三股辫。
- 页面 47 标签更新为“Blender · 原画分束与贴头短发”，全部头发预览复用该标题；没有修改其他 UI 逻辑。
- 保留连续体、旧 B 与候选修订快照；只同步当前已审查 47 源及对应 public GLB。

## Deliverables
| File | Result |
| --- | --- |
| assets/.../scalp-flow-bob-01/build_hair.py | 当前唯一重建入口，Python 语法解析通过；重建不自动发布 public |
| assets/.../scalp-flow-bob-01/D1-Scalp-Flow-Bob.blend | 审核源，SHA256 d5f42e09477b5ac143b0d69d74a443376e51a97433f85f6aa3fdc76da5b02419 |
| assets/.../scalp-flow-bob-01/d1-outfit-blender-scalp-flow-v1.glb | 24,655,516 bytes，SHA256 3297e9f1b5c07d8431dea0a1d2e3a04c695a8b05c1d606eb094dd039de894495 |
| public/characters/human/render-lab/d1-outfit-blender-scalp-flow-v1.glb | 与审核源 GLB 哈希相同 |
| assets/.../scalp-flow-bob-01/revisions/ | 连续发体 checkpoint 与旧 B 完整保留，失败首稿另在 draft-reference-guided/revisions |
| evidence/guided-published-three-view.png | 正式 5184 页面 V2 正/侧/背实际截图板 |
| evidence/guided-final-*.json | 独立接触、资产及精确拓扑核验 |

## Validation
| Check | Result |
| --- | --- |
| Blender 源/GLB | 65,431 顶点，123,180 个三角，188,142 条非退化三角边 |
| 原 Head 与球眼 socket 静态接触 | 两套均深负点 0、多射线多数内部点 0、穿头边 0；最小有符号距约 +0.002997 / +0.002976 |
| 导出拓扑 | blend 全为三角，GLB 与源的有向三角 float32 坐标多重集合完全一致；覆盖导出对角线 |
| 资源保留 | 非 Hair 二进制、节点、材质、骨架与动作未变；球眼 v3 SHA256 57a143e66dc653636b370a770b4d8fc8f92842250806c8f0abcf0d9c1677998b 未变 |
| 实际 V2 | 正、侧、背、45°、向右注视、闭眼、walk 中段检查；无新增可见脱头或折皱，控制台无 warning/error |
| 正式两入口 | 独立渲染与全部头发预览均加载新 47，编号/名称正确；图库 47 加载完成，无 warning/error |
| npm run typecheck | passed；最终标签修改后复跑通过 |
| npm test | 2041 tests / 304 suites passed，0 failed；本轮已执行，后续仅资产和文案变更未重复全量测试 |
| npm run build | passed；正式资产同步后复跑通过，已有大 chunk 提示 |

## Remaining artistic limits
后脑上层仍有偏叶状边缘，下部短卷与原画的精细层级有差距。这是已交付的阶段稿，不能称完全还原或优于正在继续修改的 46。静态接触审计不代表头发自碰撞、所有三角面互穿或所有动画时刻的证明。当前主体随 head 整体运动，没有独立发梢物理。

## Scope review
工作树还有其他任务的 46/48、页面与住宅相关改动，均未回滚或代改。本任务改动限于 47 源目录/公共资产、47 的单行名称以及本记录与证据。临时 5186 代理已停止，保留 5184 开发服务器；未提交或推送。
