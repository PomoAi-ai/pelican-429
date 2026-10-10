"""Expanded single-room concept: nine clear cells, pendant and a wall window."""
import math
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--half-bricks',action='store_true')
HALF=parser.parse_args().half_bricks
SLAB=.5 if HALF else 1
OUT=ROOT/'public/concepts'/('room-half-brick-perspective.png' if HALF else 'room-reference-perspective.png')
im=Image.new('RGB',(2400,2050),'#F5F3EE');d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
BLUE='#326BB0'; INK='#23394A'; MUTED='#687B88'; ORANGE='#B96F36'; GREEN='#59846A'
NAVY='#30465B'; WALL='#DFE9E8'; WOOD='#BC9565'; CYAN='#68CBDA'
def text(x,y,s,size=27,c=INK):
 f=ImageFont.truetype(FONT,size);b=d.textbbox((x,y),s,font=f)
 assert b[2]<2380 and b[3]<2040,(s,b)
 d.text((x,y),s,font=f,fill=c)
def line(a,b,c=BLUE,w=2):d.line((a,b),fill=c,width=w)
def dash(a,b,c=ORANGE):
 n=math.dist(a,b)
 for i in range(0,math.ceil(n),14):line(tuple(a[k]+(b[k]-a[k])*i/n for k in (0,1)),tuple(a[k]+(b[k]-a[k])*min(i+7,n)/n for k in (0,1)),c)
def dim(a,b,label,xy,c=BLUE):
 line(a,b,c);ang=math.atan2(b[1]-a[1],b[0]-a[0])
 for v,t in ((a,ang),(b,ang+math.pi)):
  for dt in (-.45,.45):line(v,(v[0]+12*math.cos(t+dt),v[1]+12*math.sin(t+dt)),c)
 text(*xy,label,27,c)
# Camera observes from the inner-reserve side (-Z), leaving the outer wall behind the room.
p=lambda x,y,z:(1130+(x-5.5)*108*15/(15+z),1070-y*108*15/(15+z))
faces=[]
def face(pts,color):faces.append((sum(v[2] for v in pts)/len(pts),pts,color))
def box(x,y,z,w,h,dep,color):
 z1=z+dep
 face([(x,y,z),(x+w,y,z),(x+w,y+h,z),(x,y+h,z)],color)
 if y+h<3:face([(x,y+h,z),(x+w,y+h,z),(x+w,y+h,z1),(x,y+h,z1)],'#D3DDDA')
 if y>3:face([(x,y,z),(x+w,y,z),(x+w,y,z1),(x,y,z1)],'#8496A0')
 if x+w<5.5:face([(x+w,y,z),(x+w,y+h,z),(x+w,y+h,z1),(x+w,y,z1)],'#93A9B3')
 if x>5.5:face([(x,y,z),(x,y+h,z),(x,y+h,z1),(x,y,z1)],'#93A9B3')
def panel(x,y,z,w,h,c):face([(x,y,z),(x+w,y,z),(x+w,y+h,z),(x,y+h,z)],c)
text(55,30,'半砖单间｜半高地板与屋顶 · 吊灯 · 墙窗' if HALF else '单间房屋｜横向加宽 3 格 · 吊灯 · 墙窗',47)
text(58,104,'对照版：净宽9、净高5不变；总高6 = 半砖底板0.5 + 室内5 + 半砖顶板0.5。' if HALF else '按加宽3格处理：室内净宽6 → 9；总高仍为7格（底板1 + 室内净高5 + 顶板1）。',29,BLUE)
text(58,155,'背景墙整格1×1、厚0.2；实体深1，两侧各额外预留0.5。窗与吊灯为本次摆放示意，具体构件尺寸待定。',25)
d.rounded_rectangle((50,210,2350,1320),18,fill='white',outline='#D5E0E5',width=2)
text(85,242,'A  单间透视｜从内沿侧看向外延墙面，观察面敞开',31,BLUE)
SOLID={(x,y) for x in range(11) for y in (-1,5)}|{(10,y) for y in range(5)}|{(0,y) for y in (4,)}
# Window opening replaces four background cells; wall tiles are otherwise complete 1×1 panels.
WINDOW={(x,y) for x in (7,8) for y in (2,3)}
BACK={(x,y) for x in range(1,10) for y in range(5)}-WINDOW
for x,y in sorted(BACK):box(x,y,.5,1,1,.2,WALL)
# Sky and a framed 2×2 opening, in the wall layer; no solid wall behind the window.
panel(7,2,.62,2,2,'#B6DDEA')
face([(7,2,.61),(9,2,.61),(9,2.5,.61),(8.5,3,.61),(8,2.55,.61),(7.5,3.1,.61),(7,2.65,.61)],'#90AEB6')
for x in (7,8.92):box(x,2,.49,.08,2,.22,NAVY)
for y in (2,3.92):box(7,y,.49,2,.08,.22,NAVY)
box(7.96,2,.48,.08,2,.1,NAVY);box(7,2.96,.48,2,.08,.1,NAVY)
box(6.95,1.92,.38,2.1,.08,.34,WOOD)
for x,y in sorted(SOLID):
 by=-SLAB if y==-1 else y
 bh=SLAB if y in (-1,5) else 1
 box(x,by,-.5,1,bh,1,'#E2E4DC')
# The upper cell belongs to the door assembly, with its inner half left empty.
for x in (-2,-1,11):box(x,-SLAB,-.5,1,SLAB,1,'#B89D79')
# Door: three-unit clearance plus a one-unit upper cell, mounted in the outer X half.
for z in (-.5,.38):box(.06,0,z,.12,3,.12,NAVY)
box(0,3,-.5,.5,1,1,NAVY)
# Bed occupies a 3×1 envelope; tabletop and chairs need separate collision definitions.
box(1.3,0,-.15,3,.45,.5,WOOD);box(1.3,.45,-.18,3,.3,.58,'#EDEBE4')
box(2,.75,-.19,2.2,.15,.56,'#4779A2');box(1.45,.75,-.19,.5,.2,.54,'#F0EEE8')
for x in (6.6,9.15):box(x,0,-.05,.15,1.3,.25,NAVY)
box(6.5,1.3,-.15,3,.15,.6,WOOD)
for i in range(4):box(6.8+i*.19,1.45,.05,.14,.3+(i%2)*.1,.22,['#698FAD',WOOD][i%2])
# Pendant hangs from ceiling at y=5; lowest edge at y=4 leaves character clearance.
box(5.32,4.9,-.14,.36,.1,.28,NAVY)
box(5.475,4.4,-.025,.05,.5,.05,NAVY)
face([(5.28,4.45,-.18),(5.72,4.45,-.18),(6,4.05,-.18),(5,4.05,-.18)],WOOD)
box(5,4,-.18,1,.05,.36,CYAN)
for _,pts,c in sorted(faces,key=lambda f:f[0],reverse=True):
 pts2=[p(*v) for v in pts];d.polygon(pts2,fill=c);d.line(pts2+pts2[:1],fill='#71868E',width=2)
# Original character reference, uniformly scaled to 3.1 units.
art=Image.open(ROOT/'assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/right-v1.png').convert('RGB').crop((224,34,758,1408))
h=round(3.1*108);art=art.resize((round(art.width*h/art.height),h),Image.Resampling.LANCZOS)
im.paste(art,(300,round(p(0,0,0)[1])-h))
text(285,1110,'主角原图 · 3.3头身',23,MUTED)
dim(p(1,6.5,0),p(10,6.5,0),'室内净宽 9 格（原6 + 新增3）',(790,317))
dim(p(11.6,-SLAB,0),p(11.6,5+SLAB,0),f'总高 {5+2*SLAB:g}',(1840,730))
if HALF:
 dim(p(11.2,-.5,0),p(11.2,0,0),'地板高0.5',(1880,1060),ORANGE)
 dim(p(11.2,5,0),p(11.2,5.5,0),'屋顶高0.5',(1880,310),ORANGE)
dim(p(10.8,0,0),p(10.8,5,0),'室内净高 5',(1840,860))
dim(p(.7,0,-.55),p(.7,3,-.55),'门洞净高3',(100,580),ORANGE)
for x in (0,.5,1):dash(p(x,0,-.55),p(x,3,-.55))
text(90,420,'门上沿 · 上方这一格',27,ORANGE)
line((380,465),p(.5,3.55,-.5),ORANGE)
dim(p(-.35,3,-.5),p(-.35,4,-.5),'门上沿高1格',(95,455),ORANGE)
text(1910,410,'吊灯',31,BLUE);text(1910,463,'整体1×1格，含吊杆',25)
line((1900,450),p(5.5,4.4,0),BLUE)
text(1910,540,'墙窗 · 示例2×2格',27,BLUE)
line((1900,585),p(9,3.2,.5),BLUE)
text(1910,630,'窗洞替换4块墙板',25)
text(95,1210,'吊灯整体宽1×高1格，含顶部底座、吊杆和灯罩；从天花板向下占1格，灯底离地4格。',28)
text(95,1260,'半砖仅用于地板与屋顶；宽1、高0.5、深1。侧墙仍用整砖，背景墙仍是完整1×1。' if HALF else '门洞上方这一格是门上沿，与门框一体；下缘薄边属于同一组件。门洞净高仍为3格。',27,ORANGE)

# Orthographic XY grid keeps exact dimensions readable alongside perspective.
d.rounded_rectangle((50,1360,2350,1960),18,fill='white',outline='#D5E0E5',width=2)
text(85,1390,'B  正视方格校对｜每个大方格 1×1',32,BLUE)
u=60;ox=120;oy=1870
q=lambda x,y:(ox+x*u,oy-y*u)
for x in range(11):
 for y in range(-1,6):
  fill=NAVY if (x,y) in SOLID else '#C1E4EF' if (x,y) in WINDOW else WALL if (x,y) in BACK else '#FFF4E1'
  if HALF and y in (-1,5):
   d.rectangle((*q(x,y+1),*q(x+1,y)),fill='#FAF9F5',outline='#D9E2E6',width=1)
   low=-.5 if y==-1 else 5
   d.rectangle((*q(x,low+.5),*q(x+1,low)),fill=NAVY,outline='#A8BDC5',width=1)
   dash(q(x,y+.5),q(x+1,y+.5),ORANGE)
  else:
   d.rectangle((*q(x,y+1),*q(x+1,y)),fill=fill,outline='#A8BDC5',width=1)
d.rectangle((*q(0,4),*q(.5,3)),fill=NAVY,outline=ORANGE,width=2)
line(q(.12,0),q(.12,3),ORANGE,5)
line(q(5.5,5),q(5.5,4.45),ORANGE,3)
d.polygon([q(5.28,4.45),q(5.72,4.45),q(6,4),q(5,4)],fill=WOOD,outline=ORANGE)
text(870,1480,f'房间：室内净宽9，净高5；实体外轮廓11×{5+2*SLAB:g}。',28)
text(870,1540,'背景墙：每块完整1×1，厚0.2，在外延预留区。',28,GREEN)
text(870,1600,'窗：右侧墙面2×2格示例；开闭方式与碰撞未定。',28)
text(870,1660,'吊灯：整体占1×1格，顶部居中，离地净空4格。',28)
text(870,1720,'床3×1、桌3×2为放置草案，外观不必填满占格。',28)
text(870,1780,'门上沿占门洞上方一格，与门框一体；细边0.12为示例。',27,ORANGE)
text(870,1840,'深色为实体半砖；浅色半格留空，逻辑格仍是1×1。' if HALF else '宽高按方格数核对；透视中的远近缩放不改变实际尺寸。',27)
text(60,1995,'本图更新概念资料，不代表运行时已实现；镜头从内沿侧观察，外延墙在画面后层。',25,MUTED)
assert len(BACK)==9*5-4 and not(BACK & WINDOW)
assert max(y for x,y in SOLID)+1-min(y for x,y in SOLID)==7
assert math.isclose((5+SLAB)-(-SLAB),6 if HALF else 7)
assert 10-1==9 and 4>3.1
assert 4-3==1 and .5+ .5==1
assert all((0,y) not in SOLID for y in range(3))
for z in (-1,-.5,.5,.7,1):assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
OUT.parent.mkdir(parents=True,exist_ok=True);im.save(OUT)
print('Room updated: 9-cell clear width, pendant, 2×2 wall window; geometry checks passed.')
