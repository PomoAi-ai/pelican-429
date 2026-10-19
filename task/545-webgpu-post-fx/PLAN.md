# PLAN -- WebGPU 第四批：后期、GPU 计时与动态分辨率

## Status: done
## Task: 545
## Related: 542, 543, 544
## Baseline Commit: a13fdd68

## Goal
在 ?renderer=webgpu 下用 TSL PostProcessing 实现与 WebGL 一致的后期链（GTAO、Bloom、调色含暗角/色温/饱和/对比、SMAA 与 MSAA 切换、地面反射、引力透镜、renderTexture），接入 WebGPU 时间戳计时，使性能面板与动态分辨率在 WebGPU 下工作。

## Non-goals
- 不切换默认渲染器（等用户验收全部批次后再定）；WebGL 默认路径画面与性能不变。

## Acceptance Criteria
- WebGL：typecheck、npm test、build 通过，画面不变，首包不含 three/tsl、three/webgpu。
- WebGPU：对应效果与 WebGL 对比一致，控制台无新增 WGSL/WebGPU 错误。

## Decisions
- 用户要求一次开发完毕后统一验收（“你完成开发吧，开发完毕我在看”）；三批并行，文件边界见各批说明。
- 后期实现放在 app/webgpu-post-fx.ts（随 webgpu-stage 分块），用 three/webgpu PostProcessing + TSL：场景 pass（HalfFloat + 深度）→ AO 预处理（AO 分辨率法线）
  → GTAONode → DenoiseNode（RTT 到 AO 分辨率）→ BloomNode 子类（按 resolutionScale 降分辨率）→ 调色 → SMAANode（smaa）或场景 pass 多重采样（msaa）。
  AO/bloom 分辨率与 WebGL 同式（绘制缓冲 × resolutionScale / max(1, 像素比)）。
- 画质 / 抗锯齿 / 反射开关变化时重建输出节点图（不在图里的节点不执行，low 不付 AO/bloom 开销）；场景 pass、AO、bloom 节点只建一次。
  抗锯齿切换改场景 pass 的 options.samples 并释放其目标（同 WebGL 释放 sceneTarget）。
- 调色：outputColorTransform 关闭，在节点图里 renderOutput（色调映射 + sRGB）后再在显示空间乘 AO、tint/饱和/对比/暗角，与 GRADE_FRAGMENT 逐行对应；
  PostFx.grade 仍是 IUniform，TSL uniform 用 onRenderUpdate 每次渲染读 .value（天气、演出、ai-city 写的值生效）。
  three 后期 uv 原点在左上：引力透镜在 y 向上坐标里计算后翻回；地面反射用 getViewPosition/getScreenPosition。
  引力透镜投影与视空间上方向的 JS 计算从 createPostFx 提成 updateGravityLensUniform / updateViewUpUniform 两端共用（WebGL 着色器未改）。
- RTT 节点（AO 预处理、降噪、SMAA 输入）改为每帧标记一次更新：three 默认每次被引用的渲染都重画（预处理被 GTAO、降噪、调色三次渲染引用）。
- 法线重建自写（同 three getNormalFromDepth / AO_PREPASS_FRAGMENT），尺寸取 uniform：msaa 下深度是多重采样纹理，three 版本生成的 textureDimensions(t, 0) 不合法。
- 画布 alpha: false、antialias: false（同 WebGL 舞台；抗锯齿在后期链里）。
- GPU 计时（render/gpu-timer.ts createTimestampTimer）：WebGPURenderer trackTimestamp + resolveTimestampsAsync，只有整帧总计、无分段；
  three 查询池按“本帧调用序号 + 渲染上下文”登记，帧循环每帧 info.reset()，几帧共用一次读回时只留最近一帧，故每次读回按一帧计入。
  适配器无 timestamp-query 时返回不支持。reset 只清零累计，不丢在途读回（基准仍拒绝 webgpu）。frame-loop / game-app 无需改动，动态分辨率直接生效。
- 已知差异：降噪为 DenoiseNode 固定 16 样本（WebGL 为 denoiseSamples=4），其余取 GTAOPass 默认（lumaPhi 10、depthPhi 2、normalPhi 3、radius 8）；
  SMAA 结果多一次全屏复制；场景 pass 无模板缓冲（r180 绑定深度纹理视图 aspect 固定为 all，无法采样 depth24plus-stencil8），player-occlusion 等模板效果在 WebGPU 下不生效；
  Chrome 时间戳有量化，GPU 读数偏噪。
- 浏览器（用户 Chrome，5191 端口另有游戏标签页与其他 3D 页面争用，数字只作参考；同时 546/547 在改材质，页面多次被 HMR 重载）：
  high/low、SMAA/MSAA 加载与运行时切换均无 WGSL/WebGPU 错误；性能面板 GPU 有读数，动态分辨率实测 3840→3360→3840、高负载时降到 1920。
  原野森林 high：WebGPU CPU ≈18.3 ms（render 12.7）、GPU ≈5–16 ms、约 25 FPS；WebGL CPU ≈11.4 ms（render 5.6）、GPU 2–56 ms（波动大）、约 23 FPS。
  同一次加载内把后期四边形换成直接 renderer.render(scene) 对比：天空亮度 76 vs 84（调色对比度/暗角，符合预期），地面与树在两种路径下同样发黑——
  来自当时正在修改的地形/树材质翻译，不是后期；关闭 AO（radius≈0）亮度变化 ≤ 3/255。WebGPU 天空比 WebGL 偏暗偏饱和，直接渲染路径同样如此，也不是后期。
  游戏时钟流速快（约 1 游戏分钟/秒）且天气会变，跨加载截图光照不可比，AO/bloom 细节差异未能逐像素对比，留给用户验收；renderTexture 游戏页不调用，未实测。
- 发现（不在本批文件边界内，未改）：stage.setQuality 换阴影尺寸时 dispose 并置空 keyLight.shadow.map，WebGPU 下 ShadowNode 继续引用被销毁的深度纹理
  （控制台 “Destroyed texture ShadowDepthTexture used in a submit”，切画质后阴影失效）；WebGPU 的 ShadowNode 每帧按 mapSize 自行 setSize，修法是 WebGPU 下跳过这两行。

- 整体偏暗的根因（主会话排查）：调色节点的 Fn 体在着色器构建时执行，此时 PostProcessing.render 已把渲染器 toneMapping / outputColorSpace 临时清空，renderOutput 得到“无色调映射 + 线性输出”。改为 build() 先取值传入。验证：线性 0.2 灰探针输出 [127,120,111]，与按 WebGL 调色公式手算逐位一致。
- 切画质后阴影失效：stage.setQuality 在 WebGPU 下不再销毁阴影贴图（WebGPU 阴影节点按 mapSize 自行调整）。
- 堡垒远景倒置：WebGPU 渲染目标首行是画面顶部（读回实测），three 对网格贴图不做 Y 翻转；free-world-background 在 WebGPU 下给该纹理设 repeat.y = -1。
- 最终对比（原野森林，机器有其他 3D 标签页争用，只作参考）：WebGL CPU 9.1 ms（render 4.1）；WebGPU CPU 15.1 ms（render 10.4）、帧 p50 33 ms 对 WebGL 38 ms。WebGPU 的 CPU 提交开销仍明显更高，暂不建议切换默认。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2037/2037） |
| npm run build | yes | Done（PostProcessing/GTAO/SMAA/Denoise 只在 webgpu-stage 分块，733 kB） |
| 浏览器：WebGL 与 ?renderer=webgpu 对比 | yes | Done（链路、切换、计时、动态分辨率；画面细节受材质批次与游戏时钟影响，见 Decisions） |

## CPU 剖析（主会话，原野森林 WebGPU）
- 每帧 22 次场景渲染中，只有主视图（约 6 ms）与阴影图（约 4 ms）有实际 CPU 开销，后期各全屏 pass 合计不足 0.5 ms。
- 阴影：three 把每个投影物体的 alphaTest 写到共享阴影材质，跨过 0 时 version++，约 130 个渲染对象每帧重算缓存键（约 1.6 ms）。webgpu-materials 对共享阴影材质的 alphaTest 只存值不加 version 后：缓存键重算 164 → 0 次/帧，阴影 CPU 约 4.1 → 2.5 ms，主视图含阴影约 10.4 → 9.2 ms。
- 剩余差距主要是 three WebGPURenderer 的逐物体开销（绑定更新约 2.3 ms、节点更新、场景遍历），属于渲染器本身；进一步收益需 GPU 驱动渲染（compute 剔除 + 间接绘制），另立任务。
