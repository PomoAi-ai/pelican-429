# FIX -- 白色混凝土单房间观感

## Status: done
## Task: 406
## Related: 405
## Baseline Commit: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Problem
运行时白色混凝土发黄发灰，墙脚与家具周围出现大片脏黑噪点，未达到制作图中干净暖白的观感。

## Root Cause
- `src/app/room-scene-preview.ts`：太阳位于建筑背后，默认补光也位于背后，正面缺少中性补光。
- `src/config/lighting-rules.ts`：默认半球地面光偏绿、调色偏黄，建筑检查场景叠加色偏；AO 半径0.9格、强度0.85、采样6/降噪4使白墙接触处大面积灰黑并出现噪点。

## Fix Plan
- [x] `src/app/room-scene-preview.ts` — 单独场景和聚落使用中性前方补光，去除后期黄染；AO半径0.3、强度0.3、采样12/降噪12，保留太阳和追光关系、原始材质、尺寸和碰撞。分层风景维持原配置。
- [x] 保存 `assets/concepts/white-concrete-v1/runtime/room-full-clean-light.jpg`，与原 `room-full.jpg` 同一房间、相同太阳滑杆位置及相同缩放对照。

## Verification
- [x] 浏览器目视核对：墙面恢复暖白，墙脚大块黑斑明显消退；正面、斜视、格线和半透明切换正常，角色可步行进入；控制台无error/warn。
- [x] npm run typecheck：通过。
- [x] npm test：1880项通过，0失败、0跳过，约79秒。
- [x] npm run build：通过，仅有既有大chunk提醒。
- [x] 子代理按core-review和diff-guard定向检查通过，确认参数不修改共享TUNING、不残留到分层场景、不改变太阳能追光关系；git diff --check通过。

## Remaining visual work
本次只修正浅色建筑的灯光与接触阴影，房间仍是结构和材质样板。门、家具、建筑细节以及完整场景美术尚未达到已定原画的精细程度，不据此认定最终场景完成。
