# 独立头发资源

`export.py` 从手工曲线生成独立发帽、发束和发束骨骼。设计稿在 `assets/characters/hair-design/`；使用 Blender 执行，例如：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/character_hair/export.py -- --profile grassy --output output/hair-rebuild
```

## 主角细束发型

主角分支使用 `grassy_groom.py`，Boss 继续使用原有生成分支。主角由 8 条侧分刘海导向、38 条侧后导向和 7 条冠顶导向组成，每条导向共用原有的两节骨链；1246 根细子束覆盖同色薄发体，侧后曲面复用 `scalp-boundaries.json` 的真实发际。头骨和 `HairCap` 不参与蒙皮。

每条曲线采样 18 个纵向点，细子束截面 5 点、薄发体截面 12 点；主角材质粗糙度 `.63`、高光 IOR 强度 `.24`。修改这些数值后应重新检查真实三视图，不能用绘图概念图代替模型验收。

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/character_hair/export.py -- --profile grassy --output output/grassy-soft-hair --render-body public/characters/human/models-equipped/grassy-equipped-game.glb
```

`--style tousled` 生成主角的分层短束 A 试版。181 条独立短束的根部错位分布在头皮上，侧面向后斜铺，刘海使用手工弧线并按真实额前接缝放置在发帽外侧。根部截面从零渐变、出帽段埋入，截面使用稳定方向以免曲线出帽时翻转；根部前 20% 仍仅绑定刚性锚点。额前、冠顶、侧后弯曲上限分别为 `.30`、`.38`、`.42` 弧度。

A 使用 24 个纵向点、24 点截面，203664 个三角形；材质粗糙度 `.58`、高光 IOR 强度 `.27`。发帽与身体接缝保持原样，未改变头骨、脸或身体。该试版仍偏分片雕塑质感，不能把参考绘图当成实际模型效果。

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/character_hair/export.py -- --profile grassy --style tousled --output output/grassy-layered-hair --render-body public/characters/human/models-equipped/grassy-equipped-game.glb
```

正式 A/B 资源分别为 `public/characters/hair/grassy-tousled.glb` 和 `public/characters/hair/grassy.glb`；当前真实模型三视图分别为 `assets/characters/hair-design/grassy-layered-model.png` 和 `grassy-soft-hair-model.png`。`grassy-tousled-model.png` 保留先前失败试版，不能用于当前模型验收。B 与 Boss 的资源保持不变。

## 去除旧身体模型中的融合头发

输入必须是**未裁切原件**，本次使用 Git 基线 `2a5455a` 的 37 个身体文件。不要在换成新身体的 `public/` 上再次运行裁切。脚本只写 `output/hair-rebuild-probe/`，不会覆盖 `public/`。

原件由 Git LFS 管理。可从已有本地 LFS 对象恢复到独立目录；下例不覆盖工作区文件，也不访问网络。若对象不在本地，命令会失败，先单独解决原件获取再继续。

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, subprocess
root = Path('/private/tmp/hair-uncut-2a5455a')
base = ['public/characters/human/models-equipped/grassy-equipped-game.glb',
        'public/characters/sam/sam.glb', 'public/characters/sam/human/sam-human.glb',
        'public/characters/tibo/tibo.glb', 'public/characters/tibo/human/tibo-human.glb']
paths = base + [f'public/characters/human/models-equipped/grassy-equipped-{tier}.glb' for tier in ['light', 'detailed']]
paths += [p.removesuffix('.glb') + '.' + tier + '.glb' for p in base
          for tier in ['web', 'web-1k', 'ktx2', 'ktx2-256', 'ktx2-compact', 'ktx2-256-compact']]
for name in paths:
    pointer = subprocess.check_output(['git', 'show', f'2a5455a:{name}']).decode()
    fields = dict(line.split(' ', 1) for line in pointer.strip().splitlines())
    digest = fields['oid'].removeprefix('sha256:')
    local = subprocess.check_output(['git', 'rev-parse', '--git-common-dir'], text=True).strip()
    source = Path(local) / 'lfs/objects' / digest[:2] / digest[2:4] / digest
    data = source.read_bytes()
    assert len(data) == int(fields['size']) and hashlib.sha256(data).hexdigest() == digest, name
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
for tier in ['web', 'web-1k', 'ktx2', 'ktx2-256', 'ktx2-compact', 'ktx2-256-compact']:
    name = f'assets/characters/{tier}-models-report.json'
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(subprocess.check_output(['git', 'show', f'2a5455a:{name}']))
print(root)
PY
node scripts/character_hair/decode_body_variants.mjs --source-root /private/tmp/hair-uncut-2a5455a
uv run --with pillow python3 scripts/character_hair/clean_body.py --source-root /private/tmp/hair-uncut-2a5455a
node scripts/character_hair/pack_body.mjs
python3 scripts/character_hair/prepare_reports.py --source-root /private/tmp/hair-uncut-2a5455a
```

本机已有 Pillow 时可直接用 `python3` 运行。此环境的 `uv run` 曾因 macOS 系统配置访问而 panic，因此本次实际使用现成的 `python3` / Pillow，没有安装依赖。

步骤依次为：独立解压每个纹理规格的几何；按头发纹理颜色、冠顶连通区域及脸/耳空间范围裁切；保留混合三角的皮肤端，插值新边界；删除未引用的旧毛顶点及旧 buffer；为 web/ktx2 规格恢复无损 meshopt。WebP/KTX2 图片不重编码。没有添加肤色头壳，原额头、耳朵和脸的顶点位置保留，缺失头顶由新头发资源的刚性 `HairCap` 覆盖。

`pack_body.mjs` 对每个压缩 buffer 解码并逐字节对照。`clean-summary.json` 记录裁切数量，`replacement-map.json` 是原路径到当前候选文件的一对一映射（37 项）。最终替换前必须用候选身体搭配独立头发，在正/侧/背面检查发际、耳朵和后颈；这些脚本不替代视觉验收。

`reports/` 下的六份候选报告更新对应五个角色的实际哈希、文件大小及 buffer 大小，其他模型条目不变。图片编码元数据沿用原件且逐字节校验。compact 原有量化误差统计移入 `bodyRebuild.inheritedQuantization` 明确作为旧输入的历史统计，不冒充新拓扑的误差检测。
