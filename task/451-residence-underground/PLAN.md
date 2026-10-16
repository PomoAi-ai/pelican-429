# PLAN -- 住宅可编辑地下

## Status: done
## Task: 451
## Related: N/A
## Baseline Commit: 64ef4a38

## Goal
住宅地表下增加64层可挖掘、可拆建的真实格子；地表与默认地下格子采用3格加深规格。

## Non-goals
不清空或强制重写旧住宅存档；不扩展其他演示。

## Acceptance Criteria
- 地下逐格拆除、回填、碰撞、禁墙规则正确。
- 地图、镜头、建造坐标包含地下。
- 新住宅保存后挖掘不恢复；旧存档内容不丢失。
- 用共享资源，稀疏记录挖掘，合并碰撞与分区实例化避免15万独立构件。

## Decisions
- 用户确认地下可挖掘可拆建。
- 按dev流程；探索与设计由同一子代理完成，确认现有全构件实现不适合15万块。
- 不需迁移现有存档：地下为新增可选状态，新住宅启用；已有存档保持原有布局。
- 地下默认米黄色方石整砖，表面下半砖，均深3格，左右两块视觉合缝而逻辑逐格独立。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| sim/residence-terrain.ts, sim/residence.ts, config/residence.ts | 稀疏地下、拆建碰撞、尺寸 | done |
| app/residence-save.ts, test/residence.test.ts | 存档及行为验证 | done |
| render/residence-terrain.ts, app/residence-app.ts | 分区显示、命中、更新、地下镜头地图 | done |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | done |
| npm test | yes | done |
| npm run build | yes | done |
| 浏览器挖掘、地下显示与地图 | yes | done |

## Results
- npm run typecheck通过；npm test 1949/1949通过；npm run build通过（已有包体大小提示）。
- 浏览器确认64层地下显示、逐格挖除、地图洞口更新，无console error；短时56–60 FPS。截图evidence/underground.png。
- 子代理审查发现同规格回填合缝问题，已通过恢复默认地下单元修复，并增加往返/再拆行为测试。
- 相机测试覆盖负高度跟随、底部夹紧及回地面；物理测试覆盖64层井底承托。
- 只更新本次地下相关逻辑，保留既有未提交工作；未提交推送。
- 未进行长时间或低端设备压力测试；旧保存住宅不自动扩地下，当前AI住宅演示及新住宅启用。
