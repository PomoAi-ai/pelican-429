"""Perspective wireframes and exact rulers for the confirmed depth contract."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/concepts'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
BG='#F5F3EE'; INK='#23394A'; BLUE='#326BB0'; GREEN='#54866B'; ORANGE='#B76D32'; CYAN='#279AA4'; GRAY='#AEBEC8'
im=Image.new('RGB',(2400,2500),BG); d=ImageDraw.Draw(im)
OFFSET=0
def text(x,y,t,size=28,color=INK):
    y+=OFFSET
    f=ImageFont.truetype(FONT,size); b=d.textbbox((x,y),t,font=f)
    assert b[2]<2380 and b[3]<im.height-10,(t,b)
    d.text((x,y),t,font=f,fill=color)
def line(a,b,c=BLUE,w=3): d.line(((a[0],a[1]+OFFSET),(b[0],b[1]+OFFSET)),fill=c,width=w)
def dash(a,b,c=GRAY):
    length=math.dist(a,b)
    for i in range(0,math.ceil(length),14):
        line(tuple(a[k]+(b[k]-a[k])*i/length for k in (0,1)),tuple(a[k]+(b[k]-a[k])*min(i+7,length)/length for k in (0,1)),c,2)
def dim(a,b,label,pos,c=BLUE):
    line(a,b,c,2);angle=math.atan2(b[1]-a[1],b[0]-a[0])
    for p,ang in ((a,angle),(b,angle+math.pi)):
        for delta in (-.45,.45):line(p,(p[0]+12*math.cos(ang+delta),p[1]+12*math.sin(ang+delta)),c,2)
    text(*pos,label,26,c)
def panel(box): d.rounded_rectangle((box[0],box[1]+OFFSET,box[2],box[3]+OFFSET),18,fill='white',outline='#D7E0E4',width=2)
def loop(points,c,w=3):
    for a,b in zip(points,points[1:]+points[:1]):line(a,b,c,w)
def prism(p,poly,z0,z1,c=BLUE):
    for z in (z0,z1): loop([p(x,y,z) for x,y in poly],c)
    for x,y in poly:line(p(x,y,z0),p(x,y,z1),c)

text(55,30,'01 深度定义｜中间 1 格 + 内沿预留 0.5 + 外延预留 0.5',42)
text(58,103,'预留空间供花草、特殊物品使用，不是把实体砖加厚。总空间带宽 2 格；墙厚 0.2，位于外延预留区。',27,BLUE)
text(58,153,'坐标示意：中间实体 Z=−0.5～+0.5；内沿预留 −1～−0.5；外延预留 +0.5～+1。',27)
panel((50,215,2350,1250))
text(85,245,'A  YZ 方格剖面｜高度与深度同尺度，中间是完整 1×1 正方形',33,BLUE)
unit=600
to=lambda z:500+(z+1)*unit
y=430
for lo,hi,color in [(-1,-.5,'#E6F1E5'),(-.5,.5,'#DCE9F6'),(.5,1,'#F7ECD9')]:
    d.rectangle((to(lo),y,to(hi),y+unit),fill=color,outline=GRAY,width=2)
d.rectangle((to(.5),y,to(.7),y+unit),fill='#CAD9C7')
# Every small square is 0.1×0.1; one logical cell contains ten in each axis.
for i in range(21):line((500+i*60,y),(500+i*60,y+unit),'#C3D2D7',1)
for i in range(11):line((500,y+i*60),(1700,y+i*60),'#C3D2D7',1)
d.rectangle((to(-.5),y,to(.5),y+unit),outline=BLUE,width=4)
d.rectangle((to(.5),y,to(.7),y+unit),outline=GREEN,width=4)
for z in (-1,-.5,0,.5,1):
    dash((to(z),y-20),(to(z),y+unit+25),CYAN if z==0 else GRAY)
    text(to(z)-25,y-60,f'{z:g}',26)
for lo,hi,label in [(-1,-.5,'内沿 0.5'),(-.5,.5,'中间实体深 1'),(.5,1,'外延 0.5')]:
    dim((to(lo),1100),(to(hi),1100),label,(to(lo)+25,1120))
dim((445,y),(445,y+unit),'高 Y = 1',(210,700))
text(550,325,'花草 / 特殊物品',26,GREEN)
text(995,325,'人物 Z=0',26,CYAN)
text(1420,325,'外延预留区',26,ORANGE)
text(1760,450,'小方格 0.1 × 0.1',27)
text(1760,520,'中间 10 × 10 小格',27,BLUE)
text(1760,590,'= 1 × 1 标准格',27,BLUE)
text(1760,700,'墙厚 0.2 = 2 小格',27,GREEN)
text(1760,770,'墙高 1 = 10 小格',27,GREEN)
text(1760,840,'墙宽 1 见下方透视',26,GREEN)
text(1760,940,'两侧预留各 5 小格',26,ORANGE)
text(100,1190,'背景墙在外延区内，完整高 1、宽 1，厚 0.2；小方格是标尺，不代表新增0.1格建造单位。',28,ORANGE)
assert to(.5)-to(-.5) == unit
assert math.isclose(to(.7)-to(.5),unit*.2)
OFFSET=450
panel((50,870,1500,1890));panel((1530,870,2350,1890))
text(85,905,'B  统一透视投影｜整格墙、实体与预留区',32,BLUE)
text(90,970,'所有纵深边使用同一消失点；各 XY 截面仍是同尺寸的正方形。',27)
p=lambda x,y,z:(1080+1500*(x-2)/(5-z),1080-1500*(y-1.6)/(5-z))
poly=[(0,0),(1,0),(1,1),(0,1)]
for lo,hi,col in [(-1,-.5,GREEN),(.5,1,ORANGE)]:
    for z in (lo,hi):
        pts=[p(x,y,z) for x,y in poly]
        for a,b in zip(pts,pts[1:]+pts[:1]):dash(a,b,col)
    for x,y in poly:dash(p(x,y,lo),p(x,y,hi),col)
prism(p,poly,-.5,.5,BLUE)
# The standard background wall occupies the complete 1×1 XY footprint.
prism(p,poly,.5,.7,GREEN)
for z,label,yy,col in [(-1,'内沿预留边界 −1',1190,GREEN),(-.5,'中间格后面 −0.5',1280,BLUE),(.5,'中间格前面 +0.5',1450,BLUE),(1,'外延预留边界 +1',1630,ORANGE)]:
    line(p(1,.8 if z<0 else .1,z),(1010,yy+12),col,2);text(1020,yy,label,25,col)
dim(p(0,-.12,.7),p(1,-.12,.7),'墙宽 1',(480,1725),GREEN)
dim(p(-.12,0,.7),p(-.12,1,.7),'墙高 1',(70,1420),GREEN)
text(100,1760,'蓝色实线：中间 1 格实体。绿色 / 橙色虚线：两侧预留空间。',27)
text(100,1810,'绿色背景墙：标准宽 1 × 高 1 × 厚 0.2，完整覆盖一格，不缩边。',25,GREEN)
text(1570,920,'C  使用规则',34,BLUE)
for yy,t,c in [
    (1010,'中间实体：深度 1 格。',BLUE),
    (1100,'内沿预留：额外 0.5 格。',GREEN),
    (1190,'外延预留：额外 0.5 格。',ORANGE),
    (1280,'两侧用来容纳花草、特殊物品。',INK),
    (1370,'预留区不是默认填满的实体砖。',INK),
    (1460,'背景墙：宽1 × 高1 × 厚0.2。',GREEN),
    (1550,'空间总宽 0.5 + 1 + 0.5 = 2。',BLUE),
    (1640,'墙不让总宽变成 2.2。',ORANGE),
    (1730,'具体物品位置与碰撞分别定义。',INK),
]:text(1570,yy,t,28,c)
text(60,1940,'最新口径：外延 / 内沿是额外预留区。旧图“前后各0.5合成实体1格、墙向后加厚”已废止。',27,ORANGE)
text(60,1990,'正负号用于本图统一标尺；透视镜头仅作说明。外延区内墙的固定偏移仍待明确，不从图中反推。',25)
assert math.isclose(.5-(-.5),1)
assert math.isclose(1-(-1),2)
assert .5 <= .5 < .7 <= 1 and math.isclose(.7-.5,.2)
# Equal X/Y units have the same scale at any depth; all Z edges share one vanishing point.
for z in (-1,-.5,0,.5,.7,1):
    assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
assert math.dist(p(0,0,-1),p(1,0,-1)) < math.dist(p(0,0,1),p(1,0,1))
for x,y in poly:
    a,b=p(x,y,-1),p(x,y,1)
    assert abs((a[0]-1080)*(b[1]-1080)-(a[1]-1080)*(b[0]-1080)) < 1e-7
im.save(OUT/'building-depth.png')
print('Updated depth: central 1 + two reserve zones 0.5; wall 0.2 inside outer reserve.')
