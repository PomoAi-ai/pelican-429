"""Guide lines for the unified-ruler comparison boards: whole tiles plus five landmarks, written as page guides."""
import json
from PIL import Image
from draw_rulers import ROOT
import ruler_standard as std


def lines(folder, landmarks, stem='three-forms'):
    folder = ROOT / 'public/art-library' / folder
    meta = json.loads((folder / f'{stem}-shared-ruler.json').read_text())
    front = meta['images'][0]
    left, right = meta['ruler_x']
    foot, unit = meta['foot_y'], meta['pixels_per_tile']
    guides = std.Layer()
    for tiles in (1, 2, 3):
        guides.guide(foot - tiles * unit, left + 25, right - 25, '#E4D3C6', width=1, step=6)
    guides.guide(foot - std.VISIBLE * unit, left + 25, right - 25, '#E2B898')
    heights = []
    for label, source_y, color in landmarks:
        # 基准为最左侧有发赤脚版正面，线贯穿全部视图，不随其他形态移动。
        y = front['position'][1] + (source_y - front['crop'][1]) * front['scale']
        guides.guide(y, left + 25, right - 25, color, f'{label} {(foot - y) / unit:.2f} 格', 3)
        heights.append(y)
    assert heights == sorted(heights)
    std.write_guides(folder / f'{stem}-shared-ruler.guides.json', Image.open(folder / f'{stem}-shared-ruler.png').size, guides)

LABELS = ['头顶线（含发）', '下颚线', '胸部线', '腰线', '膝盖线']
COLORS = ['#237992', '#b1406e', '#228257', '#93631c', '#5261ad']
# 基准 y 取自最左侧有发赤脚版正面原图；立体重绘取自 AI 原图 d1-volumetric-eight-v1.png。
lines('d1-comparison', list(zip(LABELS, [50, 262, 345, 398, 576], COLORS)))
lines('d1-comparison', list(zip(LABELS, [84, 244, 313, 350, 503], COLORS)), 'three-forms-volumetric')
lines('d1-comparison', list(zip(LABELS, [84, 244, 313, 350, 503], COLORS)), 'three-forms-volumetric-soft')
lines('grassy-comparison', list(zip(LABELS, [24, 276, 350, 470, 635], COLORS)))
lines('grassy-boy-comparison', list(zip(LABELS, [30, 260, 335, 430, 575], COLORS)))
lines('grassy-d1-male-comparison', list(zip(LABELS, [35, 216, 272, 322, 485], COLORS)))
# 男女对比以最左侧 D1 有发赤脚正面为基准。
lines('grassy-d1-male-comparison', list(zip(LABELS, [50, 262, 345, 398, 576], COLORS)), 'male-female')
