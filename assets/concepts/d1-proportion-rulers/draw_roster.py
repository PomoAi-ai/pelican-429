"""24 职业女版 / 男版四视图标尺板（统一标尺，见 public/concepts/character-ruler-standard.md）。

原图不加任何标记：标尺画在另存的 *-ruler.png 上，地标虚线写进同名 *.guides.json，资料库点“显示虚线”时叠画。
每张稿以正面发冠（不含马尾、发髻、翘发）到鞋底 = 3.1 格定倍率，四个视图同一倍率、鞋底对齐地面线。
地标为人工读图的原图像素 y（正面），发冠与下巴误差约 ±5 px，肩腰膝约 ±10 px；视图左右边界与鞋底由白底分割自动求出。
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
import ruler_standard as std

ROOT = Path(__file__).resolve().parents[3] / 'public/art-library/roster-24'
LABELS = ['正面 FRONT', '右侧 RIGHT', '背面 BACK', '前 45° FRONT 45']
MARKS = ['发冠', '下巴', '肩线', '腰线', '膝线']
# 读图值（原图像素 y，正面）：发冠, 下巴, 肩线, 腰线, 膝线。
LANDMARKS = json.loads((Path(__file__).parent / 'roster-landmarks.json').read_text())


def views(art):
    """Four figures on white: column groups of non-white pixels inside the tallest occupied row band (captions excluded)."""
    a = np.asarray(art).astype(int)
    fg = (a.min(2) < 225) | ((a.max(2) - a.min(2)) > 40)
    rows = np.flatnonzero(fg.any(1))
    runs = np.split(rows, np.flatnonzero(np.diff(rows) > 1) + 1)
    band = max(runs, key=len)
    cols = np.flatnonzero(fg[band[0]:band[-1] + 1].any(0))
    groups = [g for g in np.split(cols, np.flatnonzero(np.diff(cols) > 12) + 1) if len(g) > 60]
    assert len(groups) == 4, len(groups)
    out = []
    for g in groups:
        r = np.flatnonzero(fg[band[0]:band[-1] + 1, g[0]:g[-1] + 1].any(1)) + band[0]
        out.append((int(g[0]), int(g[-1]), int(r[0]), int(r[-1])))
    return out


def build(key, spec):
    art_path = ROOT / spec['art']
    art = Image.open(art_path).convert('RGB')
    crown, chin, *_ = spec['marks']
    figures = views(art)
    sole = figures[0][3]
    scale = std.VISIBLE * std.UNIT / (sole - crown)
    ratio = (sole - crown) / (chin - crown)
    # 横向按原图间距等比排开，鞋底各自落到地面线；尺与画布宽度随内容。
    foot, purple_x, first = 1000, 150, figures[0][0] - 6
    orange_x = round(260 + (figures[-1][1] + 6 - first) * scale) + 60
    width = orange_x + 320
    out = Image.new('RGB', (width, foot + 200), std.PAPER)
    d = ImageDraw.Draw(out)
    std.panel(d, (40, 125, width - 40, foot + 30))
    d.text((60, 30), spec['title'], font=std.font(40), fill=std.BLUE)
    d.text((62, 90), f'{spec["hair"]}  /  四视图  /  统一标尺：3.1 格 + 3.3 头身参照', font=std.font(22), fill=std.GRAY)
    d.text((width - 60, 36), f'读图约 {ratio:.2f} 头身', font=std.font(26), fill=std.PURPLE, anchor='ra')
    d.text((width - 60, 74), '（正面发冠至下巴，不含马尾、发髻、翘发）', font=std.font(20), fill=std.GRAY, anchor='ra')
    edges = [purple_x + 20]
    for (x0, x1, top, bottom), label in zip(figures, LABELS):
        piece = art.crop((x0 - 6, max(0, top - 6), x1 + 6, bottom + 3))
        piece = piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.Resampling.LANCZOS)
        x = round(260 + (x0 - 6 - first) * scale)
        center = x + piece.width // 2
        out.paste(piece, (x, foot - round((bottom + 3 - max(0, top - 6)) * scale)))
        edges += [x, x + piece.width]
        d.text((center, foot + 14), label, font=std.font(22), fill=std.INK, anchor='ma')
    edges.append(orange_x - 20)
    assert edges == sorted(edges), (key, edges)
    d.line((purple_x, foot, orange_x, foot), fill=std.INK, width=3)
    std.head_ruler(d, purple_x, foot)
    guides = std.Layer()
    left, right = purple_x + 25, orange_x - 25
    for tiles in (1, 2, 3):
        guides.guide(foot - tiles * std.UNIT, left, right, '#E4D3C6', width=1, step=6)
    guides.guide(std.tile_ruler(d, orange_x, foot), left, right, '#E2B898')
    landmarks = []
    for label, source_y, color in zip(MARKS, spec['marks'], std.GUIDE_COLORS):
        y = foot - (sole - source_y) * scale
        tiles = (foot - y) / std.UNIT
        d.text((orange_x + 90, y), f'{label}  {tiles:.2f} 格', font=std.font(21), fill=color, anchor='lm')
        guides.guide(y, left, right, color)
        landmarks.append(dict(label=label, source_y=source_y, tiles=round(tiles, 3)))
    d.rounded_rectangle((40, foot + 60, width - 40, foot + 185), radius=14, fill='#FFFFFF', outline=std.LINE, width=2)
    notes = ['1 格 = 240 px；正面发冠至鞋底 = 3.1 格，四个视图同一倍率整体等比缩放，鞋底对齐地面线，未单独拉伸头、身体或腿。',
             '紫尺按 3.1 格 ÷ 3.3 等分，是设计参照，不是读图地标；右侧为正面人工读图高度（发冠、下巴约 ±5 px，肩、腰、膝约 ±10 px），点“显示虚线”贯穿四个视图。',
             '背面看不到下巴，只核对高度与轮廓；45° 视角供造型参考，精确角度与跨视图深度须在 3D 中复核。']
    for i, note in enumerate(notes):
        d.text((62, foot + 76 + i * 34), note, font=std.font(20), fill=std.INK)
    target = art_path.with_name(spec['ruler'])
    out.save(target)
    std.write_guides(target.with_suffix('.guides.json'), out.size, guides)
    print(f'{key}: {ratio:.2f}H, scale {scale:.3f}')
    return dict(ruler=spec['ruler'], head_ratio=round(ratio, 3), uniform_scale=round(scale, 4), front_sole_y=sole, landmarks=landmarks)


if __name__ == '__main__':
    sheets = {key: build(key, spec) for key, spec in LANDMARKS.items()}
    record = dict(method='统一标尺：正面发冠（不含马尾、发髻、翘发）至鞋底 = 3.1 格；四视图同一倍率，鞋底对齐。头身 = (鞋底 − 发冠) ÷ (下巴 − 发冠)。',
                  target_head_ratio=std.HEADS, world_height_tiles=std.VISIBLE, sheets=sheets)
    (ROOT / 'measurements-all.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
