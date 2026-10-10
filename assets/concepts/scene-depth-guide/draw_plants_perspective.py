"""Draw measured depth sections and the actual frontal camera projection with Pillow."""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/concepts/plants-distant-perspective.png'
W, H = 2400, 2200
BG, INK, MUTED = '#f6f4eb', '#1c3447', '#657681'
GREEN, ORANGE, LINE = '#438660', '#c37a2e', '#d4dcd6'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
im = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(im)
text_bounds = []

def font(n): return ImageFont.truetype(FONT, n)
def text(x, y, s, size=29, fill=INK):
    box = d.textbbox((x,y), s, font=font(size))
    assert 0 <= box[0] <= box[2] <= W and 0 <= box[1] <= box[3] <= H, (s, box)
    text_bounds.append(box)
    d.text((x,y),s,font=font(size),fill=fill)
def paragraph(x,y,s,width,size=29,fill=MUTED,leading=11):
    line=''
    for c in s:
        if c=='\n' or d.textlength(line+c,font=font(size))>width:
            text(x,y,line,size,fill);y+=size+leading;line=''
            if c=='\n':continue
        line+=c
    if line:text(x,y,line,size,fill);y+=size+leading
    return y

def panel(box,label,title):
    x,y,x2,y2=box
    d.rounded_rectangle(box,20,fill='#fffef9',outline=LINE,width=2)
    d.rounded_rectangle((x+25,y+23,x+82,y+77),12,fill=INK)
    text(x+40,y+30,label,34,'#ffffff');text(x+102,y+29,title,37)
def arrow(a,b,fill=INK,width=3,head=12):
    d.line((a,b),fill=fill,width=width)
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    d.polygon([b,(b[0]-head*math.cos(angle-.5),b[1]-head*math.sin(angle-.5)),(b[0]-head*math.cos(angle+.5),b[1]-head*math.sin(angle+.5))],fill=fill)
def dashed(a,b,fill=ORANGE,width=3,dash=10):
    length=math.dist(a,b)
    if not length:return
    for t in range(0,int(length),dash*2):
        p=t/length;q=min(t+dash,length)/length
        d.line(((a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p),(a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q)),fill=fill,width=width)
def plant(x,y,h,flower=False):
    d.line((x,y,x-3,y-h),fill=GREEN,width=5)
    for side,v in [(-1,.35),(1,.55),(-1,.7)]:
        yy=y-h*v
        d.ellipse((x-22 if side<0 else x,yy-11,x if side<0 else x+22,yy+4),fill=GREEN)
    if flower:
        for a in range(0,360,60):
            xx=x+math.cos(math.radians(a))*10; yy=y-h+math.sin(math.radians(a))*10
            d.ellipse((xx-8,yy-8,xx+8,yy+8),fill='#ecc878')
        d.ellipse((x-6,y-h-6,x+6,y-h+6),fill=ORANGE)

text(55,30,'植物与远景｜真实前后关系与正面透视',54)
text(58,103,'2D 玩法：X / Y 移动与碰撞；3D 表现：Z 只描述前后位置。以下是当前实现，不是新尺寸规范。',29,MUTED)

panel((50,165,1485,860),'A','侧剖面：所有深度共用这一把 Z 标尺')
text(85,262,'左侧远离镜头，右侧靠近镜头；Y 高度仅示意，Z 按比例。',28,MUTED)
zx=lambda z:430+(z+1)*620
# Every interval and reference in this panel uses zx, including the ground section.
for z in [-1,-.75,-.5,-.25,0,.25,.5]:
    dashed((zx(z),335),(zx(z),812),'#dde4de',2,6)
d.rectangle((zx(-1),384,zx(.5),429),fill='#c8a77a',outline='#927e62',width=2)
d.rectangle((zx(-1),375,zx(.5),387),fill='#84aa69')
for z,h,f in [(-.78,48,True),(-.56,64,True),(-.31,40,False),(.09,24,False)]:plant(zx(z),375,h,f)
d.line((zx(-1.01),329,zx(-1.01),429),fill='#67889d',width=5)
text(85,333,'洞穴背景墙 −1.01',25,'#67889d')
arrow((345,362),(zx(-1.01)-7,362),'#67889d',2)
text(85,393,'地形 [−1, +0.5]',27)
dashed((zx(0),320),(zx(0),812),ORANGE,3)
text(zx(0)-60,300,'玩法平面 0',25,ORANGE)
arrow((zx(-1.04),463),(zx(.54),463))
for z in [-1,-.75,-.5,-.25,0,.25,.5]:
    d.line((zx(z),455,zx(z),471),fill=INK,width=2)
    label=f'{z:+g}' if z else '0'
    text(zx(z)-d.textlength(label,font=font(23))/2,480,label,23)
text(1416,474,'Z',25)
bands=[('普通花草',-.85,.2,'#6e9d72'),('低矮地被',-.83,.4,'#a3bd75'),('树中心',-.7,-.7,'#7b6550'),('树最前沿上限',-.1,-.1,'#7b6550')]
for i,(name,lo,hi,color) in enumerate(bands):
    yy=554+i*64
    text(85,yy-7,name,27)
    label=f'{lo:+g} ～ {hi:+g}' if lo!=hi else (f'≤ {hi:+g}' if i==3 else f'{lo:+g}')
    if lo!=hi:
        d.rectangle((zx(lo),yy,zx(hi),yy+18),fill=color)
        text(zx(lo)+8,yy+23,label,22,MUTED)
    else:
        d.ellipse((zx(lo)-7,yy+2,zx(lo)+7,yy+16),fill=color)
        if i==3:arrow((zx(lo)-105,yy+9),(zx(lo)-15,yy+9),color,2)
        text(zx(lo)+18,yy-6,label,24,color)
text(85,817,'这些是分布范围；不代表植物填满整条带，也不增加沿 Z 行走的玩法。',26,MUTED)

panel((1520,165,2350,860),'B','正面轮廓：保留清楚的落脚线')
text(1555,263,'植物形状仅示意；不按这张图定树高。',26,MUTED)
ground=678
# Frontal silhouette: no oblique platform or invented depth axis.
d.rectangle((1580,ground,2290,ground+50),fill='#c8a77a')
d.line((1580,ground,2290,ground),fill=GREEN,width=7)
d.line((1870,ground,1860,482,1770,399),fill='#806348',width=34)
d.line((1860,540,1980,415),fill='#806348',width=24)
for x,y,rx,ry,c in [(1725,400,97,58,'#739b70'),(1820,352,119,64,'#8caf7b'),(1990,396,120,72,'#648e68'),(1870,438,129,67,'#4f815c')]:
    d.ellipse((x-rx,y-ry,x+rx,y+ry),fill=c)
for x,h,f in [(1620,53,True),(1680,76,True),(2030,64,True),(2110,40,False),(2220,29,False)]:plant(x,ground,h,f)
dashed((1870,ground),(1870,ground+40),'#806348',5,7)
text(1560,755,'树根埋深 0.40 格；前排低草减少遮脚。',27)
text(1560,801,'树叶、枝干有体积；正面不等于平面贴片。',26,MUTED)

panel((50,895,2350,1450),'C','真实相机的透视幅度：前后只相差约 5.1%')
text(85,988,'同一块 1 × 1 砖的前后截面 · 局部放大 16 倍',27,MUTED)
# Exact pinhole projection at the actual 30-unit camera distance and 30-degree FOV.
fov=30;distance=30;front_z=.5;back_z=-1
focal=320/(2*math.tan(math.radians(fov/2)))
zoom=16
front_size=focal/(distance-front_z)*zoom
back_size=focal/(distance-back_z)*zoom
ratio=(distance-back_z)/(distance-front_z)
vp=(1050,1165)
near=[(140,1050),(140+front_size,1050),(140+front_size,1050+front_size),(140,1050+front_size)]
far=[(vp[0]+(x-vp[0])/ratio,vp[1]+(y-vp[1])/ratio) for x,y in near]
d.polygon(near,fill='#e8efe2',outline=GREEN,width=4)
for a,b in zip(near,far):
    d.line((a,b),fill=INK,width=3)
    dashed(b,vp,'#cbd4cb',2,9)
for i in range(4):dashed(far[i],far[(i+1)%4],ORANGE,3,8)
d.ellipse((vp[0]-6,vp[1]-6,vp[0]+6,vp[1]+6),fill=INK)
text(670,1080,'Z 方向延长线 → 画面中心',25,MUTED)
text(678,1250,'水平边仍水平',25,MUTED)
text(678,1290,'竖直边仍竖直',25,MUTED)
text(145,1387,'绿色实线：前 +0.5    棕色虚线：后 −1',25)
paragraph(1220,995,'正面镜头：距离 30 格，垂直视角 30°。砖前面距镜头 29.5 格，后面距镜头 31 格。',1050,31,INK)
text(1220,1120,'前 / 后投影尺寸 = 31 / 29.5 ≈ 1.051',32,GREEN)
paragraph(1220,1186,'同一砖块的前后截面大小接近。深度边露出多少，取决于地块相对画面中心的位置。',1050,30,MUTED)
paragraph(1220,1320,'正对 XY 的透视保持正面格线横平竖直；厚度投影随位置改变，玩法仍沿 X / Y 展开。',1050,30,ORANGE)

panel((50,1485,2350,2110),'D','远景用独立层序：Z 不是画中城市的物理距离')
text(85,1582,'设施城市的四张图片层；下面卡片等间距仅表示顺序，不与上方近景标尺共用比例。',28,MUTED)
layers=[('天空',-120,'0','#cddfeb'),('远城',-92,'0.06','#b3cbd5'),('中景城区',-60,'0.32','#879ead'),('近处屋顶',-28,'0.90','#526d80')]
for i,(name,z,p,color) in enumerate(layers):
    x=85+i*565
    d.rounded_rectangle((x,1640,x+525,1834),13,fill='#f0f4f1',outline=LINE,width=2)
    d.rectangle((x+14,1654,x+511,1730),fill='#e5eef1')
    if i==0:
        d.ellipse((x+95,1663,x+140,1708),fill='#fffdf1')
    else:
        for n in range(9):
            hh=[35,57,46,65,28,55,38,60,48][n]
            xx=x+25+n*54
            d.rectangle((xx,1730-hh,xx+42,1730),fill=color)
    text(x+23,1748,f'{name}   Z = {z}',30)
    text(x+23,1792,f'视差构图系数 {p}',26,MUTED)
arrow((160,1880),(2220,1880),INK)
text(110,1894,'远层',25,MUTED);text(2130,1894,'近层',25,MUTED)
text(610,1889,'只表示前后顺序；各层图片仍适配视口',28,ORANGE)
paragraph(85,1950,'视差系数控制镜头移动时的有限构图偏移，不是物体运动速度，也不能仅凭 Z 值推算建筑大小。',2210,29,INK)
paragraph(85,2020,'普通自由世界另用 Z = −121 的背景横幅，按视口覆盖并轻微偏移；不自动拥有这四层城市。',2210,29,MUTED)

text(60,2140,'依据：tile-geometry · flora / flora-cover · tree-skeleton · camera-rig · facility-sky · free-world-background',24,MUTED)
text(60,2175,'空间范围与投影比例来自现有代码；植物轮廓、城市剪影为说明性绘形。',23,MUTED)
assert all(-1<=lo<=hi<=.5 for _,lo,hi,_ in bands)
assert math.isclose(front_size/back_size,31/29.5)
assert math.isclose(math.dist(far[0],far[1]),back_size)
assert all(layers[i][1]<layers[i+1][1] for i in range(3))
OUT.parent.mkdir(parents=True,exist_ok=True)
im.save(OUT)
checks={'size':[W,H],'shared_z_scale_px_per_tile':620,'front_back_projection_ratio':ratio,'camera_distance':distance,'vertical_fov_degrees':fov,'front_px':front_size,'back_px':back_size,'text_count':len(text_bounds),'scope':'Plant bands share zx; Y schematic. Backdrop cards encode order, not distance.'}
(Path(__file__).parent/'plants-perspective-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(f'{OUT} {W}x{H}; front/back={ratio:.6f}')
