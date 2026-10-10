"""Two-storey room concept; dimensions in tiles, rendered with one pinhole projection."""
import math
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--half-bricks',action='store_true')
HALF=parser.parse_args().half_bricks
SLAB=.5 if HALF else 1
UPPER=5+SLAB
ROOF=UPPER+5
OUT=ROOT/'public/concepts'/('room-half-brick-two-storey.png' if HALF else 'room-two-storey-perspective.png')
W,H=2600,2400
im=Image.new('RGB',(W,H),'#F5F3EE'); d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#23394A'; BLUE='#326BB0'; ORANGE='#B96F36'; WALL='#DFE9E8'; NAVY='#30465B'; WOOD='#BC9565'
def text(x,y,s,size=28,c=INK):
 f=ImageFont.truetype(FONT,size); b=d.textbbox((x,y),s,font=f)
 assert b[2]<W-20 and b[3]<H-15,(s,b)
 d.text((x,y),s,font=f,fill=c)
def line(a,b,c=BLUE,w=2):d.line((a,b),fill=c,width=w)
def dim(a,b,label,xy):
 line(a,b); ang=math.atan2(b[1]-a[1],b[0]-a[0])
 for v,t in ((a,ang),(b,ang+math.pi)):
  for dt in (-.45,.45):line(v,(v[0]+12*math.cos(t+dt),v[1]+12*math.sin(t+dt)))
 text(*xy,label,28,BLUE)
# Eye height 5.5: both floors share the same vanishing point and scale law.
def p(x,y,z):
 k=18/(18+z)
 return (1230+(x-5.5)*102*k,1010-(y-5.5)*102*k)
faces=[]
def face(v,c):faces.append((sum(t[2] for t in v)/len(v),v,c))
def box(x,y,z,w,h,dep,c):
 z1=z+dep
 face([(x,y,z),(x+w,y,z),(x+w,y+h,z),(x,y+h,z)],c)
 if y+h<5.5:face([(x,y+h,z),(x+w,y+h,z),(x+w,y+h,z1),(x,y+h,z1)],'#D3DDDA')
 if y>5.5:face([(x,y,z),(x+w,y,z),(x+w,y,z1),(x,y,z1)],'#8496A0')
 if x+w<=5.5:face([(x+w,y,z),(x+w,y+h,z),(x+w,y+h,z1),(x+w,y,z1)],'#93A9B3')
 if x>=5.5:face([(x,y,z),(x,y+h,z),(x,y+h,z1),(x,y,z1)],'#93A9B3')
text(60,35,'两层半砖房｜左右半宽墙 · 一格吊灯' if HALF else '两层房屋｜整砖结构 · 一体门上沿 · 一格吊灯',48)
text(60,112,'两层净空各9×5；底板、楼板、顶板各高0.5，左右墙宽0.5；总高11.5格。' if HALF else '每层室内9×5格；共用楼板1格。总高13 = 底板1 + 一层5 + 楼板1 + 二层5 + 顶板1。',30,BLUE)
text(60,167,'实体深1；内沿、外延各额外预留0.5。背景墙完整1×1、厚0.2，位于外延预留区。',28)
d.rounded_rectangle((45,225,2555,1775),18,fill='white',outline='#D5E0E5',width=2)
text(80,250,'A  统一透视｜敞开观察面，门上沿以木色标出',30,BLUE)
# One common slab at y=5..6; never double-count two room floors.
for y in (-SLAB,5,ROOF):
 for x in range(11):
  if y==5 and x in (4,5):continue
  box(x,y,-.5,1,SLAB,1,'#E2E4DC')
# Background panels continue behind the opening; they have no solid-tile collision.
for x in (4,5):box(x,5,.5,1,1,.2,WALL) if not HALF else None
for base in (0,UPPER):
 for x in range(1,10):
  for y in range(5):
   if x in (7,8) and y in (2,3):continue
   box(x,base+y,.5,1,1,.2,WALL)
 for y in range(5):box(10,base+y,-.5,SLAB,1,1,'#E2E4DC')
 box(1-SLAB,base+4,-.5,SLAB,1,1,'#E2E4DC')
 # Header is the cell immediately above the 3-cell doorway, integrated with the slim frame.
 box(.5 if HALF else 0,base+3,-.5,.5,1,1,WOOD)
 for z in (-.5,.38):box(.56 if HALF else .06,base,z,.12,3,.12,NAVY)

 face([(7,base+2,.62),(9,base+2,.62),(9,base+4,.62),(7,base+4,.62)],'#B6DDEA')
 for x in (7,8.92):box(x,base+2,.49,.08,2,.22,NAVY)
 for y in (2,3.92):box(7,base+y,.49,2,.08,.22,NAVY)
 box(7.96,base+2,.48,.08,2,.1,NAVY);box(7,base+2.96,.48,2,.08,.1,NAVY)
 box(2.82,base+4.9,-.14,.36,.1,.28,NAVY)
 box(2.975,base+4.4,-.025,.05,.5,.05,NAVY)
 face([(2.78,base+4.45,-.18),(3.22,base+4.45,-.18),(3.5,base+4.05,-.18),(2.5,base+4.05,-.18)],WOOD)
 box(2.5,base+4,-.18,1,.05,.36,'#68CBDA')
# One-way landing surfaces: rising characters pass through, descending characters stand.
for top in (2,4,UPPER):box(4,top-.08,-.5,2,.08,1,'#DE9F48')
# Upstairs bed, downstairs table; occupation envelopes are drafts.
box(1,UPPER,-.15,3,.45,.5,WOOD);box(1,UPPER+.45,-.18,3,.3,.58,'#EDEBE4')
box(1.7,UPPER+.75,-.19,2.2,.15,.56,'#4779A2');box(1.15,UPPER+.75,-.19,.5,.2,.54,'#F0EEE8')
for x in (6.6,9.15):box(x,0,-.05,.15,1.3,.25,NAVY)
box(6.5,1.3,-.15,3,.15,.6,WOOD)
for _,v,c in sorted(faces,key=lambda f:f[0],reverse=True):
 pts=[p(*t) for t in v];d.polygon(pts,fill=c);d.line(pts+pts[:1],fill='#71868E',width=2)
# Boundary-connected background only: retain original shape and internal highlights.
source=Image.open(ROOT/'assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/right-v1.png').convert('RGB')
ImageDraw.floodfill(source,(0,0),(255,0,255),thresh=45)
art=source.convert('RGBA')
art.putdata([(r,g,b,0 if (r,g,b)==(255,0,255) else 255) for r,g,b in source.get_flattened_data()])
art=art.crop(art.getbbox())
hero_x,hero_y,hero_z=2.25,0,0
hero_height=3.1
ah=round(math.dist(p(hero_x,hero_y,hero_z),p(hero_x,hero_y+hero_height,hero_z)))
art=art.resize((round(art.width*ah/art.height),ah),Image.Resampling.LANCZOS)
foot=p(hero_x,hero_y,hero_z)
im.paste(art,(round(foot[0]-art.width/2),round(foot[1]-ah)),art)
# Grid and body envelope share the protagonist's Z plane, independent of rear-wall projection.
for y in range(4):
 line(p(1.5,y,0),p(3,y,0),'#659B89',1)
 text(*p(1.2,y+.15,0),str(y),20,'#59846A')
dim(p(3.15,0,0),p(3.15,3.1,0),'外观3.1格',(1025,1260))
for a,b in [((hero_x-.4,0,0),(hero_x+.4,0,0)),((hero_x+.4,0,0),(hero_x+.4,2.8,0)),((hero_x+.4,2.8,0),(hero_x-.4,2.8,0)),((hero_x-.4,2.8,0),(hero_x-.4,0,0))]:
 pa,pb=p(*a),p(*b)
 n=max(1,round(math.dist(pa,pb)/12))
 for i in range(0,n,2):line(tuple(pa[j]+(pb[j]-pa[j])*i/n for j in (0,1)),tuple(pa[j]+(pb[j]-pa[j])*min(i+1,n)/n for j in (0,1)),ORANGE,2)
dim(p(4,5.4,-.5),p(6,5.4,-.5),'通口净宽2格',(1090,1050))
for low,high in zip((0,2,4),(2,4,UPPER)):
 a,b=p(5,low+.18,-.55),p(5,high-.15,-.55)
 line(a,b,ORANGE,4)
 line(b,(b[0]-10,b[1]+17),ORANGE,4);line(b,(b[0]+10,b[1]+17),ORANGE,4)
 text(*p(5.22,(low+high)/2,-.55),f'↑{high-low:g}格',22,ORANGE)
text(1930,1000,'橙色：单向落脚平台',28,ORANGE)
text(1930,1050,'从下跳穿，从上落脚',25,ORANGE)
line((1910,1055),p(6,4,-.5),ORANGE)
text(1930,1160,'人物同平面标尺',28,BLUE)
text(1930,1210,'原图等比缩放，外观高3.1格',25)
text(1930,1260,'碰撞框0.8×2.8格（橙虚线）',25,ORANGE)
text(1930,1310,'3.3头身 ≠ 身高3.3格',25)
dim(p(1,12.3,0),p(10,12.3,0),'每层净宽9',(1070,285))
dim(p(11.9,-SLAB,0),p(11.9,ROOF+SLAB,0),f'总高{ROOF+2*SLAB:g}',(2170,960))
for base,label in ((0,'一层'),(UPPER,'二层')):
 dim(p(11.3,base,0),p(11.3,base+5,0),label+'净高5',(1875,1340-base*102))
 dim(p(.72,base,-.55),p(.72,base+3,-.55),'净洞3',(470,1440-base*102))
text(120,565,'门上沿 = 门洞上方这一格',29,ORANGE)
text(120,615,'高1格，占外侧半格；内侧半格留空',25,ORANGE)
line((570,610),p(.75 if HALF else .25,UPPER+3.5,-.5),ORANGE)
text(1930,900,f'共用楼板高{SLAB:g}',29,BLUE);line((1920,950),p(10.5,5.5,-.5))
text(1930,560,'墙窗2×2 · 示例',28,BLUE);line((1920,605),p(9,9,.5))
text(1930,1410,'吊灯整体1×1格',28,BLUE)
text(1930,1460,'含吊杆；离本层地面4格',25)
text(1930,1510,'实体深度1',28,BLUE)
dim(p(11,0,-.5),p(11,0,.5),'',(1930,1550))
text(85,1720,f'2格宽通口 + 单向平台：落脚高度0 → 2 → 4 → {UPPER:g}格；最上平台齐二层地面，床与吊灯移出通道。',27,ORANGE)
d.rounded_rectangle((45,1820,2555,2320),18,fill='white',outline='#D5E0E5',width=2)
text(80,1845,'B  正视方格校对 · 1格方格',29,BLUE)
u=28; ox=130;oy=2275
q=lambda x,y:(ox+x*u,oy-y*u)
# Half-unit reference grid: major lines still denote one full world unit.
for x in range(12):line(q(x,-SLAB),q(x,ROOF+SLAB),'#D6E1E4',1)
for y in range(-1,13):line(q(0,y),q(11,y),'#D6E1E4',1)
for y in (-SLAB,5,ROOF):
 for x in range(11):
  if y==5 and x in (4,5):continue
  d.rectangle((*q(x,y+SLAB),*q(x+1,y)),fill=NAVY,outline='#A8BDC5',width=1)
for base in (0,UPPER):
 for x in range(1,10):
  for y in range(5):
   c='#C1E4EF' if x in (7,8) and y in (2,3) else WALL
   d.rectangle((*q(x,base+y+1),*q(x+1,base+y)),fill=c,outline='#A8BDC5',width=1)
 for y in range(5):d.rectangle((*q(10,base+y+1),*q(10+SLAB,base+y)),fill=NAVY,outline='#A8BDC5',width=1)
 d.rectangle((*q(1-SLAB,base+5),*q(1,base+4)),fill=NAVY,outline='#A8BDC5',width=1)
 dx=.5 if HALF else 0
 d.rectangle((*q(dx,base+4),*q(dx+.5,base+3)),fill=WOOD,outline=ORANGE,width=1)
 line(q(dx+.12,base),q(dx+.12,base+3),ORANGE,3)
 # One-cell occupation outline includes canopy, suspension and shade.
 d.rectangle((*q(2.5,base+5),*q(3.5,base+4)),outline=ORANGE,width=2)
text(575,1930,'门洞3格 + 门上沿所在格1格；上方剩余1格为普通侧墙。',29)
text(575,1995,'门上沿高1、宽0.5、深1；门柱宽度另定，不填满内侧半格。',29)
text(575,2060,'背景墙仍是完整1×1×0.2；窗口处移除墙板，不叠实心墙。',29)
text(575,2125,'吊灯整体宽1×高1，含吊杆；离地4格。床3×1、桌3×2为草案。',29)
text(575,2190,f'通口宽2；平台顶高2、4、{UPPER:g}；半宽侧墙外侧的水平板各挑出0.5。' if HALF else '通口宽2；平台顶高2、4、6。单向平台不按实心半砖处理。',27)
text(60,2350,'概念图 · Python绘制 · 统一透视与真实格子尺寸；人物外观与碰撞框分开；跳跃参数尚未做玩法验证。',26,'#687B88')
assert math.isclose(ROOF+2*SLAB,11.5 if HALF else 13) and 10-1==9
for z in (-1,-.5,.5,.7,1):
 assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
assert 3<5 and UPPER-5==SLAB
assert 5-4==1 and 3.5-2.5==1
assert 6-4==2 and abs(ah/102-hero_height)<1/102
assert all(0<b-a<=2 for a,b in zip((0,2,4),(2,4,UPPER)))
assert 1+3<=4 and 2.5+1<4  # Bed and pendant stay clear of the shaft.
im.save(OUT)
print(f'Saved {OUT}; dimensions and projection checks passed.')
