# PLAN -- 屏幕外实体视图剔除

## Status: done
## Task: 532
## Related: 531
## Baseline Commit: a13fdd68（工作区含未提交改动，快照 `git stash create` = 8b384370）

## Goal
原野场景里所有敌人（实测 252 个：watchWasp 119、gatekeeper 49、lineHound 48、loadmaster 36）的模型视图常驻场景且可见，
共约 8600 个 SkinnedMesh、9200 个投影网格、1.76 万节点；three 每帧对全场景做 updateMatrixWorld、主视图 projectObject 与阴影 renderObject 遍历。
远离镜头的实体视图不参与渲染与动画更新，把 CPU 渲染提交降下来。

## Non-goals
- 不改模拟层（敌人 AI、碰撞、生成照常全图运行）。
- 不改模型、材质、动画内容与画面。
- 其他优化项（植被图集、阴影缓存、光照图等）另开任务。

## Acceptance Criteria
- 镜头可视范围（含边距）外的实体视图不在场景图里参与遍历，也不做逐帧动画/骨骼更新；进入范围时画面与现在一致（姿态、朝向、动画相位不跳变到明显错误状态）。
- forest 高画质基准：CPU render 段较基线（11.5 ms）明显下降；画面人工验收无实体凭空闪现。
- typecheck、全量测试、build 通过。

## Constraints
- 工作区有用户未提交的改动，只增量修改。
- 遵守 AGENTS.md：渲染层规则、无防御式兜底、不为将来预留抽象、渲染不写自动测试；纯逻辑（如范围判定）有分支时可在同主题测试文件加用例。

## Decisions
- 证据（2026-10-19，forest 高画质基准页实测）：临时把 252 个 `enemy-*` 根节点移出场景，`renderer.render` 每帧 CPU 从 13.3-18.3 ms 降到 6.75 ms；CPU 剖析中 WebGLShadowMap.renderObject 自身占 19.7%、drawElements 8.7%、GL 命令发送 18%。
- 跳过独立 explorer：问题定位已由实测完成，architect 直接读相关代码出设计。
- architect 子代理因 API 额度中断，由主持人直接读代码设计并实现（改动集中在 view-registry 一处，无方案分歧）。
- 方案：`ViewRegistry.sync` 增加可选 `view`（镜头可视矩形）；只对四类敌人剔除；范围外 `removeFromParent` 并跳过 sync（不用 visible=false：three 的 updateMatrixWorld 不跳过不可见子树，阴影遍历也要走父节点）；移入边距 4 格、移出再多 4 格滞回；挂回后再 sync（敌人视图 sync 用父节点换算注视点）。帧循环、场景版原野（tile-scene）、机房环境三处传入可视矩形，其余调用方不剔除。
- 同任务追加：敌人克隆后合并骨骼与逆绑定相同的 Skeleton（glTF 每个蒙皮网格一套、SkeletonUtils.clone 再逐网格复制），常驻纹理 7904 → 568。
- 同任务追加（基准工具修正）：forest 基准改为按帧号沿地面安置玩家，避免沿途敌人击退/硬直导致路径分岔（实测原写法主角被打到 11 血原地不动）。
- 结果（forest 高画质基准）：CPU 18.9 → 9.4 ms（render 11.5 → 5.4，light 2.8 → 0.35），场景节点 17633 → 3235，draw 629 → 429。GPU 段本轮受用户同时打开的其他游戏页面争用，数值不可比，未作结论。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/view-registry.ts | sync 可选可视矩形；四类敌人范围外移出场景、滞回 | — | ✓ |
| 2 | src/app/frame-loop.ts | 传 `cameraRig.visibleRect()` | 1 | ✓ |
| 3 | src/app/tile-scene.ts | 传场景版可视矩形 | 1 | ✓ |
| 4 | src/app/facility-environment.ts | 传机房可视矩形 | 1 | ✓ |
| 5 | test/render-integration.test.ts | 剔除与滞回用例 | 1 | ✓ |
| 6 | src/render/enemy-rig.ts | 克隆后合并相同 Skeleton | — | ✓ |
| 7 | src/app/bench.ts | forest 按帧号沿地面推进 | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2033/2033） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：forest 基准 + 截图确认敌人渲染正常 | yes | ✓ |
