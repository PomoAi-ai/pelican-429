# PLAN -- Grassy 精细静态模型与游戏简化版本

## Status: done
## Task: 030
## Related: 012-grassy-character-cards, 027-fix-doorway-reference
## Baseline Commit: N/A（尚无 HEAD；接入文件起始快照位于 $TMPDIR/grassy-static-baseline）

## Goal
以已确认的四方向图与右侧母版制作真正有体积的精细静态 3D 角色，再从同一模型派生游戏标准版与轻量版，并放入共享角色展示场和实际场景对照。

## Non-goals
不制作动作，不改变既有鹈鹕，不扩展人形玩法，不提交或推送，不修改其他正在进行的片头与场景任务。

## Acceptance Criteria
- 右侧母版 public/characters/human/turnaround-master-v2/right.png 为唯一比例基准；脸、后脑、发束、毛衣、牛仔裤、手与鞋均为立体几何，不用人物或脸部图片平面冒充模型。
- 全部版本脚底为 0、最高发梢为 3.1，静态站姿，保留饱满大头、短颈、红针织毛衣、蓝卷边牛仔裤、米白运动鞋。
- 精细版保存可编辑 .blend、GLB 和实际模型的正面/背面/侧面/三分之四渲染。
- 精细版完成后按部位保留轮廓、减面与合并材质网格，输出两个游戏版本，并记录实际面数、绘制批次和文件大小。
- 展示场与真实场景对照直接复用共享 GLB 加载器、材质和尺寸，可查看三种版本，模型与图片基准可对照。
- 模型造型用真实渲染和浏览器视觉检查；不新增渲染结构断言测试。接入代码完成后运行仓库要求的检查。

## Constraints
- Blender +Z 向上、-Y 向前；导出 glTF Y-up 后朝 +Z，所有实例根缩放为 1。
- 旧动画 GLB 不覆盖；其加载器强制六动作，当前静态交付采用独立共享加载链路。
- 保留现有图片、旧模型与旧构建脚本，新增静态版本与来源记录。

## Decisions
- 三个子代理分别完成架构、头发头脸、身体衣服的探索，架构方案已明确到文件，无需另行重复架构阶段。
- 旧 GLB 约24万三角但比例和曲面质量不足，不能靠增加面数或整体缩放解决。按母版重新分配头部、躯干和腿部长度。
- 采用三档：detailed 精细版、game 游戏标准版、light 游戏轻量版。游戏档初步预算分别约3万至5万和1万至1.8万三角，最终报告实测值。
- 共同地标：鞋底0，下巴约2.08，眼中心约2.38，领口约2.02，毛衣下摆约1.27，裤脚约0.30，最高发梢3.10；游戏展示不另行改变比例。
- 当前范围都是已授权可回退的本地资产及接入工作，没有需要停下确认的问题，设计直接进入实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_grassy/static_head.py、static_hair.py | 有体积的脸、眼、耳与分层发束 | — | yes |
| 2 | scripts/blender_grassy/static_body.py | 连续服装、立体手、分层鞋 | — | yes |
| 3 | scripts/blender_grassy/build_static.py | 材质、整合、源文件、实际渲染与分档导出 | 1,2 | yes |
| 4 | public/characters/human/models/、assets/characters/grassy/model-static/ | 三档 GLB、Blend 与实际渲染 | 3 | yes |
| 5 | src/render/grassy/grassy-static.ts、src/config/grassy.ts | 三档共享配置、加载与实例化 | — | yes |
| 6 | src/app/showcase/human-session.ts、src/app/showcase-app.ts、src/config/showcase.ts、src/config/character-assets.ts | 静态三档目录和视角复用；人形卡隐藏动作控制 | 5 | yes |
| 7 | assets/characters/grassy/static-model-scene.html | 真实渔屋/鹈鹕中的三档模型、视角、原画对照与导出统计 | 4,5 | yes |
| 8 | public/characters/human/SOURCE.md | 当前模型来源、尺寸、版本统计与使用方式 | 4,6,7 | yes |

## Validation
| Command / Check | Required | Done |
|---|---|---|
| Blender 实际正交与三分之四渲染，参考轮廓对照 | yes | yes — 三档共12张真实渲染；检查头脸、后脑、衣裤、卷边与鞋子。三维重建的具体还原度仍由用户视觉评价 |
| GLB 实际统计与三档均3.1格 | yes | yes — 最终完成标记后直接解析GLB实际顶点及节点变换；精细/游戏/轻量分别1,004,958/44,295/18,739三角，每档24材质/24 primitive，高度3.1、脚底0（浮点误差小于0.000001），无动作及Studio/其他LOD，与manifest一致；结果 $TMPDIR/grassy-static-glb-verification.json |
| 浏览器三档展示、转向、游戏场景同地面对照 | yes | yes — 展示场加载三档并切换版本/侧面；场景检查精细正面、游戏侧面、轻量背面、门前近景/游戏视距及原画对照；截图 assets/characters/grassy/model-static/in-scene.png |
| npm run typecheck | yes | yes — exit 0；完整日志 $TMPDIR/grassy-static-typecheck.log |
| npm test | yes | yes — 1485/1485 通过，303 suites，34.67s；完整日志 $TMPDIR/grassy-static-test.log |
| npm run build | yes | yes — exit 0，314 modules，1.61s；仅现有大于500 kB的chunk提醒，完整日志 $TMPDIR/grassy-static-build.log |

### 接入代码独立复核与定向复验
- core-review + diff-guard 只读复核曾发现跨页面导航残留场景 demo 参数：从带 compositions 等 demo 的场景展示页面进入角色展示场会误读演示目录并报错。已在 src/main.ts 构造导航时清除非 showcase 页面来源的 demo，角色展示场自身合法 demo 保留。
- 浏览器定向复验确认旧链接 /?mode=showcase&demo=compositions 已变为 /?mode=showcase；独立代码复核确认修复位于参数跨页面传递处，没有静默忽略未知角色演示。
- 导航改动后补跑 npm run typecheck 和 npm run build 均通过；build 为314 modules、548ms，仅原有chunk体积提醒。日志 $TMPDIR/grassy-static-typecheck-after-navigation.log 与 $TMPDIR/grassy-static-build-after-navigation.log。全量测试沿用上表已通过结果，不重复执行。
- 最终代码复核结论：Approved。共享资产加载/释放、多档切换、静态控制、调用方兼容与共享尺寸/材质未发现其他达到80%置信度的实际问题；模型形态和视觉验收由对应步骤继续完成。

## Final Result
- 精细源与三档资产全部完成，静态无骨骼动作；高模1,004,958三角（28.00 MiB）、游戏标准44,295（1.40 MiB）、轻量18,739（0.69 MiB）。三档各24材质网格，直接复用共享加载器。
- 高度按实际网格顶点归一，避免眉毛曲线的控制点包围盒高估可见高度；精细源、GLB与简化版本均3.1格。游戏版省去微小肩缝，卷边独立保留预算；轻量版实际约1.9万三角是为保留裤脚轮廓作出的调整。
- 人形目录显示“3个模型”；三档演示默认收起图片资源，优先显示实时模型，17张参考及渲染仍可展开查看。
- 最后UI调整后npm run typecheck通过，并完成npm run build复验（1.27s；日志 $TMPDIR/grassy-static-build-final.log），只有既有chunk体积提醒；没有新增测试、自动渲染断言或CI测试。
- 已检查相关改动，保留其他任务的代码；未提交/推送。模型具体还原度供用户在实际转向与场景中继续评审，不以面数或命令通过替代造型评价。
