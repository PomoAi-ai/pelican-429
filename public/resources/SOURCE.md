# 场景资源缩略图

这些图片截自本项目的真实模型预览，单件资源来自 `/?mode=resources`，机房全景来自 `/?mode=facility`，不是另一套模型或贴图。

- 日期：2026-10-04；固定种子 429；纯资源模式；默认缩放。
- tree.jpg：橡树；shrub.jpg：绿篱；grass.jpg：自然花草；rock.jpg：花岗岩。
- hut.jpg：右侧栈桥完整渔屋；water.jpg：清澈水体。
- cave.jpg：青色晶簇，地下环境，检视补光开启。其他六张使用地上环境。
- terrain.jpg 与 grass.jpg 于 2026-10-04 更新为实际草地瓦片及自然附着植物，场景模式，种子 429；其他截图仍为单件模式。
- cover.jpg：卷蕨，地上场景模式；desert.jpg：柱状仙人掌，地上场景模式、缩放 0.65（局部细节取景）；aquatic.jpg：金鱼藻，地上纯资源模式。三张于 2026-10-04 从共用实时预览生成，种子 429。
- 图片只用于目录、卡片头像和首页入口。实时画面始终调用游戏原有模型、材质和动画工厂。
- facility.jpg：2026-10-05 从初版机房独立页面全景实际截取，种子 429，包含林地、溪流与服务器大厅；现在对应 `/?mode=facility&scene=original`。
- facility-fortress.jpg：2026-10-05 从 `/?mode=facility&scene=fortress` 默认全景截取，种子 429，包含山体、峡谷桥、三层机房与屋顶冷却阵列；裁去页面控制栏；首页已改用下面两张截图，此图目前未被引用，保留备查。三套带页面导航的完整截图保存在 `output/facility/fortress.jpg`、`cathedral.jpg`、`abyss.jpg`。
- home-fortress-overview.jpg：2026-10-06 截自 `/?mode=facility&scene=fortress` 机房预览「全景」镜头，裁切画布区域后缩放到 1600×701，用作首页主线章节卡片配图的源图（首页实际加载 `home/fortress-overview.webp`），README 也引用此图。

更新方式：修改共享游戏资源后，在场景资源页单独选中对应资源，保持以上配置，从预览区域中心截取 8:5 画幅，覆盖对应 JPEG；不得使用替代插画掩盖实时模型的差异。

## home/：首页缩略图

首页卡片按显示尺寸的 2 倍从原图缩放，转为 WebP（质量 82），把首页图片从约 9.8 MB 降到约 0.3 MB。原图仍供游戏、展示场与 README 使用，未改动。

| 文件 | 原图 | 宽度 |
| --- | --- | --- |
| prelude-card.webp | `assets/chapter-one/01-grassy-coding-concept-v3-mac-studio.png` | 1200 |
| fortress-overview.webp | `public/resources/home-fortress-overview.jpg` | 1400 |
| pelican.webp | `public/characters/pelican/02-pelican-2d-three-quarter.png` | 640 |
| grassy.webp | `public/characters/human/models-equipped/render-game-hero.png` | 600（原宽） |
| tibo.webp、sam.webp | `public/characters/{tibo,sam}/human/render-front.png` | 640 |
| gatekeeper.webp、line-hound.webp、watch-wasp.webp、loadmaster.webp | `public/characters/enemies/<id>/thumbnail.png` | 640 |
| wechat-group.webp | `public/contact/wechat-group.jpg` | 360 |

更新方式：原图变化后按上表重新生成同名文件，例如 `uv run --with pillow python3 -c "from PIL import Image; im=Image.open('<原图>'); im.thumbnail((<宽度>, 10000), Image.LANCZOS); im.save('public/resources/home/<文件>', 'WEBP', quality=82, method=6)"`。

## home/fortress/：首页黑洞前哨贴图

首页首屏实时场景用的山体堡垒背景贴图。原图为 `public/environments/city-depth-v3/{sky,far-city,middle-district,near-rooftops}.png`，首页专用 WebP 缩放为 1020×680，天空质量 75，其余质量 65，透明通道使用无损压缩；四张合计 268,238 字节（低于 300 KB）。游戏、序章与机房预览继续使用原有 KTX2，`textures=original` 仍加载原 PNG。黑洞改由共享 WebGL 着色器实时生成，旧 `fortress-black-hole-tear` 图片保留为历史资源，不再加载。

更新方式：从原 PNG 生成，例如 `cwebp -m 6 -q 65 -resize 1020 680 public/environments/city-depth-v3/far-city.png -o public/resources/home/fortress/far-city.webp`；天空使用 `-q 75`。更新后检查四张文件合计不超过 300,000 字节。
