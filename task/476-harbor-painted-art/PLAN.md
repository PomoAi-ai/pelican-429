# PLAN -- ImageGen 绘制的横版河岸城市

## Status: implementing
## Task: 476
## Related: 475
## Baseline Commit: c292d188

## Goal
用 ImageGen 真实绘制的美术替换独立 harbor 关卡的程序楼群，接入可游玩的横版场景，按用户参考图统一建筑、光色、层次与细节。

## Non-goals
不修改住宅、原透视演示或其资源，不新增玩法、依赖或 CI，不提交推送，不重启 Docker。

## Acceptance Criteria
- 新绘制近、中、远三层楼群、天空与近岸步道，资源保存仓库并被游戏实际加载。
- 正面横版镜头与 XY 玩法保留，环境继续采用 -7/-16/-35/-70/-140 分层与自然视差。
- 各层透明轮廓干净，楼体具有绘制的立面、侧面、屋顶和材质细节；楼只在干岸上。
- 中央主塔不随横向重复出现；横向延展不拉伸美术，不出现明显硬接缝。
- 实机验收构图、颜色、倒影和横移；类型、全量测试与构建通过。

## Decisions
- 后续按用户认可构图接入与完整验证由 task/488-harbor-approved-vehicles/PLAN.md 完成；本文件记录的是此前版本，不作为当前运行时资源清单。
- 用户明确拒绝当前运行时效果，不能以类型检查或素材已接入判为美术完成。当前实现尚未验收。
- 实机截图确认：楼群密且层间对比接近，深色岸基和桥遮河，近岸重复花坛与岩石地面风格不统一。证据：evidence/rejected-wide.png。
- 已用内置 ImageGen 重绘完整白日构图，统一河面留白、三组建筑主次、蓝白空气层次与近岸材质，保存 assets/scenes/harbor-painted-v1/direction/harbor-daylight-keyframe.png；完整提示词见同目录 PROMPT.md。
- 用户认可新的完整构图（“这张就很合理了”），要求加强未来感、移除远山换成房屋，随后补充无人机与轨道列车。
- 已定点编辑原稿并保存 direction/harbor-daylight-future-keyframe.png：远山换为淡蓝远城，增加空中花园与连廊、5架不同景深无人机、对岸轻轨列车；保留水面留白和角色岸台。提示词见 direction/FUTURE-PROMPT.md。
- 新图当前仍为美术构图稿，尚未拆层替换进游戏；运行时接入与最终验证仍未完成。
- 使用内置 imagegen，参考用户第1与第5张图，只参考美术，不复制纵深城市镜头。
- 已生成5张图并无修改复制到 public/scenes/harbor-painted-v1/；PNG尺寸及alpha已检查，四张前景资源是真RGBA透明。
- 子代理确认已绘光照的图片采用sRGB与无额外PBR/距离雾，避免二次压灰；已有Reflector直接反射画层，不叠假倒影。
- 读PNG像素确认极少数彩色边缘主要位于alpha<.5，画层以alphaTest=.5去掉透明边污染，不改原图像素。
- 中央原画只放一次，两侧取无主塔片段交替镜像续接，保持原比例且接边像素一致。
- 现有桥、水面、载具、角色和物理继续复用；只替换独立场景美术，不新增渲染细节测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| public/scenes/harbor-painted-v1/*.png | 保存五张ImageGen原画 | yes |
| assets/scenes/harbor-painted-v1/PROMPTS.md | 提示词、参考角色与原图出处 | no |
| src/config/harbor-painted.ts | 共用绘制资源清单 | yes |
| vite.config.ts | 正式资源包包含五张绘制图 | yes |
| src/render/harbor-side-scene.ts | 分层原画、接边、动态反射与交通 | no |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm --ignore-scripts run build | yes | no |
| 浏览器默认/横移/窄屏与控制台 | yes | no |
| 子代理审查 | yes | no |
