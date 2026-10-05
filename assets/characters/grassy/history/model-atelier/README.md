# Grassy Atelier 独立精细模型

页面显示名称：**gpt6.1sol版本**。

依据 `turnaround-master-v2` 四方向图片重新创建的静态角色。生成输入不含旧 Blender 或 GLB，模型、脚本、纹理、渲染都使用独立目录。

`grassy-atelier-detailed.blend` 是可编辑源文件：脸部、耳朵、手部、发束、衣物和鞋面按对象保留；参考图和全部材质纹理打包在文件里。模型无骨骼、无动画。

`public/characters/human/history/models-atelier/grassy-atelier-detailed.glb` 是按材质合并的导出模型，贴图嵌入文件，不需要外部图片。Blender 中 Z 轴向上、负 Y 为正面；GLB 使用 Y 向上、正 Z 为正面。全高为 3.1。

完整路径在同目录 `asset-paths.txt`。`export-inspection.json` 记录源文件重新打开和 GLB 实际导入结果。

本轮重塑了按钮鼻、虹膜与瞳孔比例、上眼睑和耳内分叉，侧后发改为朝后下方的短束分层，并修正发根露出的位置。衣物改为贴颈领口、局部斜褶、裤口堆褶和贴合鞋面；手指姿态与指甲曲面也重新调整。摄影棚使用 Khronos PBR Neutral 色彩变换和圆盘柔光。`comparison-face-front.png`、`comparison-face-right.png`、`comparison-front.png`、`comparison-right.png` 将母版和实际网格渲染按同一角色高度并列；只裁去空白并等比缩放，不调整角色外形。

本轮导出包含 24 个材质合并网格和 15 张内嵌贴图。源文件保留 415 个可编辑网格对象，已实际重开；GLB 已实际重新导入并生成检查渲染，页面加载与正背左右、自动旋转、网格控制均已核验。`preview-gpt6.1sol-page.jpg` 是当前页面的实际截图。

布料材质的局部纹样来自 `front.png`：针织采样矩形为 x=575…704、y=510…629；牛仔布为 x=686…753、y=875…994（左上角为原点）。去掉大范围光照后制作可平铺 UV 纹理，角色外形、面部和发型均为真实网格，没有把整个人物图片投射到模型上。毛衣袖身 UV 分界随袖轴向下外移，避免腹部被错误地按袖子展开。

当前制作结果仍有还原差距：发束比母版粗，后脑上排的叠接仍偏硬；眼部、脸颊与布料褶皱也没有完全达到参考的柔和程度。并列对照用于直接评估这些差异，文件验证不表示母版相似度已通过。

## 重新生成

从仓库根目录运行本机 Blender 的内置 Python，无需安装额外 Python 包：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/grassy_atelier/build.py -- --samples 48 --size 1200
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/grassy_atelier/inspect_export.py
```

只重新渲染已保存的模型：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/grassy_atelier/build.py -- --render-only --views hero,face --samples 48 --size 1200
```

## 旋转预览

在仓库根目录运行 `npm run dev -- --port 5176`，打开 `http://127.0.0.1:5176/characters/human/history/models-atelier/index.html`。页面直接加载同一个 GLB，支持旋转、缩放、固定方向、脸部近景、自动旋转和网格查看；下方有母版并列对照与实际 Blender 渲染。

当前模型以精细美术检查为用途，未替换游戏正在使用的角色资源，也未制作轻量版本。
