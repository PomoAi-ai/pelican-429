# FIX -- 展示场直接拖动摄像头

## Status: done
## Task: 212
## Related: 206, 209
## Baseline Commit: 8a8fe8c

## Problem
展示场放大后角色离开画面，用户直接拖动无法平移摄像头。

## Root Cause
character-stage-app.ts 的 OrbitControls 禁用旋转，但左键和单指仍映射到默认旋转；只可右键平移，操作不直观。没有重置镜头入口。拖动映射改为平移后还需抑制拖动产生的 click，避免误改场景角度。

## Fix Plan
- [x] 复用 OrbitControls，把左键与单指映射为 PAN，保留双指缩放平移及右键平移。
- [x] 平移后不触发单击切角度，工具栏加入重置镜头，更新手势提示和光标。
- [x] 不新增DOM/three实现细节自动测试，以浏览器实际拖动和重置验收。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器左键拖动上下左右移动、角度不误变、缩放保留平移、重置恢复。

## Results
- 类型检查和构建通过（保留已有500kB chunk提示）。
- 全量1747/1748通过，Sam连续换边战斗用例首次失败；未修改战斗代码或断言，定向showcase.test.ts与boss.test.ts复跑59/59通过。
- 浏览器验证左键上下左右平移、拖后角度不变、单击空白仍能切角、平移后缩放不复位、重置恢复1倍和默认居中。快速飞行控制面板展开时，拖动画面成功把屏外角色移回可见区域。
- 独立子代理按OrbitControls真实事件顺序审查通过，未见新增问题；未新增UI实现细节测试。
- 证据：flight-panned-into-view.png、panned-closeup.png。未执行提交或推送。
