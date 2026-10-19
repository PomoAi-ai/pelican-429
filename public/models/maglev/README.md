# 磁悬浮列车模型

- `open-car.glb`：敞开式，每节前后两个单座。
- `closed-car.glb`：有棚式，使用相同底盘。
- `track.glb`：2 格长的轨道模块，平台深 3 格，轨道范围居中深 2 格。
- `dimensions.json`：导出时的实际包围盒尺寸。

共享源位于 `src/render/transit/maglev-model.ts`，尺寸配置位于 `src/config/maglev.ts`；场景直接使用同一模型生成函数。

重新导出：`node scripts/export-maglev-models.ts`。
启动场景：`npm run dev`，访问 http://127.0.0.1:5174/maglev-track.html 。
构建：`npm run build:full`，产物为 `dist-full/maglev-track.html`。

A/D 或方向键行驶，空格刹车，也支持按住页面按钮。可切换车棚及缩放、归位。
场景沿 X 轴长 160 格，沿用游戏平视透视；三节连挂。未包含角色上下车与坐姿动画。

造型依据：`public/art-library/maglev-tandem-streamline/multiview.png`，连续白银流线曲面，前后两排单座。

当前修订按侧面图校正车头、座位、侧开孔、尾部和磁靴。实际车体宽约 1.767 格，含连接件长约 7.425 格。这是逐步贴近概念图的版本，尚未达到所有视图及材质细节完全一致。

车身灯带和磁靴使用发光材质；试车场加入局部泛光和磁靴对轨道的蓝色照明。GLB 包含发光材质，光晕和轨面灯由 `src/render/transit/maglev-lighting.ts` 与场景后期共同实现，需在接入的场景中一同装配。

启动先用 0.45 秒起浮再前进；行驶时滑靴与轨顶间距约 0.38 格，刹停后用 0.45 秒平滑落轨。换向保持悬浮，端点停靠后反向可再次起浮。
模型自身鞋底基准 Y=0.36，轨顶 Y=0.2；停靠时模型根节点 Y=-0.16。GLB 是静态几何，升降由共享驾驶状态及场景装配控制。
