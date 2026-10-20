"""Front/right ruler sheets for each character form on the unified ruler (ruler_standard.py)."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw
import ruler_standard as std

ROOT = Path(__file__).resolve().parents[3]
SHEETS = [
    # body_scale: 该稿身体相对基础版原图的像素倍率，拉通对比时除回去，让同一个身体一样大。
    # D1 四形态均为细腿定稿：在原稿上把腿收细约 15%，腿长与各地标高度不变，见 d1-comparison/slim-legs-prompt.txt。
    dict(folder='d1-base', source='d1-base-slim-legs-v1.png',
         title='D1 · 无外服赤脚基础版', size=(1679, 937), body_scale=1,
         crops=[(35, 25, 390, 744), (455, 25, 760, 744)],
         top=50, chin=262, soles=[734, 737], unit='发顶至下巴（含头发）',
         marks=[('发顶',50), ('下巴',262), ('肩线',285), ('腰线',398), ('胯线',480), ('膝线',576), ('踝线',687), ('脚底',734)]),
    dict(folder='d1-bald', source='d1-bald-slim-legs-v1.png',
         title='D1 · 无头发基础版', size=(1678, 937), body_scale=1,
         crops=[(35, 40, 390, 744), (520, 40, 740, 744)],
         top=67, chin=262, soles=[734, 737], unit='颅顶至下巴（不含头发）',
         marks=[('颅顶',67), ('下巴',262), ('肩线',285), ('腰线',398), ('胯线',480), ('膝线',576), ('踝线',687), ('脚底',734)]),
    # V3 以基础版身体缩到 0.845 倍为底重绘服装，见 d1-seven/body-v3-prompt.txt。
    dict(folder='d1-seven', source='character-seven-views-slim-legs-v1.png',
         title='D1 · 蓝白裙七视图', size=(1536, 1024), body_scale=0.845,
         crops=[(215, 5, 505, 612), (620, 5, 880, 612)],
         top=23, chin=201, soles=[602, 602], unit='发顶至下巴（含头发）',
         marks=[('发顶',23), ('下巴',201), ('肩线',221), ('腰缝',300), ('裙摆',425), ('膝线',466), ('靴口',532), ('鞋底',602)]),
    # 带装备以 V3 正侧放大 (908-19)/(602-23) 倍为底加装备重绘后收细腿，见 d1-equipped/*-prompt.txt；地标由 V3 换算。
    dict(folder='d1-equipped', source='d1-equipped-slim-legs-v1.png',
         title='D1 · 带装备正侧设定', size=(1536, 1024), body_scale=0.845 * (908 - 19) / (602 - 23),
         crops=[(255, 5, 700, 912), (845, 5, 1240, 912)],
         top=19, chin=292, soles=[908, 908], unit='发顶至下巴（含头发）',
         marks=[('发顶',19), ('下巴',292), ('肩线',323), ('腰缝',444), ('裙摆',636), ('膝线',699), ('靴口',800), ('鞋底',908)]),
]
# 日系男主三形态（年轻版 v2）：基础版与无发版同一画布；红毛衣稿是基础版输入原稿，基础版按 1448/1536 输出，故 body_scale=1536/1448。
MALE_SHEETS = [
    dict(folder='grassy-base', source='grassy-anime-young-base-v2.png', ruler='grassy-anime-young-base-v2-front-right-ruler',
         title='Grassy 日系版 · 无外服赤脚基础版', size=(1448, 1086), body_scale=1,
         crops=[(45, 5, 385, 866), (405, 5, 690, 866)],
         top=24, chin=276, soles=[857, 856], unit='发顶至下巴（含头发）',
         marks=[('发顶',24), ('下巴',276), ('肩线',300), ('腰线',470), ('胯线',548), ('膝线',635), ('踝线',805), ('脚底',857)]),
    dict(folder='grassy-bald', source='grassy-anime-young-bald-v2.png', ruler='grassy-anime-young-bald-v2-front-right-ruler',
         title='Grassy 日系版 · 无头发基础版', size=(1448, 1086), body_scale=1,
         crops=[(45, 60, 385, 866), (405, 60, 690, 866)],
         top=72, chin=276, soles=[858, 856], unit='颅顶至下巴（不含头发）',
         marks=[('颅顶',72), ('下巴',276), ('肩线',300), ('腰线',470), ('胯线',548), ('膝线',635), ('踝线',805), ('脚底',858)]),
    dict(folder='grassy-anime', source='grassy-anime-young-v2.png', ruler='grassy-anime-young-v2-front-right-ruler',
         title='Grassy 日系版 · 红毛衣四视图', size=(1536, 1024), body_scale=1536/1448,
         crops=[(50, 5, 410, 925), (430, 5, 730, 925)],
         top=25, chin=294, soles=[915, 916], unit='发顶至下巴（含头发）',
         marks=[('发顶',25), ('下巴',294), ('肩线',325), ('毛衣下摆',520), ('膝线',680), ('裤脚',818), ('鞋底',915)]),
]
# 男孩版（3D 卡通母版）三形态：底稿为 turnaround-master-v2 四向等比排版；基础版按 1673/1680 输出，故穿衣版 body_scale=1680/1673。
BOY_SHEETS = [
    dict(folder='grassy-boy', source='grassy-boy-base-v1.png', ruler='grassy-boy-base-front-right-ruler',
         title='Grassy 男孩版 · 无外服赤脚基础版', size=(1673, 940), body_scale=1,
         crops=[(45, 15, 395, 742), (475, 15, 745, 742)],
         top=30, chin=260, soles=[734, 738], unit='发顶至下巴（含头发）',
         marks=[('发顶',30), ('下巴',260), ('肩线',288), ('腰线',430), ('胯线',505), ('膝线',575), ('踝线',685), ('脚底',734)]),
    dict(folder='grassy-boy', source='grassy-boy-bald-v1.png', ruler='grassy-boy-bald-front-right-ruler',
         title='Grassy 男孩版 · 无头发基础版', size=(1673, 940), body_scale=1,
         crops=[(45, 70, 395, 742), (475, 70, 745, 742)],
         top=79, chin=260, soles=[734, 738], unit='颅顶至下巴（不含头发）',
         marks=[('颅顶',79), ('下巴',260), ('肩线',288), ('腰线',430), ('胯线',505), ('膝线',575), ('踝线',685), ('脚底',734)]),
    dict(folder='grassy-boy', source='grassy-boy-clothed-four-views.png', ruler='grassy-boy-clothed-front-right-ruler',
         title='Grassy 男孩版 · 红毛衣四向母版', size=(1680, 944), body_scale=1680/1673,
         crops=[(45, 15, 395, 752), (475, 15, 745, 752)],
         top=30, chin=262, soles=[740, 748], unit='发顶至下巴（含头发）',
         marks=[('发顶',30), ('下巴',262), ('肩线',300), ('毛衣下摆',452), ('膝线',575), ('裤脚',668), ('鞋底',740)]),
]

# 按 D1 四形态对照生成的男主：八个视图同在一张图、同一倍率，故四形态 body_scale 都是 1。
D1_MALE_SHEETS = [
    dict(folder='grassy-d1-male', source='grassy-d1-male-eight-final.png', size=(1224, 1285), body_scale=1, ruler='grassy-d1-male-base-front-right-ruler',
         title='Grassy · 无外服赤脚基础版', crops=[(14, 20, 286, 618), (352, 20, 580, 618)],
         top=35, chin=216, soles=[617, 617], unit='发顶至下巴（含头发）',
         marks=[('发顶',35), ('下巴',216), ('肩线',234), ('腰线',322), ('胯线',395), ('膝线',485), ('踝线',590), ('脚底',617)]),
    dict(folder='grassy-d1-male', source='grassy-d1-male-eight-final.png', size=(1224, 1285), body_scale=1, ruler='grassy-d1-male-bald-front-right-ruler',
         title='Grassy · 无头发基础版', crops=[(624, 55, 895, 618), (984, 55, 1153, 618)],
         top=62, chin=216, soles=[617, 617], unit='颅顶至下巴（不含头发）',
         marks=[('颅顶',62), ('下巴',216), ('肩线',234), ('腰线',322), ('胯线',395), ('膝线',485), ('踝线',590), ('脚底',617)]),
    dict(folder='grassy-d1-male', source='grassy-d1-male-eight-final.png', size=(1224, 1285), body_scale=1, ruler='grassy-d1-male-outfit-front-right-ruler',
         title='Grassy · 红毛衣', crops=[(14, 645, 284, 1245), (353, 645, 581, 1245)],
         top=664, chin=842, soles=[1244, 1244], unit='发顶至下巴（含头发）',
         marks=[('发顶',664), ('下巴',842), ('肩线',864), ('毛衣下摆',994), ('膝线',1130), ('裤脚',1170), ('鞋底',1244)]),
    dict(folder='grassy-d1-male', source='grassy-d1-male-eight-final.png', size=(1224, 1285), body_scale=1, ruler='grassy-d1-male-equipped-front-right-ruler',
         title='Grassy · 带装备版', crops=[(622, 645, 899, 1245), (965, 645, 1193, 1245)],
         top=664, chin=842, soles=[1244, 1244], unit='发顶至下巴（含头发）',
         marks=[('发顶',664), ('下巴',842), ('肩线',864), ('毛衣下摆',994), ('膝线',1130), ('裤脚',1170), ('鞋底',1244)]),
]


def build(spec, base):
    """Front/right sheet on the unified ruler; base is the same character's haired barefoot sheet."""
    source = ROOT / 'public/catalog' / spec['folder'] / spec['source']
    original_bytes = source.read_bytes()
    art = Image.open(source).convert('RGB')
    assert art.size == spec['size'], (source, art.size)
    head = spec['chin'] - spec['top']
    ratio = (spec['soles'][0] - spec['top']) / head
    scale = std.body_scale(spec, base)
    foot, purple_x, orange_x = 970, 150, 1150
    out = Image.new('RGB', (1500, foot + 190), std.PAPER)
    d = ImageDraw.Draw(out)
    std.panel(d, (40, 125, 1460, foot + 25))
    d.text((60, 34), spec['title'], font=std.font(40), fill=std.BLUE)
    d.text((62, 92), '正面 + 右侧  /  统一标尺：3.1 格 + 3.3 头身参照', font=std.font(24), fill=std.GRAY)
    d.text((1440, 40), f'读图约 {ratio:.2f} 头身', font=std.font(24), fill=std.PURPLE, anchor='ra')
    d.text((1440, 74), f'（{spec["unit"]}）', font=std.font(20), fill=std.GRAY, anchor='ra')
    edges = [purple_x + 20]
    for i, center in enumerate([470, 880]):
        crop = spec['crops'][i]
        piece = art.crop(crop)
        piece = piece.resize((round(piece.width*scale), round(piece.height*scale)), Image.Resampling.LANCZOS)
        x, y = center - piece.width // 2, foot - round((spec['soles'][i] - crop[1]) * scale)
        out.paste(piece, (x, y))
        edges += [x, x + piece.width]
        d.text((center, 150), ['正面 FRONT', '右侧 RIGHT'][i], font=std.font(24), fill=std.INK, anchor='mm')
    edges.append(orange_x - 20)
    assert edges == sorted(edges), edges
    d.line((purple_x, foot, orange_x, foot), fill=std.INK, width=3)
    std.head_ruler(d, purple_x, foot)
    # Landmark readings are printed beside the ruler; their dashed lines are page guides switched on over the art.
    guides = std.Layer()
    guides.guide(std.tile_ruler(d, orange_x, foot), purple_x + 25, orange_x - 25, '#E2B898')
    marks = []
    for (label, source_y), color in zip(spec['marks'], std.GUIDE_COLORS):
        y = foot - (spec['soles'][0] - source_y) * scale
        tiles = (foot - y) / std.UNIT
        d.text((1250, y), f'{label}  {tiles:.2f} 格', font=std.font(21), fill=color, anchor='lm')
        marks.append(dict(label=label, source_y=source_y, tiles=round(tiles, 3)))
        guides.guide(y, purple_x + 25, orange_x - 25, color)
    d.rounded_rectangle((40, foot + 40, 1460, foot + 160), radius=14, fill='#FFFFFF', outline=std.LINE, width=2)
    notes = ['1 格 = 240 px；同一角色的有发赤脚基础版外观高 = 3.1 格，其余形态沿用同一身体倍率，保留头发与鞋底高度差。',
             '紫尺按 3.1 格 ÷ 3.3 等分，是设计参照，不是读图地标；右侧标注为人工读图高度（约 ±5 px）。',
             '原图整体等比缩放，未单独拉伸头、身体或腿；正侧脚底对齐地面。']
    for i, note in enumerate(notes):
        d.text((62, foot + 56 + i * 34), note, font=std.font(21), fill=std.INK)
    if spec is base:
        assert abs((spec['soles'][0] - spec['top']) * scale - std.VISIBLE * std.UNIT) < 1e-6
    name = spec.get('ruler', 'front-right-ruler')
    target = source.parent / f'{name}.png'
    out.save(target)
    std.write_guides(source.parent / f'{name}.guides.json', out.size, guides)
    assert source.read_bytes() == original_bytes
    metadata = dict(source=spec['source'], source_sha256=hashlib.sha256(original_bytes).hexdigest(),
                    crop_boxes=spec['crops'], source_soles_y=spec['soles'], top_y=spec['top'], chin_y=spec['chin'],
                    head_pixels=head, measured_head_units=ratio, head_unit_definition=spec['unit'],
                    pixels_per_tile=std.UNIT, uniform_scale=scale, landmarks=marks,
                    method='unified ruler (public/concepts/character-ruler-standard.md); uniform resize; sole-aligned')
    (source.parent / f'{name}.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
    print(f'{target.relative_to(ROOT)}: {out.width}x{out.height}, scale {scale:.3f}, {ratio:.3f}H')


if __name__ == '__main__':
    for sheets in (SHEETS, MALE_SHEETS, BOY_SHEETS, D1_MALE_SHEETS):
        for sheet in sheets:
            build(sheet, sheets[0])
