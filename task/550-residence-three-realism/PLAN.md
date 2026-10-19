# PLAN -- 住宅3真实感提升

## Status: implementing
## Task: 550
## Related: 548
## Baseline Commit: a13fdd68

## Goal
住宅3达到可信的真实三维湖岸效果：真实倒影、自然水纹、建筑细节、暖白立面、错落城市、自然云层和地表衔接。保留二维玩家层与所有机制。

## Non-goals
不改变住宅1/2，不改物理、不提交推送或部署。

## Acceptance Criteria
- 湖面反射实际城市并随视角改变，避免平板色水；尺度与岸线一致。
- 近主城可见玻璃分格、窗框、结构与绿化，远城逐层弱化；避免巨大稀疏方块。
- 自然云层与天气日夜协调，不以固定整图取代真实城市。
- 游戏内地表/斜视/地下/夜景/雨天核对，保持独立存档与玩法。
- 类型检查、测试、构建；运行结果不能替代美术质量验收。

## Decisions
- 基于548实景截图诊断：水面没有城市倒影、天空纯色、未启用现成幕墙材质细节，楼体与植被过于简单。
- 用户明确要求逼真，上一版不引入额外倒影渲染的决定不足以满足当前目标；采用限定背景对象的平面反射，控制绘制成本。
- 沿用dev/core-dev/Ponytail。前阶段已定位现有游戏工厂，城市与天空独立子代理探索设计后实现，主代理负责水面、装配与目视。
- 本地可回退改动且需求明确，直接实施。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/residence-three-city.ts | 有细节的真实城市与绿化 | no |
| src/render/residence-three-sky.ts | 自然天空云层 | no |
| src/render/residence-three-water.ts | 真实反射与自然波纹 | no |
| src/render/residence-three-environment.ts | 装配与衔接 | no |

## Validation
- npm run typecheck: pending
- npm test: pending
- npm run build: pending
- 浏览器美术质量与性能: pending
