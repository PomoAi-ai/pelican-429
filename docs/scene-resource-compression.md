# 场景资源优化

游戏默认使用优化资源，原始PNG、现有WebP和地形512生成能力均保留。角色继续使用512 KTX2 compact。

| 资源 | 默认规格 | 优化前 | 优化后 |
|---|---|---:|---:|
| HUD图集 | 768×576 WebP Q80，alpha无损 | 1,789,676 B | 151,258 B |
| 序章四图 | 1672×941 WebP Q80 | 7,997,893 B | 617,586 B |
| 堡垒四层背景 | 1536×1024 ETC1S KTX2，完整mipmap | WebP 764,582 B | 1,001,174 B |

九项资源总计从10,552,151 B变为1,770,018 B，减少83.23%。这表示文件体积，不是每次启动都需要下载的总量：序章只在进入序章时加载，自由世界不加载堡垒城市背景。

KTX2背景比现有WebP多236,592 B，换取GPU压缩；按RGBA8和BC7/ASTC 4×4计算，四层含mipmap的纹理预算约32→8 MiB（实际格式依设备能力，非GPU实测）。天空为不透明，其他三层保留alpha。加载器按真实renderer检测能力，字节预加载可共享，转码后的纹理由各场景独占释放。

地形默认从512改为256，仍调用同一生成器；7层RGBA基础数据从7→1.75 MiB，含mipmap预算9.33→2.33 MiB。单独预热后各采样5次，本机生成中位数218.8→65.9ms；这不是FPS测量。

## 原版对照

游戏、堡垒预览和序章在网址追加`textures=original`可使用原角色、堡垒PNG及512地形。HUD和序章WebP保持默认，原PNG仍在各原路径中用于制作和图像对照。

- 优化游戏：`?mode=game`
- 原版游戏：`?mode=game&textures=original`
- 优化堡垒：`?mode=game&level=facility&scene=fortress`
- 原版堡垒：`?mode=game&level=facility&scene=fortress&textures=original`

## 重建

需要现有命令行工具ImageMagick、cwebp与Khronos KTX-Software（toktx和同目录ktx）：

```sh
TOKTX=/path/to/toktx npm run assets:scene
```

脚本`scripts/build-scene-assets.ts`只生成派生文件，从原PNG编码，不从已有WebP二次压缩。它验证原件SHA-256、WebP尺寸/透明度、KTX尺寸/完整mipmap及格式有效性；精确源路径、输出路径、哈希与字节数写入`assets/scene-compression-report.json`。
