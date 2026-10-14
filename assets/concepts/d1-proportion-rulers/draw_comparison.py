"""Multi-form front/right comparison per character on the unified ruler (ruler_standard.py)."""
import json
from PIL import Image, ImageDraw
from draw_rulers import ROOT, SHEETS, MALE_SHEETS, BOY_SHEETS, D1_MALE_SHEETS
import ruler_standard as std

FOOT, PURPLE_X = 1010, 110


def board(groups, folder, name, title, notes):
    """groups: (form, base of that character); each form keeps its own character's body scale."""
    orange_x = 230 + 800 * len(groups) + 30
    width = orange_x + 120
    out = Image.new('RGB', (width, FOOT + 150 + 40 * len(notes)), std.PAPER)
    draw = ImageDraw.Draw(out)
    std.panel(draw, (20, 135, width - 20, FOOT + 70))
    draw.text((40, 30), title, font=std.font(40), fill=std.BLUE)
    draw.text((42, 90), f'一张图片 · 统一标尺 · {2 * len(groups)} 个视图    |    每个角色的有发赤脚基础版 = 3.1 格，各形态沿用本角色的身体倍率，保留头发与鞋底高度差', font=std.font(24), fill=std.GRAY)
    records, edges = [], [PURPLE_X + 20]
    for group, (spec, base) in enumerate(groups):
        source = ROOT / 'public/art-library' / spec['folder'] / spec['source']
        art = Image.open(source).convert('RGB')
        assert art.size == spec['size']
        # Hair or boots must not rescale the body: every form is drawn at the base body's size.
        scale = std.body_scale(spec, base)
        group_left = 230 + group * 800
        draw.text((group_left + 380, 168), spec['title'], font=std.font(26), fill=std.INK, anchor='mm')
        for view, crop in enumerate(spec['crops']):
            piece = art.crop(crop)
            resized = piece.resize((round(piece.width*scale), round(piece.height*scale)), Image.Resampling.LANCZOS)
            center = group_left + 180 + view * 400
            x = center - resized.width // 2
            y = FOOT - round((spec['soles'][view]-crop[1])*scale)
            out.paste(resized, (x, y))
            edges += [x, x + resized.width]
            draw.text((center, FOOT + 45), ['正面 FRONT', '右侧 RIGHT'][view], font=std.font(23), fill=std.INK, anchor='mm')
            records.append(dict(source=str(source.relative_to(ROOT)), crop=crop, scale=scale, position=[x, y]))
    edges.append(orange_x - 20)
    assert edges == sorted(edges), edges
    std.head_ruler(draw, PURPLE_X, FOOT)
    std.tile_ruler(draw, orange_x, FOOT)
    draw.line((PURPLE_X, FOOT, orange_x, FOOT), fill=std.INK, width=3)
    draw.text((40, FOOT + 95), '1 格 = 240 px；紫尺按 3.1 格 ÷ 3.3 等分，是设计参照，不是读图地标；无头发版不按颅顶放大。', font=std.font(22), fill=std.INK)
    for i, note in enumerate(notes):
        draw.text((40, FOOT + 135 + 40 * i), note, font=std.font(22), fill=std.INK)
    target = ROOT / 'public/art-library' / folder
    target.mkdir(exist_ok=True)
    out.save(target / f'{name}.png')
    (target / f'{name}.json').write_text(json.dumps(dict(method='unified ruler: each haired barefoot base = 3.1 tiles at 240 px/tile; forms share their character base body scale; sole alignment', foot_y=FOOT, pixels_per_tile=std.UNIT, ruler_x=[PURPLE_X, orange_x], images=records), ensure_ascii=False, indent=2)+'\n')
    print(target / f'{name}.png')
    return records


def compare(sheets, folder, title, notes):
    records = board([(spec, sheets[0]) for spec in sheets], folder, 'three-forms-shared-ruler', title, notes)
    assert len(records) == 2 * len(sheets) and records[0]['scale'] == records[2]['scale']
    assert abs((sheets[0]['soles'][0]-sheets[0]['top'])*records[0]['scale'] - std.VISIBLE*std.UNIT) < 1e-6
    # Same body under the costume: its total height must land within 2% of the base figure's.
    assert abs((sheets[2]['soles'][0]-sheets[2]['top'])*records[4]['scale'] - std.VISIBLE*std.UNIT) < 0.02*std.VISIBLE*std.UNIT
    assert (sheets[1]['soles'][0]-sheets[1]['top'])*records[2]['scale'] < std.VISIBLE*std.UNIT


compare(SHEETS, 'd1-comparison', 'D1 · 四种形态正侧拉通对比',
        ['四种形态均为细腿定稿：腿收细约 15%，腿长与胯、膝、踝高度不变；蓝白裙以身材对齐基础版的 V3 为底，未指定实际身高。',
         '带装备稿以蓝白裙身体为底加丝袜裤、背包与护腕重绘，与蓝白裙同一身体倍率；旧带装备稿头大腿长，不再用于对比。'])
compare(MALE_SHEETS, 'grassy-comparison', 'Grassy 日系版 · 三种形态正侧拉通对比',
        ['年轻版红毛衣日系稿是两张基础版的生成原稿，按输出倍率 1448/1536 换算到同一身体；未指定实际身高。'])
compare(BOY_SHEETS, 'grassy-boy-comparison', 'Grassy 男孩版 · 三种形态正侧拉通对比',
        ['红毛衣为已确认的 3D 卡通四向母版等比排版，按输出倍率 1673/1680 换算到同一身体；未指定实际身高。'])
compare(D1_MALE_SHEETS, 'grassy-d1-male-comparison', 'Grassy（按 D1 对照）· 四种形态正侧拉通对比',
        ['定稿：B8 鹅蛋脸，八个视图由 AI 按 D1 四种形态对比图逐格对应绘制，同一张图、同一倍率；未指定实际身高。'])


def tiles(spec, label):
    """Height above the soles, in tiles, of a mark on a character's haired base front."""
    y = dict(spec['marks'])[label]
    return std.VISIBLE * (spec['soles'][0] - y) / (spec['soles'][0] - spec['top'])


female, male = SHEETS[0], D1_MALE_SHEETS[0]
board([(f, female) if i % 2 == 0 else (f, male) for i, f in enumerate([SHEETS[0], D1_MALE_SHEETS[0], SHEETS[2], D1_MALE_SHEETS[2], SHEETS[3], D1_MALE_SHEETS[3]])],
      'grassy-d1-male-comparison', 'male-female-shared-ruler', '男女主角 · D1 与 Grassy 正侧拉通对比',
      [f'两人各自的有发赤脚基础版都 = 3.1 格。读图：D1 下巴 {tiles(female, '下巴'):.2f}、膝 {tiles(female, '膝线'):.2f} 格；Grassy 下巴 {tiles(male, '下巴'):.2f}、膝 {tiles(male, '膝线'):.2f} 格。',
       '服装与装备沿用各自基础版的身体倍率；D1 为细腿定稿，Grassy 为 B8 鹅蛋脸定稿（已修正头身，腿比 D1 粗约 30%）。'])
