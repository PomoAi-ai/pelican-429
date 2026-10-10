"""A window in a complete tiled wall: elevation, construction, and perspective."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
im = Image.new('RGB', (2400, 2540), '#F5F3EE')
d = ImageDraw.Draw(im)
INK, GREEN, BLUE, ORANGE = '#263C49', '#528269', '#326BB0', '#B66C2F'
W, H, B = 8, 5, .1
WINDOW = (2, 2, 5, 4)
HOLE = (2+B, 2+B, 5-B, 4-B)

def text(x, y, value, size=28, color=INK):
    font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', size)
    bounds = d.textbbox((x, y), value, font=font)
    assert 0 <= bounds[0] and bounds[2] < 2385 and bounds[3] < 2530, (value, bounds)
    d.text((x, y), value, font=font, fill=color)

def line(a, b, color=GREEN, width=3):
    d.line((a, b), fill=color, width=width)

def dashed(a, b, color='#9AABB5'):
    length = math.dist(a, b)
    for i in range(0, math.ceil(length), 15):
        line(tuple(a[j]+(b[j]-a[j])*i/length for j in (0, 1)),
             tuple(a[j]+(b[j]-a[j])*min(i+7, length)/length for j in (0, 1)), color, 2)

def corners(r):
    x0, y0, x1, y1 = r
    return [(x0,y0), (x1,y0), (x1,y1), (x0,y1)]

def polygon(points, color, outline=GREEN):
    d.polygon(points, fill=color)
    d.line(points+points[:1], fill=outline, width=3)

def panel(x, y, w, h):
    d.rounded_rectangle((x,y,x+w,y+h), 16, fill='white', outline='#D7E0E4', width=2)

def dim(a, b, label, pos):
    line(a,b,ORANGE,2)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    for p,q in ((a,angle),(b,angle+math.pi)):
        for r in (-.45,.45):
            line(p,(p[0]+12*math.cos(q+r),p[1]+12*math.sin(q+r)),ORANGE,2)
    text(*pos,label,25,ORANGE)

def bands(outer, inner):
    x0,y0,x1,y1 = outer
    a,b,c,e = inner
    return [(x0,y0,x1,b), (x0,e,x1,y1), (x0,b,a,e), (c,b,x1,e)]

def wall(p, opening=True, frame=True, guides=False):
    # Omit the window cells entirely; the perimeter frame is a separate region.
    for y in range(H):
        for x in range(W):
            if opening and 2 <= x < 5 and 2 <= y < 4:
                continue
            polygon([p(a,b) for a,b in corners((x,y,x+1,y+1))], '#DCE8DB', '#95AC9A')
    if opening and frame:
        for r in bands(WINDOW, HOLE):
            polygon([p(a,b) for a,b in corners(r)], '#DBAA69', ORANGE)
    if guides:
        for x in (3,4): dashed(p(x,2+B),p(x,4-B))
        dashed(p(2+B,3),p(5-B,3))

text(60,35,'在一大面墙上开窗｜完整墙面中的 3×2 矩形窗',46)
text(60,110,'示例墙面 8×5 格；每格 1×1，墙厚 0.2。尺寸用于说明制作方式，不是房间或窗口的固定规格。',28,BLUE)
text(60,160,'绿色是墙，橙色是窗框，白色是贯穿开口；窗框边宽 b=0.1 为草案。',28,ORANGE)

panel(45,225,2310,1040)
text(80,255,'A  正面方格图｜窗口放在整面墙里面',35,BLUE)
p = lambda x,y: (220+x*155,1150-y*155)
wall(p,guides=True)
dim(p(0,5.3),p(8,5.3),'整面墙宽 8 格',(730,288))
dim(p(-.35,0),p(-.35,5),'高 5 格',(62,720))
dim(p(2,1.7),p(5,1.7),'窗区域宽 3 格',(585,900))
dim(p(5.25,2),p(5.25,4),'高 2 格',(1060,660))
text(590,674,'净洞 2.8×1.8',29,BLUE)
text(1540,410,'位置示例（左下角为原点）',30)
text(1540,470,'窗区域：X=2～5，Y=2～4',28)
text(1540,530,'窗下保留 2 格墙；窗上 1 格墙',28)
text(1540,590,'左侧 2 格墙；右侧 3 格墙',28)
text(1540,685,'40 个墙格 → 34 格整墙',32,GREEN)
text(1540,745,'另外 6 格统一归属这个窗口',28)
text(1540,830,'外周一圈框，内部不留格框',30,ORANGE)
text(1540,890,'灰色虚线是标尺，不是窗棂',27)
text(1540,975,'标准墙格没有缩小或留缝',28,GREEN)
text(1540,1035,'墙深与窗框深均为 0.2',28)
text(90,1200,'这是背景墙开窗示例，不是实体砖侧墙的门洞；地形层、人物通行与房间判定另外定义。',28)

panel(45,1300,2310,300)
text(80,1325,'B  制作顺序｜完整墙 → 选区 → 真正挖空 → 装框',34,BLUE)
for x,title,one,two in [
    (85,'① 铺墙','用 1×1 墙格铺满 8×5。','所有墙块同一 Z 偏移。'),
    (665,'② 选窗口区域','选左下角 (2,2)，宽3高2。','将 6 格归为一个窗口。'),
    (1245,'③ 去掉选区墙体','6 格不再生成完整墙面。','洞贯穿整段 0.2 深度。'),
    (1825,'④ 生成一圈框','只在 3×2 的外周留框。','玻璃 / 窗棂按需另加。')]:
    text(x,1410,title,31,ORANGE)
    text(x,1470,one,25)
    text(x,1520,two,25)

panel(45,1640,2310,825)
text(80,1665,'C  同一面墙的线框透视｜前后边界同尺寸，纵深边共用消失点',34,BLUE)
# Fixed pinhole camera: only Z changes projection scale; X and Y use equal units.
def project(x,y,z):
    return (215+105*14*((x-11)/(14-z)+11/13.3),
            2380-105*14*((y-8)/(14-z)+8/13.3))

outer = corners((0,0,W,H))
inner = corners(HOLE)
for shape in (outer,inner):
    back = [project(x,y,.5) for x,y in shape]
    for a,b in zip(back,back[1:]+back[:1]): dashed(a,b)
    # Front faces drawn below hide the side faces that should not be visible.
    for a,b in zip(shape,shape[1:]+shape[:1]):
        polygon([project(*a,.5),project(*b,.5),project(*b,.7),project(*a,.7)], '#BACABA')
wall(lambda x,y:project(x,y,.7))
for shape in (outer,inner):
    points = [project(x,y,.7) for x,y in shape]
    d.line(points+points[:1], fill=GREEN, width=4)
text(1190,1810,'窗洞切穿前后两个面',31,GREEN)
text(1190,1870,'内侧洞口有 0.2 深的侧面',28)
text(1190,1960,'Z 示意：+0.5 到 +0.7',28)
text(1190,2020,'具体偏移未定；墙与框始终对齐',27)
text(1190,2110,'透视厚度按真实比例绘制',30,BLUE)
text(1190,2170,'不为看清而把薄墙画成深箱子',27)
dim(project(8.18,0,.5),project(8.18,0,.7),'厚 0.2',(1050,2410))
text(1190,2280,'可选玻璃：放在洞内的厚度包络中',27,ORANGE)
text(1190,2330,'不能贴在一面未挖空的完整墙上',27)
text(60,2490,'定义方案，尚未实现游戏建造。图中未安装玻璃和窗棂；有玻璃时应明确标注“玻璃窗”。',26)

assert sum(not (2<=x<5 and 2<=y<4) for x in range(W) for y in range(H)) == 34
area = lambda r: (r[2]-r[0])*(r[3]-r[1])
assert math.isclose(sum(map(area,bands(WINDOW,HOLE)))+area(HOLE),6)
for z in (.5,.7):
    assert math.isclose(math.dist(project(0,0,z),project(1,0,z)),
                        math.dist(project(0,0,z),project(0,1,z)))
im.save(ROOT/'public/concepts/wall-window-construction.png')
print('Created wall-window-construction.png; cell count, aperture area and projection checks passed.')
