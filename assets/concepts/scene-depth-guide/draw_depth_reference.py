"""Perspective wireframes and exact rulers for the depth contract: tile depth 2, reserves outside the tile."""
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

text(55,30,'01 深度定义｜格子深 2 + 前沿 0.5 + 后沿 0.5',42)
text(58,103,'格子本身深 2；前沿、后沿是格子之外的额外空间，供花草、突出岩与特殊物品使用。墙厚 0.2，放在后沿上，与格子没有交集。',27,BLUE)
text(58,153,'坐标示意（+Z 朝镜头，图中左侧）：格子 Z=−1～+1；前沿 +1～+1.5；后沿 −1.5～−1；墙 −1.2～−1。总空间带宽 3。',27)
panel((50,215,2350,1250))
text(85,245,'A  YZ 方格剖面｜高度与深度同尺度，格子为 深2 × 高1',33,BLUE)
unit=480
# +Z faces the camera, so the camera side is drawn on the left.
to=lambda z:300+(1.5-z)*unit
y=460
for lo,hi,color in [(1,1.5,'#E6F1E5'),(-1,1,'#DCE9F6'),(-1.5,-1,'#F7ECD9')]:
    d.rectangle((to(hi),y,to(lo),y+unit),fill=color,outline=GRAY,width=2)
d.rectangle((to(-1),y,to(-1.2),y+unit),fill='#CAD9C7')
# Every small square is 0.1×0.1; one unit contains ten in each axis.
for i in range(31):line((300+i*48,y),(300+i*48,y+unit),'#C3D2D7',1)
for i in range(11):line((300,y+i*48),(300+3*unit,y+i*48),'#C3D2D7',1)
d.rectangle((to(1),y,to(-1),y+unit),outline=BLUE,width=4)
d.rectangle((to(-1),y,to(-1.2),y+unit),outline=GREEN,width=4)
for z in (-1.5,-1,-.5,0,.5,1,1.5):
    dash((to(z),y-20),(to(z),y+unit+25),CYAN if z==0 else GRAY)
    text(to(z)-25,y-60,f'{z:+g}' if z else '0',26)
for lo,hi,label in [(1,1.5,'前沿 0.5'),(-1,1,'格子深 2'),(-1.5,-1,'后沿 0.5')]:
    dim((to(hi),1040),(to(lo),1040),label,(to(hi)+25,1060))
dim((255,y),(255,y+unit),'高 Y = 1',(70,680))
text(320,355,'花草 / 突出岩',26,GREEN)
text(to(0)-60,355,'人物 Z=0',26,CYAN)
text(to(-1)+10,355,'墙 / 灌木 / 大岩',26,ORANGE)
text(1810,470,'小方格 0.1 × 0.1',27)
text(1810,540,'格子 20 × 10 小格',27,BLUE)
text(1810,610,'= 深2 × 高1',27,BLUE)
text(1810,720,'墙厚 0.2 = 2 小格',27,GREEN)
text(1810,790,'墙高 1 = 10 小格',27,GREEN)
text(1810,860,'墙在后沿，贴格子背面',26,GREEN)
text(1810,930,'前沿、后沿各 5 小格',26,ORANGE)
text(100,1170,'格子 Z=−1～+1 是实体；墙 Z=−1.2～−1 只占后沿，与格子零交集；小方格是标尺，不代表新增0.1格建造单位。',27,ORANGE)
assert to(-1)-to(1) == 2*unit
assert math.isclose(to(-1.2)-to(-1),unit*.2)
OFFSET=450
panel((50,870,1500,1890));panel((1530,870,2350,1890))
text(85,905,'B  统一透视投影｜格子、前沿、后沿与墙',32,BLUE)
text(90,970,'所有纵深边使用同一消失点；各 XY 截面仍是同尺寸的正方形。',27)
p=lambda x,y,z:(900+2000*(x-2.6)/(8-z),890-2000*(y-1.9)/(8-z))
poly=[(0,0),(1,0),(1,1),(0,1)]
for lo,hi,col in [(1,1.5,GREEN),(-1.5,-1,ORANGE)]:
    for z in (lo,hi):
        pts=[p(x,y,z) for x,y in poly]
        for a,b in zip(pts,pts[1:]+pts[:1]):dash(a,b,col)
    for x,y in poly:dash(p(x,y,lo),p(x,y,hi),col)
prism(p,poly,-1,1,BLUE)
# The standard background wall occupies the complete 1×1 XY footprint, just behind the tile.
prism(p,poly,-1.2,-1,GREEN)
for z,label,yy,col in [(-1.5,'后沿边界 −1.5',1180,ORANGE),(-1.2,'墙背面 −1.2',1260,GREEN),(-1,'格子背面 −1',1340,BLUE),(1,'格子正面 +1',1500,BLUE),(1.5,'前沿边界 +1.5（镜头侧）',1660,GREEN)]:
    line(p(1,.85 if z<0 else .1,z),(1060,yy+12),col,2);text(1070,yy,label,25,col)
text(100,1760,'蓝色实线：深 2 格子。绿色 / 橙色虚线：前沿 / 后沿额外空间。',27)
text(100,1810,'绿色背景墙：宽 1 × 高 1 × 厚 0.2，在后沿上，紧贴格子背面但不相交。',25,GREEN)
text(1570,920,'C  使用规则',34,BLUE)
for yy,t,c in [
    (1010,'格子：深 2，Z=−1～+1。',BLUE),
    (1100,'前沿：格子外额外 0.5。',GREEN),
    (1190,'后沿：格子外额外 0.5。',ORANGE),
    (1280,'前沿放花草、突出岩。',INK),
    (1370,'后沿放墙、灌木、大岩。',INK),
    (1460,'墙 1×1×0.2，与格子零交集。',GREEN),
    (1550,'空间总宽 0.5 + 2 + 0.5 = 3。',BLUE),
    (1640,'前沿、后沿不默认填实。',ORANGE),
    (1730,'人物仍走 Z=0（格子中线）。',CYAN),
]:text(1570,yy,t,28,c)
text(60,1940,'已确认：格子深 2；前沿 / 后沿在格子之外。旧口径“格子深 1、前后预留合计总宽 2”废止。',27,ORANGE)
text(60,1990,'+Z 朝镜头，见 core-coordinates.md。墙 −1.2～−1 为后沿内贴格子背面的放法。',25)
assert math.isclose(1-(-1),2)
assert math.isclose(1.5-(-1.5),3)
assert -1.5 <= -1.2 < -1 and math.isclose(-1-(-1.2),.2)
# Equal X/Y units have the same scale at any depth; all Z edges share one vanishing point.
for z in (-1.5,-1.2,-1,0,1,1.5):
    assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
assert math.dist(p(0,0,-1.5),p(1,0,-1.5)) < math.dist(p(0,0,1.5),p(1,0,1.5))
im.save(OUT/'building-depth.png')
print('Updated depth: tile depth 2 + front/back reserve 0.5 outside; wall 0.2 on back reserve.')
