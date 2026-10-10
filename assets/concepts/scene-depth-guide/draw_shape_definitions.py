"""Draw exact tile cross-sections and joins for the proposed one-unit depth rule."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/concepts'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
BG, INK, BLUE, MUTED = '#F5F3EE', '#23394A', '#326BB0', '#687E8C'
ORANGE, FILL, GRID = '#AF6E32', '#E4EEF5', '#B2C1CA'
SHAPES = [
    ('A', '整砖', [(0,0),(1,0),(1,1),(0,1)], '现行轮廓', '全高 1；体积 1', '左端高 1 → 右端高 1', '整个逻辑单元为实体。'),
    ('B', '下半砖', [(0,0),(1,0),(1,.5),(0,.5)], '现行轮廓', '实体高 0.5；体积 0.5', '左端高 0.5 → 右端高 0.5', '下半格实体；上半格空。'),
    ('C', '上半砖', [(0,.5),(1,.5),(1,1),(0,1)], '新增定义 · 未实现', '实体高 0.5；体积 0.5', '底面高 0.5；顶面高 1', '上半格实体；下半格空。'),
    ('D', '45° 右升坡', [(0,0),(1,0),(1,1)], '现行轮廓', '顶线 y = x；体积 0.5', '左端高 0 → 右端高 1', '宽 1 / 升高 1；斜线上方空。'),
    ('E', '45° 左升坡', [(0,0),(1,0),(0,1)], '现行轮廓', '顶线 y = 1 − x；体积 0.5', '左端高 1 → 右端高 0', 'D 的左右镜像；底边仍满宽。'),
    ('F', '右升缓坡 · 低段', [(0,0),(1,0),(1,.5)], '候选 · 未实现', '顶线 y = 0.5x；体积 0.25', '左端高 0 → 右端高 0.5', '宽 1 / 升高 0.5；约 26.6°。'),
    ('G', '右升缓坡 · 高段', [(0,0),(1,0),(1,1),(0,.5)], '候选 · 未实现', '顶线 y = 0.5 + 0.5x；体积 0.75', '左端高 0.5 → 右端高 1', '含下半格实体；不是悬空薄片。'),
    ('H', '左升缓坡 · 高段', [(0,0),(1,0),(1,.5),(0,1)], '候选 · 未实现', '顶线 y = 1 − 0.5x；体积 0.75', '左端高 1 → 右端高 0.5', 'G 的左右镜像；接 I 向右下降。'),
    ('I', '左升缓坡 · 低段', [(0,0),(1,0),(0,.5)], '候选 · 未实现', '顶线 y = 0.5 − 0.5x；体积 0.25', '左端高 0.5 → 右端高 0', 'F 的左右镜像；斜线上方为空。'),
    ('J', '双斜半格 · 尖顶', [(0,0),(1,0),(.5,.5)], '已确认 · 未实现', '顶线 y = min(x, 1−x)；体积 0.25', '两端高 0；中心顶高 0.5', '左右各宽 0.5；两坡均为 45°。'),
    ('K', '左半砖', [(0,0),(.5,0),(.5,1),(0,1)], '新增定义 · 未实现', '实体宽 0.5；体积 0.5', '左半格实体；右半格空', '宽 0.5 / 高 1 / 深 1。'),
    ('L', '右半砖', [(.5,0),(1,0),(1,1),(.5,1)], '新增定义 · 未实现', '实体宽 0.5；体积 0.5', '右半格实体；左半格空', '宽 0.5 / 高 1 / 深 1。'),
]
POLYS = {s[0]: s[2] for s in SHAPES}
POLYS.update({
    'M': [(0,0),(.5,0),(.5,.5),(0,.5)],
    'N': [(.5,0),(1,0),(1,.5),(.5,.5)],
    'O': [(0,.5),(.5,.5),(.5,1),(0,1)],
    'P': [(.5,.5),(1,.5),(1,1),(.5,1)],
})

def area(poly):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1])))/2

assert [area(s[2]) for s in SHAPES] == [1,.5,.5,.5,.5,.25,.75,.75,.25,.25,.5,.5]
assert all(0 <= v <= 1 for s in SHAPES for p in s[2] for v in p)
assert .5*1 == .5+.5*0 and 1-.5*1 == .5-.5*0
# The peak lies on the middle grid line; both faces meet there, without a flat crest.
assert POLYS['J'] == [(0,0),(1,0),(.5,.5)]
assert max(y for x,y in POLYS['J']) == .5
assert all(y <= .5 for code in ('B','F','I','J') for x,y in POLYS[code])
assert POLYS['F'][2][1] == POLYS['B'][3][1] == POLYS['I'][2][1]
assert set((1-x,y) for x,y in POLYS['K']) == set(POLYS['L'])
assert set((y,x) for x,y in POLYS['B']) == set(POLYS['K'])
assert set((x,1-y) for x,y in POLYS['B']) == set(POLYS['C'])
DEPTH = 1
assert DEPTH == 1

class Sheet:
    def __init__(self, height):
        self.im = Image.new('RGB', (2400,height), BG)
        self.d = ImageDraw.Draw(self.im)
    def text(self,x,y,value,size=27,color=INK):
        font=ImageFont.truetype(FONT,size)
        b=self.d.textbbox((x,y),value,font=font)
        assert b[0]>=0 and b[1]>=0 and b[2]<2385 and b[3]<self.im.height-12, (value,b)
        self.d.text((x,y),value,font=font,fill=color)
    def dash(self,a,b,color=GRID,width=2):
        length=math.dist(a,b)
        if length == 0:
            return
        for start in range(0,math.ceil(length),13):
            end=min(start+7,length)
            self.d.line([tuple(a[i]+(b[i]-a[i])*t/length for i in (0,1)) for t in (start,end)],fill=color,width=width)
    def panel(self,x,y,w,h):
        self.d.rounded_rectangle((x,y,x+w,y+h),16,fill='white',outline='#D8E1E5',width=2)
    def dim(self,a,b,label,tx,ty):
        self.d.line((a,b),fill=BLUE,width=2)
        angle=math.atan2(b[1]-a[1],b[0]-a[0])
        for p,ang in ((a,angle),(b,angle+math.pi)):
            for delta in (-.5,.5):
                self.d.line((p,(p[0]+10*math.cos(ang+delta),p[1]+10*math.sin(ang+delta))),fill=BLUE,width=2)
        self.text(tx,ty,label,23,BLUE)
    def front(self,poly,x,y,u):
        p=lambda a,b:(x+a*u,y-b*u)
        for a,b in [((0,0),(1,0)),((1,0),(1,1)),((1,1),(0,1)),((0,1),(0,0))]:self.dash(p(*a),p(*b))
        self.dash(p(0,.5),p(1,.5),'#D5DFE5')
        q=[p(*v) for v in poly]
        self.d.polygon(q,fill=FILL)
        self.d.line(q+q[:1],fill=BLUE,width=4)
    def wire(self,poly,x,y,u):
        # Oblique technical projection preserves XY lengths; Z is labelled rather than measured on paper.
        p=lambda a,b,z:(x+a*u+z*65,y-b*u-z*46)
        box=[(0,0),(1,0),(1,1),(0,1)]
        for z in (0,DEPTH):
            for a,b in zip(box,box[1:]+box[:1]):self.dash(p(*a,z),p(*b,z),'#C1CDD4')
        for a in box:self.dash(p(*a,0),p(*a,DEPTH),'#C1CDD4')
        for z in (DEPTH,0):
            q=[p(*v,z) for v in poly]
            self.d.line(q+q[:1],fill=BLUE,width=3)
        for a in poly:self.d.line((p(*a,0),p(*a,DEPTH)),fill=BLUE,width=3)
        self.dim(p(1.14,0,0),p(1.14,0,DEPTH),'深 1',x+u+34,y-7)
    def save(self,name):self.im.save(OUT/name)

# Rotations are around the logical cell center; they never rotate the depth axis.
def rotate(poly, turns):
    for _ in range(turns):
        poly = [(1-y,x) for x,y in poly]
    return poly

for base in ('F','I','J','G','H'):
    for turn in (1,2,3):
        POLYS[f'{base}-{turn*90}'] = rotate(POLYS[base],turn)
for base in ('D','E'):
    POLYS[f'{base}-U'] = [(x,1-y) for x,y in POLYS[base]]

EXISTING = {'A','B','D','E'}
CONFIRMED = {'C','K','L','F','I','J','M','N','O','P'}
STATUS = ('已有实现 · XY轮廓', '设计已确认 · 待实现', '可选参考 · 非必做')
def status(code):
    return STATUS[0] if code in EXISTING else STATUS[1] if code in CONFIRMED else STATUS[2]

GROUPS = [
    ('整砖与四向半砖', [('A','整砖'),('B','下半砖'),('C','上半砖'),('K','左半砖'),('L','右半砖')]),
    ('整格三角坡 · 四向', [('D','右下实体'),('E','左下实体'),('D-U','右上实体'),('E-U','左上实体')]),
    ('半尺寸单斜块 · 八向', [(code, name) for base,name0 in [('F','左侧斜坡'),('I','右侧斜坡')] for code,name in [(base,name0)]+[(f'{base}-{t*90}',f'{base} 逆时针 {t*90}°') for t in (1,2,3)]]),
    ('双斜尖顶 · 四向', [('J','朝上尖顶'),('J-90','朝左尖顶'),('J-180','朝下尖顶'),('J-270','朝右尖顶')]),
    ('缓坡高段 · 八向可选参考', [(code,name) for base,name0 in [('G','右升缓坡高段'),('H','左升缓坡高段')] for code,name in [(base,name0)]+[(f'{base}-{t*90}',f'{base} 逆时针 {t*90}°') for t in (1,2,3)]]),
    ('四分之一砖 · 四角', [('M','左下四分之一砖'),('N','右下四分之一砖'),('O','左上四分之一砖'),('P','右上四分之一砖')]),
]
entries = [(code,name) for _,group in GROUPS for code,name in group]
assert len(entries) == 33
assert len({tuple(sorted(POLYS[code])) for code,_ in entries}) == 33
for code,_ in entries:
    poly=POLYS[code]
    assert all(0 <= v <= 1 for point in poly for v in point)
    if '-' in code:
        assert area(poly) == area(POLYS[code.split('-')[0]])
    assert set(rotate(poly,4)) == set(poly)
for _,group in GROUPS:
    shapes = {tuple(sorted(POLYS[code])) for code,_ in group}
    for code,_ in group:
        assert tuple(sorted(rotate(POLYS[code],1))) in shapes
        assert tuple(sorted((1-x,y) for x,y in POLYS[code])) in shapes

OPTIONAL = {'D-U','E-U','G','H'}
def priority(code):
    return '1 必须做' if code in EXISTING | CONFIRMED else '2 选做' if code in OPTIONAL else '3 不重要'
PRIORITY_GROUPS = [
    ('1 必须做 · 基础范围 14 种', [(c,n) for c,n in entries if priority(c).startswith('1')]),
    ('2 选做 · 按需补充 4 种', [(c,n) for c,n in entries if priority(c).startswith('2')]),
    ('3 不重要 · 参考附录 15 种', [(c,n) for c,n in entries if priority(c).startswith('3')]),
]
assert [len(g) for _,g in PRIORITY_GROUPS] == [14,4,15]

def draw_atlas(groups,filename,title):
    height=300+sum(65+520*math.ceil(len(group)/4) for _,group in groups)+100
    s=Sheet(height)
    s.text(55,30,title,44)
    s.text(58,100,'按重要程度选形态：1 必须做 14 种｜2 选做 4 种｜3 不重要 15 种（见第三区）。',27,BLUE)
    s.text(58,148,'优先级与实现状态分开：必须做含 4 种已有轮廓、10 种待实现；选做与附录均未实现。',25,ORANGE)
    s.text(58,193,'XY 平面旋转；虚线是 1×1 逻辑格。宽高可减半，Z 深度固定为 1。',27,MUTED)
    s.text(58,239,'第 3 级不进入当前开发与验收清单；列出几何关系不代表必须支持。',27,ORANGE)
    y=300
    for group_name,group in groups:
        s.text(58,y,group_name,32,BLUE)
        y+=65
        for idx,(code,name) in enumerate(group):
            x,cy=50+(idx%4)*590,y+(idx//4)*520
            poly=POLYS[code]
            x0,x1=min(v[0] for v in poly),max(v[0] for v in poly)
            y0,y1=min(v[1] for v in poly),max(v[1] for v in poly)
            s.panel(x,cy,565,495)
            s.text(x+20,cy+18,f'{code}  {name}',28,BLUE)
            s.text(x+20,cy+63,priority(code),25,BLUE)
            s.text(x+220,cy+66,status(code),21,MUTED)
            s.text(x+20,cy+103,f'宽 {x1-x0:g} × 高 {y1-y0:g} × 深 1',26)
            s.text(x+32,cy+151,'XY 正视',22,MUTED)
            s.text(x+310,cy+130,'深度线框',22,MUTED)
            u=130
            s.front(poly,x+40,cy+330,u)
            s.dim((x+40+x0*u,cy+355),(x+40+x1*u,cy+355),f'宽 {x1-x0:g}',x+40+x0*u,cy+367)
            s.dim((x+188,cy+330-y0*u),(x+188,cy+330-y1*u),f'高 {y1-y0:g}',x+197,cy+255)
            s.wire(poly,x+317,cy+330,120)
            s.text(x+22,cy+410,f'位置 x={x0:g}～{x1:g} / y={y0:g}～{y1:g}',24)
            s.text(x+22,cy+453,f'实体体积 {area(poly):g}；蓝线外为留空区',24,MUTED)
        y+=520*math.ceil(len(group)/4)
    s.text(58,y+20,'现行支持仅指 XY 轮廓；新深度规则、放置、支撑与碰撞需单独实现和验收。',27,ORANGE)
    s.save(filename)
    return height

height=draw_atlas(PRIORITY_GROUPS,'building-shapes.png','02  格子形态｜1 必须做 / 2 选做 / 3 不重要')
draw_atlas(PRIORITY_GROUPS[2:],'building-shapes-appendix.png','03  不重要形态｜参考附录，不进入当前开发范围')
for index,group in enumerate(GROUPS):
    draw_atlas([group],f'building-shapes-family-{index+1}.png',group[0]+'｜按优先级选用')

import html
import json
blocks=[]
def heading(text): blocks.append(('heading',text))
def para(text): blocks.append(('para',text))
def table(headers,rows): blocks.append(('table',(headers,rows)))
heading('格子形态与支持范围定义')
para('资料日期：2026-10-10。本节完成几何形态与选型说明，不代表已完成运行时功能。图谱列全不是全量开发清单；可选参考不列入当前实现要求，旋转、镜像不自动要求支持。')
heading('1. 优先级与实现状态')
table(['级别','形态与数量','执行约定'],[
    ['1 必须做','14种：A/B/C/D/E/F/I/J/K/L/M/N/O/P','基础支持范围。已有4种XY轮廓；其余10种设计已确认待实现。必须做不代表已完成。'],
    ['2 选做','4种：D-U/E-U/G/H','倒置整格坡与左右缓坡高段。按屋檐、天花板或长缓坡需要选择，不阻塞基础范围验收。'],
    ['3 不重要','15种：F/I各3个旋转变体、J的3个旋转变体、G/H各3个旋转变体','仅为参考附录，不进入当前开发与验收清单。以后确有用途再重新定级。']])
para('下列分级根据目前已确认的基础设定整理，后续可调整。优先级回答先做什么，实现状态回答现在有没有，二者不能混用。')
table(['状态','编号','含义'],[
    ['已有实现 · XY轮廓','A、B、D、E','当前代码支持的四种二维轮廓。统一深度1属于新设计，不能据此声称游戏已同步。'],
    ['设计已确认 · 待实现','C、K、L、F、I、J、M、N、O、P','当前讨论确认的设计方向；几何定义已记录，但放置、碰撞与资源尚需实现及验收。'],
    ['可选参考 · 非必做','D-U、E-U；F/I/J的旋转变体；G/H及其旋转变体','共19种，仅供选择。需要先明确实际用途，再逐项决定是否实现。']])
heading('2. 坐标、尺寸与深度')
para('逻辑格为XY平面的1×1单元，X向右、Y向上。格内坐标x、y都在[0,1]；每个实体由本节表中的多边形顶点依次连接并闭合定义，再沿Z挤出1格。顶点表是精确实体范围，包围盒不表示全部填实。体积单位为格³。')
para('中间实体格深1，Z=[−0.5,+0.5]；内沿预留区为[−1,−0.5]，外延预留区为[+0.5,+1]，各额外留0.5格给花草和特殊物品。背景墙标准宽1×高1×厚0.2，XY完整覆盖一格、不缩边，位于外延预留区内，不嵌入实体砖，不再额外增加总深度。总空间带宽为2格。墙在外延区内的具体偏移未定，图中贴中间格外侧的放法仅为示意。')
para('上下半砖为1×0.5×1，左右半砖为0.5×1×1。半高坡旋转90°后变成半宽竖向坡，宽高互换，深度不变。后缀-90/-180/-270表示在XY平面内绕逻辑格中心逆时针旋转对应角度；-U表示沿y=0.5上下镜像。')
para('四分之一砖M/N/O/P均为0.5×0.5×1，正面占1/4格、体积0.25格³，分别位于左下、右下、左上、右上；其余3/4格留空。这里指宽高各半的方块，不是1×0.25薄条，也不是深度缩为1/4。F/I/J虽然体积同为0.25，但属于斜块，不能替代四分之一方砖。')
heading('3. 形态清单与精确轮廓')
para('总计33种：整砖1、矩形半砖4、四分之一砖4、整格三角坡4、半尺寸单斜块8、双斜尖顶4、缓坡高段8。A～L保留原编号，M/N/O/P为四角四分之一砖，后缀表示参考变体。')
for title,group in PRIORITY_GROUPS:
    heading(title)
    rows=[]
    for code,name in group:
        poly=POLYS[code]
        w=max(x for x,y in poly)-min(x for x,y in poly)
        h=max(y for x,y in poly)-min(y for x,y in poly)
        rows.append([code,name,priority(code),status(code),f'{w:g}×{h:g}×1',' → '.join(f'({x:g},{y:g})' for x,y in poly),f'{area(poly):g}'])
    table(['编号','形态','优先级','支持状态','宽×高×深','实体顶点（依次闭合）','体积'],rows)
heading('4. 半高坡与尖顶的区别')
para('F顶线y=0.5x，I顶线y=0.5−0.5x，坡角约26.6°。J顶线y=min(x,1−x)，尖顶位于(0.5,0.5)，两端落底；左右各宽0.5，两坡均为45°，没有平顶。J占一个格，不能与两个格宽的F+I混淆。')
para('G顶线y=0.5+0.5x，H顶线y=1−0.5x；高段包含下半格实体，体积0.75，不是悬空薄片。G/H以及全部旋转变体均为可选参考。倒置与侧向形态应按多边形定义，不能一律用从格底向上填充的顶高公式。')
heading('5. 结合、放置与外观边界')
para('一个逻辑格只选一种形态。不默认允许B+C、K+L或多个四分之一砖共占同格；几何互补不等于支持同格叠放。相邻格按整数坐标放置，Z前后沿分别齐平。')
para('地面组合：F+B+I在两处接缝都高0.5；J+J在格边界的高度为0，形成坡谷；J接B有0.5高差。可选缓坡组合F+G在接缝处高0.5，两格升高1；H+I为下降镜像。端点连续不代表已验证角色可通行。')
para('倒置和侧向组合需比较共同边上的实际实体区间，不能只比较顶高。部分接触、尖点接触和空隙须分别识别，不自动算作完整支撑。内部面仅在确被邻格实体遮挡时隐藏；暴露面、坡面及留空区保留。背景墙不填补实体缺口。此处是几何与美术约束，具体放置和支撑算法尚未定稿。')
para('门侧半格是安装范围，不等于门框必须填满半砖；门仍单独定义净洞3格、上方1格高一体门沿。家具、装饰和单向平台不因外观相似就使用实心半砖碰撞。')
heading('6. 实现范围与验收约定')
para('当前只完成资料定义。第1级为基础必须支持范围，第2级按需选做，第3级不进入当前开发与验收清单；本资料不要求一次加入全部33种。决定支持某形态时，再明确放置条件、支撑规则、碰撞轮廓和材质收边，并检查游戏与展示场复用同一份定义。')
para('已有实现依据src/world/tile-shapes.ts中的FULL、SLOPE_R、SLOPE_L、HALF。待定项：新形态的实现优先级、倒置与侧向碰撞、支撑条件、同格组合、相邻材质收边。四分之一砖M/N/O/P已纳入基础定义；曲面、凹槽不在本次范围。')
para('给LLM的使用约定：先读取优先级及支持状态，再讨论实现；第3级不得进入当前开发与验收范围；不得把“可选参考”提升为必做需求，不得把设计已确认说成已经实现，不得改变1格深度或把半宽与半高混淆。图片本体需另行附上，本地链接无法供远程LLM直接访问。')

markdown=[]; markup=[]; appendix_open=False
for kind,content in blocks:
    if kind=='heading':
        markdown.append('## '+content)
        if content.startswith('3 不重要'):
            markup.append('<details open><summary>3 不重要 · 15种参考形态（不进入当前开发范围）</summary>')
            appendix_open=True
        elif appendix_open:
            markup.append('</details>')
            appendix_open=False
        markup.append('<h3>'+html.escape(content)+'</h3>')
    elif kind=='para':
        markdown.append(content)
        markup.append('<p>'+html.escape(content)+'</p>')
    else:
        headers,rows=content
        markdown.append('\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(row)+' |' for row in rows]))
        markup.append('<div class="concepts-table-scroll"><table><thead><tr>'+''.join('<th>'+html.escape(c)+'</th>' for c in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(c)+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>')
md='\n\n'.join(markdown)+'\n\n三级形态总图：/concepts/building-shapes.png\n优先级3附图：/concepts/building-shapes-appendix.png\n拼接示例：/concepts/building-joins.png\n'
(ROOT/'docs/tile-shape-definitions.md').write_text(md)
(OUT/'tile-shape-definitions.md').write_text(md)
(ROOT/'src/ui/concept-tile-shapes.ts').write_text('// Generated by draw_shape_definitions.py; edit the source definitions there.\nexport const TILE_SHAPE_DOCUMENT = '+json.dumps('\n'.join(markup),ensure_ascii=False)+';\n')

j=Sheet(2910)
j.text(55,35,'03  格子结合｜先对齐格点，再检查接缝高度',48)
j.text(58,109,'下面均为 XY 正视图；每个单元宽 1、高 1，实体沿同一个 Z 区间挤出 1。编号沿用形态图；组合含可选项时不代表必须实现。',27,MUTED)
j.text(58,155,'接缝高度相同可形成连续表面；端点不等就是台阶。一个逻辑格只放一种形态。',27,BLUE)

def cells(x,y,items,u=130):
    for code,cx,cy in items:
        j.front(POLYS[code],x+cx*u,y-cy*u,u)
        j.text(x+cx*u+u*.41,y-cy*u+14,code,25,BLUE)
    for left,right in zip(items,items[1:]):
        assert (left[1],left[2]) != (right[1],right[2])

cases=[
 ('01  整砖平接', [('A',0,0),('A',1,0),('A',2,0),('A',3,0)],
  'A + A：共同边界完整贴合；顶面高度均为 1。',
  '位置按整数格对齐；没有缝隙，也没有重叠。'),
 ('02  下半砖接整砖：半格台阶', [('B',0,0),('B',1,0),('A',2,0),('A',3,0)],
  'B → A：顶面从 0.5 跳到 1；台阶高 0.5。',
  '这是硬台阶，不能标成连续斜坡或自动可行走。'),
 ('03  右升缓坡：低段 + 高段', [('F',0,0),('G',1,0),('A',2,0)],
  'F 右端 0.5 = G 左端 0.5；两格宽升高 1。',
  '可选参考：含 G；F 与 G 是两个相邻逻辑格。'),
 ('04  左升缓坡：镜像组合', [('A',0,0),('H',1,0),('I',2,0)],
  'H 右端 0.5 = I 左端 0.5；向右连续下降。',
  '可选参考：含 H；不能重复两个 F 代替 F+G。'),
 ('05  全坡接整砖', [('D',0,0),('A',1,0),('A',2,0),('E',3,0)],
  'D 右端 1 = A 顶高 1；A 接 E 也连续。',
  '全部单元在同一行；两侧落到该行的格底。'),
 ('06  坡顶与坡谷', [('D',0,0),('E',1,0),('D',2,0),('E',3,0)],
  'D + E 在顶点 1 相接；E + D 在谷底 0 相接。',
  '端点连续但坡度突变；角色通行仍需碰撞验证。'),
]
for idx,(title,items,line1,line2) in enumerate(cases):
    col,row=idx%2,idx//2
    x,y=50+col*1180,220+row*515
    j.panel(x,y,1150,490)
    j.text(x+28,y+25,title,34,BLUE)
    cells(x+190,y+303,items)
    j.text(x+28,y+377,line1,27)
    j.text(x+28,y+431,line2,26,ORANGE if idx in (2,3) else MUTED)

x,y=50,1765
j.panel(x,y,1150,505)
j.text(x+28,y+25,'07  上半砖：只定义轮廓，不定义叠放',33,BLUE)
cells(x+190,y+295,[('C',0,0),('C',1,0),('A',2,0)])
j.text(x+28,y+367,'C + C：顶部齐平，下方留下 0.5 高空区。',27)
j.text(x+28,y+419,'新增定义；不等于允许 B 与 C 共占同一个格。',26,ORANGE)
j.text(x+28,y+461,'若需要同格叠放，必须另外定义存储与碰撞规则。',25,MUTED)
x=1230
j.panel(x,y,1150,505)
j.text(x+28,y+25,'08  深度对齐：所有实体同宽度带',33,BLUE)
j.text(x+30,y+96,'俯视 XZ：以下 Z 原点只是标尺，不指定墙体位置。',25,MUTED)
u=140
for n in range(4):
    j.d.rectangle((x+235+n*u,y+160,x+235+(n+1)*u,y+300),fill=FILL,outline=BLUE,width=3)
    j.text(x+279+n*u,y+215,str(n+1),26,BLUE)
j.text(x+110,y+149,'Z = 1',25,MUTED)
j.text(x+110,y+279,'Z = 0',25,MUTED)
j.dim((x+833,y+160),(x+833,y+300),'深 1',x+850,y+216)
j.text(x+28,y+367,'沿 X 平接时，前沿与后沿分别齐平。',27)
j.text(x+28,y+419,'半砖、斜坡也保持这一段完整深度。',26,BLUE)
j.text(x+28,y+461,'不能为接缝错开 Z，也不能把上半格空区填成实体。',25,MUTED)
for col,(title,items,line1,line2) in enumerate([
    ('09  半高平顶：左斜 + 平顶 + 右斜', [('F',0,0),('B',1,0),('I',2,0)],
     'F + B + I：两处接缝均高 0.5，整体最高 0.5。',
     '这是三个格拼成的平台；不是单格双斜 J。'),
    ('10  双斜半格：单格尖顶与连续坡谷', [('J',0,0),('J',1,0),('J',2,0)],
     '每个 J 的尖顶在格内中心；格间接缝高 0。',
     '单个 J 宽 1、高 0.5、深 1；坡谷通行待验证。'),
]):
    x,y=50+col*1180,2300
    j.panel(x,y,1150,490)
    j.text(x+28,y+25,title,32,BLUE)
    cells(x+190,y+303,items)
    j.text(x+28,y+377,line1,27)
    j.text(x+28,y+431,line2,26,MUTED)
j.text(58,2838,'这些图定义几何组合，不替代角色碰撞与建筑放置规则；新候选形态尚未加入游戏。',28,ORANGE)
j.save('building-joins.png')
print(f'Generated 33 profiles, atlas 2400×{height}, six family sheets and definition documents; geometry assertions passed.')
