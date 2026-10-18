# FIX -- 游戏头发对照使用原生镜头与人物旋转

## Status: verifying
## Task: 469
## Related: 467
## Baseline Commit: c292d188

## Problem
模型与着色器一致、展示profile一致后，游戏与头发预览仍有明显明暗与高光差别。

## Root Cause
原展示场固定镜头转动人物，gallery却绕人物转相机；方卡重新计算太阳方向，未启动idle，近距离头部透视改变了shader视线项。
原生createD1Rig与经过Lab恢复的原生材质，在同一镜头下262144像素差异0，排除Lab材质污染。
两个服务实际精细版GLB SHA256均b518f6908f2fb4b0fcea8ffae5c3d446cc6fb69b39f42f86edd1bba6a3c8fa90。

## Fix Plan
- [x] 游戏环境固定正式全身镜头、转人物，以viewOffset裁出头部，保留原生视线高光。
- [x] 太阳以共享舞台尺寸计算，不随卡片尺寸变化；gallery冻结在idle首帧。

## Verification
- [x] 同镜头原生与Lab像素对照
- [ ] npm run typecheck
- [ ] npm test
- [x] npm run build
- [x] 浏览器九款/旋转/棚光切换
- [x] 独立审查

## Result
- 初始原生/实验材质相同条件262144像素差异0；最终独立正式舞台 vs 修正后的总览裁切对照，512×512只有3个边缘像素不同，平均通道差0.0001220703125，max18。证据output/hair-gallery/native-diagnostic/proof.png，页面同目录index.html。
- 共享characterStageFraming抽出正式原公式，game helper使用单D1最小布局5×5与源画布aspect；固定源camera并裁切，不再猜测全身视距。纯yaw转人物、idle首帧、near/far一致。
- 独立审查通过；浏览器九款/旋转/游戏棚光往返通过，未见console error，已将38号滚入视野并保存侧面截图。
- npm run build通过。node --test test/character-model.test.ts 7/7通过。
- 全仓npm test为1959通过、1失败：未修改的新增harbor-perspective.ts导入CSS触发architecture规则。
- 全仓typecheck报未修改的ai-city-environment.ts:355、356、479函数调用缺参。未修改这些并发任务文件，保留verifying记录，不能声称全仓检查通过。
- 未提交推送。基准是单D1默认视距；任意多角色布局和stageZoom的镜头仍需指定同条件对照。
