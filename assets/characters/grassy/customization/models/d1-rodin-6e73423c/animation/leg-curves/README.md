# D1 裸腿真实曲面增强

在已校正膝位和鞋筒绑定的版本上，仅对裸腿执行法线引导曲面细分，强度 0.65。新增顶点投向平滑曲面，不是单纯线性分段或 shade_smooth。

- 4308 个点发生真实几何位移，最大位移 0.0076024（模型总高 3.1）。
- 原膝中心仍为 0.84，权重过渡仍为 0.73–0.95；整靴保持刚性。
- 衣服、鞋和头部受保护原顶点的最大位移严格为 0。
- 动画派生网格仍为 23943 顶点；UV 由原表面插值，服装纹样未细分修改。
- 原 refined.blend 未修改。

`before-walk-27.png` 与 `after-walk-27.png` 是同镜头/同姿态/同灯光对照；前者为线性分段版本，后者小腿面片高光已变为连续曲面。
`before-idle-0.png` 与 `after-idle-0.png` 是静止比例对照。还提供 after-walk-0/9/18 的关键帧近景。

## 检验
四动作共 208 帧的有限几何、接地、循环闭合、小腿中段刚性和整靴刚性自检全部通过。新增断言验证曲面点实际位移大于 0.001、最大位移小于 0.035，保护区域不移动。

{
  "sourceVertices": 19629,
  "vertices": 23943,
  "addedVertices": 4314,
  "surfaceMethod": "Normal-guided curved subdivision of bare legs only",
  "surfaceSmooth": 0.65,
  "maximumCurveDisplacement": 0.007602406750445354,
  "movedSurfaceVertices": 4308,
  "protectedOriginalVertexMaximumDisplacement": 0.0,
  "kneeCenterZ": 0.84,
  "kneeWeightTransition": [
    0.73,
    0.95
  ],
  "bootTopZ": 0.47,
  "ankleWeightTransition": [
    0.47,
    0.55
  ],
  "purpose": "Round real leg geometry while keeping the narrow source proportions, boot rigidity and calibrated knee."
}
