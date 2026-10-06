# FIX -- Grassy 呼吸时发梢跟随

## Status: done
## Task: 181
## Related: N/A
## Baseline Commit: 3a35077

## Problem
主角呼吸时头发缺少相对于头部的轻微跟随，显得僵硬。

## Root Cause
`src/render/grassy/grassy-rig.ts` 的现有模型只有人体骨架与眼睑形变；发型、脸和身体共用主体网格，没有独立发骨或发梢形变。

## Fix Plan
- [x] grassy-rig.ts — 加载时只对已确认的头顶发梢与后发局部建立共享 morph，实例保留独立形变权重。
- [x] grassy-animator.ts — 使用呼吸相位并平滑跟随，切换动作后柔和回稳，暂停不漂移。
- 不改变脸部、发根、原GLB、骨架、贴图或模型档位；不扩展Sam/Tibo。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1708 / 1708 通过。
- [x] npm run build -- --outDir /private/tmp/grassy-hair-dist — 通过；保留现有 chunk 大小提示。
- [x] 浏览器检查三档加载、斜前方与侧面发梢、动作切换与暂停。三个档位独立实例互不影响，dt=0 权重不变，切出呼吸后平滑回稳；展示场无控制台错误。
- [x] diff-guard / 子代理审查 — 通过；确认形变区域不包含脸部，原生 morph 与蒙皮、阴影共用。
- [x] Bug is fixed

## Evidence
- `assets/characters/grassy/model-equipped/evidence/hair-breathing/before-after.mp4`：同一共享模型与呼吸动画，左侧关闭发梢形变，右侧启用；包含斜前方与侧面。
- `assets/characters/grassy/model-equipped/evidence/hair-breathing/showcase.png`：角色展示场验收画面。
- 未新增渲染实现细节测试；未提交或推送。
