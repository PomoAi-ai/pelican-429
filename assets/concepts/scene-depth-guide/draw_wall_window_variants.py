"""Four-cell window assembly and diagonal wall/window profiles, in grid units."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
im = Image.new('RGB', (2400, 3300), '#F5F3EE')
d = ImageDraw.Draw(im)
INK, BLUE, GREEN, ORANGE = '#263C49', '#326BB0', '#528269', '#B66C2F'
B = .1

def text(x,y,value,size=27,color=INK):
    f = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',size)
    box = d.textbbox((x,y),value,font=f)
    assert box[0]>=0 and box[2]<2390 and box[3]<3290,(value,box)
    d.text((x,y),value,font=f,fill=color)

def line(a,b,color=GREEN,width=3):
    d.line((a,b),fill=color,width=width)

def loop(points,color=GREEN,width=3):
    d.line(points+points[:1],fill=color,width=width)

def dash(a,b):
    length=math.dist(a,b)
    for i in range(0,math.ceil(length),14):
        line(tuple(a[j]+(b[j]-a[j])*i/length for j in (0,1)),
             tuple(a[j]+(b[j]-a[j])*min(i+7,length)/length for j in (0,1)), '#AABAC3',2)

def panel(x,y,w,h):
    d.rounded_rectangle((x,y,x+w,y+h),16,fill='white',outline='#D7E0E4',width=2)

def rect(x0,y0,x1,y1):
    return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]

def front(x,y,u,polys,n=1,colors=None):
    p=lambda a,b:(x+a*u,y-b*u)
    for i in range(n+1):
        dash(p(i,0),p(i,n));dash(p(0,i),p(n,i))
    for i,poly in enumerate(polys):
        pts=[p(*v) for v in poly]
        d.polygon(pts,fill=colors[i] if colors else '#DAB079')
        loop(pts,ORANGE if not colors else GREEN)
    return p

def perspective(x,y,u,polys,n=1):
    # A single camera projects all parts. Z=.5/.7 is illustrative placement only.
    p=lambda a,b,z:(x+u*6*((a-n-1)/(6-z)+(n+1)/5.3),
                    y-u*6*((b-n-1)/(6-z)+(n+1)/5.3))
    for poly in polys:
        loop([p(a,b,.5) for a,b in poly], '#9AAFB7',2)
        for a,b in poly:line(p(a,b,.5),p(a,b,.7),GREEN,2)
    for poly in polys:loop([p(a,b,.7) for a,b in poly],GREEN)
    assert math.isclose(math.dist(p(0,0,.7),p(1,0,.7)),math.dist(p(0,0,.7),p(0,1,.7)))
    return p

def area(poly):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])))/2

def clip(poly,axis,value,sign):
    result=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=(a[axis]-value)*sign;db=(b[axis]-value)*sign
        if da>=0:result.append(a)
        if (da<0 and db>0) or (da>0 and db<0):
            t=da/(da-db)
            result.append(tuple(a[j]+(b[j]-a[j])*t for j in (0,1)))
    return result

def cell_parts(polys,x,y):
    parts=[]
    for poly in polys:
        for axis,value,sign in ((0,x,1),(0,x+1,-1),(1,y,1),(1,y+1,-1)):
            poly=clip(poly,axis,value,sign)
        if len(poly)>=3 and area(poly)>1e-9:parts.append(poly)
    return parts

# Each local tile contributes only its two outside frame edges.
base=[(0,0),(1,0),(1,B),(B,B),(B,1),(0,1)]
orientations=[('左上','TL',0,1),('右上','TR',1,1),('左下','BL',0,0),('右下','BR',1,0)]
local={code:[(1-x if cx else x,1-y if cy else y) for x,y in base]
       for _,code,cx,cy in orientations}
assembled=[[(x+cx,y+cy) for x,y in local[code]] for _,code,cx,cy in orientations]
assert math.isclose(sum(map(area,assembled)),4-(2-2*B)**2)

text(55,30,'窗口拼块与斜角｜四块组成一个大窗',44)
text(60,105,'每块占 1×1 格；所有墙片与窗框深度 0.2。b=0.1、斜切 c=0.5 是绘图草案。',28,BLUE)
text(60,155,'本次明确补充：四角窗块、四向 45° 斜墙、四角斜切窗。不是四个各自封闭的小窗。',27,ORANGE)

for i,(name,code,cx,cy) in enumerate(orientations):
    x,y=45+i*590,225
    panel(x,y,565,510)
    text(x+22,y+20,'W2-'+code+'  '+name+'窗角',31,BLUE)
    text(x+22,y+75,'1 必须做 · 每块 1×1',25,ORANGE)
    front(x+35,y+320,165,[local[code]])
    perspective(x+315,y+320,130,[local[code]])
    text(x+30,y+355,'正面方格',24);text(x+310,y+355,'线框 · 深0.2',24)
    text(x+22,y+415,'仅外侧两边带框；内侧两边敞开',24)
    text(x+22,y+465,'朝向由在窗口中的位置决定',24,GREEN)

panel(45,775,2310,740)
text(80,800,'拼接结果｜TL + TR + BL + BR → 一个 2×2 大窗',35,BLUE)
front(140,1350,185,assembled,2)
text(150,910,'无窗棂 · 连通净洞 1.8×1.8',28)
text(185,1380,'宽 2 格 × 高 2 格',26,ORANGE)
front(920,1350,185,assembled,2)
for r in (rect(.96,B,1.04,2-B),rect(B,.96,2-B,1.04)):
    pts=[(920+a*185,1350-b*185) for a,b in r]
    d.polygon(pts,fill='#57798B')
text(905,910,'加十字窗棂 · 对应参考图',28)
text(855,1390,'2 选做；宽0.08仅为示意，不是格界框',25)
perspective(1690,1350,175,assembled,2)
text(1690,910,'同一个大窗的线框透视',28)
text(1740,1400,'整体深度仍为 0.2',26,ORANGE)
text(85,1460,'灰色虚线是格界；内部拼接边不封洞。窗棂是额外构件，不是四块窗角拼接后必须出现的边框。',27)

text(60,1550,'W7 四向 45° 斜墙｜本次加入基础形态；每块仍占 1×1，深 0.2',33,BLUE)
triangles=[('左下实心',[(0,0),(1,0),(0,1)]),('右下实心',[(0,0),(1,0),(1,1)]),
           ('左上实心',[(0,0),(1,1),(0,1)]),('右上实心',[(1,0),(1,1),(0,1)])]
for i,(name,poly) in enumerate(triangles):
    x,y=45+i*590,1620;panel(x,y,565,440)
    text(x+25,y+20,'W7-'+str(i+1)+'  '+name,30,BLUE)
    front(x+40,y+295,150,[poly],colors=['#D7E5D8'])
    perspective(x+330,y+295,125,[poly])
    text(x+25,y+335,'沿单格对角线切开；实心面积 0.5',24)
    text(x+25,y+385,'用于斜边收口；不是实体地形坡',24,GREEN)
    assert math.isclose(area(poly),.5)

# Equal perpendicular frame width on both straight and 45-degree edges.
C=.5
outer=[(C,0),(2-C,0),(2,C),(2,2-C),(2-C,2),(C,2),(0,2-C),(0,C)]
Q=C+B*(math.sqrt(2)-1)
inner=[(Q,B),(2-Q,B),(2-B,Q),(2-B,2-Q),(2-Q,2-B),(Q,2-B),(B,2-Q),(B,Q)]
ring=[[outer[i],outer[(i+1)%8],inner[(i+1)%8],inner[i]] for i in range(8)]
corners=[[(0,0),(C,0),(0,C)],[(2,0),(2,C),(2-C,0)],
         [(2,2),(2-C,2),(2,2-C)],[(0,2),(0,2-C),(C,2)]]
solid=corners+ring
parts=[cell_parts(solid,cx,cy) for _,_,cx,cy in orientations]
assert math.isclose(sum(area(p) for cell in parts for p in cell)+area(inner),4)
assert math.isclose((inner[0][0]+inner[0][1]-C)/math.sqrt(2),B)

panel(45,2110,2310,1110)
text(80,2140,'W8 斜角窗口｜仍由四块 1×1 拼成 2×2，大窗四角各切 45°',34,BLUE)
text(85,2205,'c=0.5 表示每个外角沿两条边各量 0.5；四角保留三角墙片，斜边接窗框。不是缩小整块墙。',27)
for (name,code,cx,cy),polys in zip(orientations,parts):
    x=155+cx*200;y=2830-cy*200
    local_parts=[[(a-cx,b-cy) for a,b in poly] for poly in polys]
    # The corner triangle is first in each clipped cell; frame pieces follow.
    front(x,y,165,local_parts,colors=['#D7E5D8']+['#DAB079']*(len(polys)-1))
    text(x+40,y+12,code,23,BLUE)
text(135,2310,'四块分开：每块留一个斜角',28)
text(140,2910,'间距仅为拆解展示；安装时贴齐',25)
front(910,2830,180,solid,2,colors=['#D7E5D8']*4+['#DAB079']*8)
text(885,2310,'合起来：一个八边形净洞',28)
text(920,2910,'四块共占 2×2；中间不封边',25)
perspective(1700,2830,165,solid,2)
text(1680,2310,'完整线框：厚度不随斜角变化',28)
text(1740,2910,'宽2 × 高2 × 深0.2',25,ORANGE)
text(85,3030,'矩形窗四角是 L 形框；斜角窗四角是“三角墙片 + 斜窗框”。W7半格斜墙不能直接替代W8窗角。',27)
text(85,3090,'基础只列这四个方向与一种对称斜角窗；任意斜角、曲线、破损轮廓不自动扩成必做。',27,ORANGE)
text(85,3150,'窗框正面边宽沿斜边法线保持 b=0.1（草案），不是沿 X/Y 各缩0.1；玻璃与窗棂仍选做。',27)
text(60,3250,'资料定义，尚未实现。所有模块同一 Z 偏移，窗口区域不再生成完整墙；单独完整小窗仍使用 W2 整框形式。',25)
im.save(ROOT/'public/concepts/wall-window-variants.png')
print('Created wall-window-variants.png; four-part areas, diagonal offset and projection assertions passed.')
