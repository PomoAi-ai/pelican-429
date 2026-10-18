# PLAN — 飞行车材质、可开舱罩与展示动作

## Status: done
## Task: 508
## Related: 501
## Baseline Commit: c292d188

## Goal
保留侧面主稿比例，改善白漆、金属、灯带和透明玻璃；面罩可开，三轮固定外露且滚动；角色展示场直接使用游戏模型查看静止、起飞、前进、地面滚动和开舱动作。

## Non-goals
不调用收费第三方建模服务，不改变港口路线和玩家承载规则，不提交或推送。

## Acceptance Criteria
- 玻璃、舱内、灯组和三轮机构有可见细节，尾喷及舱罩独立可动。
- 游戏与角色展示场使用同一 GLB、材质与动画函数。
- 展示支持五种动作、暂停/重播/速度和角度观察，并能与现有格子标尺对照。
- 类型检查、全量测试和构建通过；浏览器检查动作与外观。

## Decisions
- 子代理已探索角色展示场，复用 catalog、StageActor 和现有动作菜单，不新建展示系统。
- 形状沿用501侧面主参考，新增后铰链舱罩和真实舱内；三轮是一个前轮加左右后轮，展示支撑布局，不作工程稳定性认证。
- 直接精修可编辑 Blender 模型，保证关节及尺寸可控；无需额外建模服务。
- 架构设计沿用探索提供的最小方案；没有需用户裁决的分歧或不可逆操作，直接实施。
- 浏览器实测后修正：灯组逐点射线贴壳，浅烟灰玻璃减轻双层透射染色，玻璃不再向座舱投射实心阴影；检视俯仰采用保守包络补高，零俯仰仍三轮贴地。
- 可动模型仍用于港口；展示场编排五种动作，港口NPC飞行时保持面罩关闭。面罩开启、地滚是展示动作，并非新增玩家驾驶操作。
- 子代理独立复核共享API、关节层级、轮轴与尾喷方向，未发现高置信新增问题。未增加渲染细节测试。

## Implementation Map
| 文件 | 内容 | Done |
|---|---|---|
| assets/vehicles/white-vtol/build_model.py / GLB / 预览 | 材质、舱罩铰链、内饰及轮组 | yes |
| src/render/flying-roadster-view.ts | 游戏与展示共享机械和喷流动画 | yes |
| src/config/showcase.ts / src/config/character-assets.ts / src/app/showcase/* | 飞行车目录、图片资料与五种动作 | yes |
| src/app/character-stage-app.ts / src/ui/character-stage-panel.ts / src/ui/model-camera-controls.ts | 生命周期、格子尺及俯仰观察 | yes |
| src/ui/character-assets.ts / vite.config.ts / public/models/white-vtol/SOURCE.md | 来源及发布资源清单 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1993/1993 |
| npm run build | yes | yes — 既有大chunk提示 |
| node --test test/showcase.test.ts | yes | yes — 34/34 |
| Blender渲染与浏览器动作检查 | yes | yes |

## Evidence and Limits
- evidence/ 包含命令日志、关闭/打开面罩、起飞、前进、滚动及港口截图。浏览器实测0.25倍速、暂停后进度不变、重播复位、格子尺开关、侧面/背面及俯仰观察。
- 最终GLB与dist内文件SHA256均为 ea105b82dc088f418423f008fe9f0aab4c80579aca151cbf800e93d917e57c3a，目录缩略图哈希也一致。
- 标准发行包本来不开放角色展示场；验收使用独立本地开发预览5193，关闭HMR。游戏入口同一模型加载成功，控制台无错误。
- 当前港口住宅完整场景测试约5 FPS，未做性能归因或专项优化；没有宣称本次材质更新改善整场帧率。未重复人工登车，已有承载测试包含在全量测试内。
- 中途其他并行修改曾使transit-app类型检查失败，未介入；对方改完后最终类型检查通过。
- 未调用外部建模服务，未提交、推送或部署；未修改其他会话的未提交工作。
