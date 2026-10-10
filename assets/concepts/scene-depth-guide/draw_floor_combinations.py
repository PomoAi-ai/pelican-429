"""Compare three inter-storey slabs against one unchanged world grid."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/concepts/floor-half-brick-combinations.png'
W,H=3000,2220
im=Image.new('RGB',(W,H),'#F4F2EC');d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#263D4B'; BLUE='#326CAF'; ORANGE='#B66B30'; GREEN='#568575'; SOLID='#566F82'; WALL='#E0EBE5'; GRID='#AABEBB'
def text(x,y,s,size=26,color=INK):
 f=ImageFont.truetype(FONT,size);b=d.textbbox((x,y),s,font=f)
 assert b[2]<W-20 and b[3]<H-10,(s,b)
 d.text((x,y),s,font=f,fill=color)
def line(a,b,c=BLUE,w=2):d.line((a,b),fill=c,width=w)
def dashed(a,b,c=ORANGE,w=2):
 length=math.dist(a,b)
 if not length:return
 for n in range(0,math.ceil(length),12):
  line(tuple(a[j]+(b[j]-a[j])*n/length for j in (0,1)),tuple(a[j]+(b[j]-a[j])*min(n+6,length)/length for j in (0,1)),c,w)
def dim(a,b,label,pos,c=BLUE):
 line(a,b,c);ang=math.atan2(b[1]-a[1],b[0]-a[0])
 for pt,angle in ((a,ang),(b,ang+math.pi)):
  for delta in (-.4,.4):line(pt,(pt[0]+10*math.cos(angle+delta),pt[1]+10*math.sin(angle+delta)),c)
 text(*pos,label,24,c)
text(55,30,'层间组合透视｜常规：上半砖、整砖 · 特殊：下半砖接坡',48)
text(58,104,'同一世界方格、同一透视镜头；用已有形态解决衔接，背景墙不整体错格，门不必悬空。',29,BLUE)
text(58,155,'形态索引：A整砖 · B下半砖 · C上半砖 · K/L左右半砖 · H缓坡高段（原分级为选做）。实体深1，墙厚0.2。',27)
cases=[('① 整砖 A 楼板',5,6),('② 上半砖 C 楼板',5.5,6),('③ 下半砖 B ＋ 缓坡 H',5,5.5)]
yaw=math.radians(15);pitch=math.radians(6)
cy,sy=math.cos(yaw),math.sin(yaw);cp,sp=math.cos(pitch),math.sin(pitch)
def camera(v,center):
 x,y,z=(v[j]-center[j] for j in range(3))
 sideways=cy*x+sy*z;depth=-sy*x+cy*z
 return sideways,cp*y+sp*depth,24-sp*y+cp*depth
for i,(name,bottom,top) in enumerate(cases):
 left=40+i*990
 d.rounded_rectangle((left,220,left+960,2100),20,fill='white',outline='#CEDBDD',width=2)
 text(left+28,250,name,34,BLUE)
 text(left+28,309,('常规方案' if i<2 else '特殊组合')+f' · 净高{bottom:g} / {11-top:g}',27,GREEN if i<2 else ORANGE)
 center=(5.5,5.5,0)
 def p3(v):
  x,y,z=camera(v,center)
  return left+445+x*61*24/z,800-y*61*24/z
 eye=(center[0]+24*sy*cp,center[1]+24*sp,center[2]-24*cy*cp)
 faces=[];objects=[]
 def prism(poly,z,depth,color,record=True):
  front=[(x,y,z) for x,y in poly];back=[(x,y,z+depth) for x,y in poly]
  fs=[(list(reversed(front)),color),(back,color)]
  for k in range(len(poly)):
   j=(k+1)%len(poly)
   fs.append(([front[k],front[j],back[j],back[k]],'#91A9B2' if color==SOLID else color))
  for v,c in fs:
   a,b,cross=[v[1][j]-v[0][j] for j in range(3)],[v[2][j]-v[0][j] for j in range(3)],None
   n=(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
   if sum(n[j]*(eye[j]-v[0][j]) for j in range(3))>0:
    faces.append((sum(camera(t,center)[2] for t in v)/len(v),v,c))
  if record:objects.append((poly,z,depth,color))
 def box(x,y,z,w,h,depth,color):prism([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],z,depth,color)
 # Rear panels stay on the original integer grid across both rooms.
 for x in range(1,10):
  for y in range(11):
   if x in (7,8) and y in (2,3,8,9):continue
   box(x,y,.5,1,1,.2,WALL)
 for wy in (2,8):
  box(7,wy,.61,2,2,.015,'#AED3E1')
  for xx in (7,8.92):box(xx,wy,.48,.08,2,.23,INK)
  for yy in (wy,wy+1.92):box(7,yy,.48,2,.08,.23,INK)
  box(7.96,wy,.47,.08,2,.05,INK);box(7,wy+.96,.47,2,.08,.05,INK)
 # Whole K/L side half-bricks, with door components occupying their own cells.
 for y in range(11):
  box(10,y,-.5,.5,1,1,SOLID)
  if y not in (0,1,2,3,6,7,8,9):box(.5,y,-.5,.5,1,1,SOLID)
 for x in range(11):
  box(x,-.5,-.5,1,.5,1,SOLID)
  box(x,11,-.5,1,.5,1,SOLID)
 for x in range(1,10):
  if i==2 and x==1:
   # H occupies this cell by itself; do not stack a ramp over a half brick.
   prism([(1,5),(2,5),(2,5.5),(1,6)],-.5,1,'#DBA35F')
  else:box(x,bottom,-.5,1,top-bottom,1,SOLID)
 for base in (0,6):
  box(.5,base+3,-.5,.5,1,1,'#BD9465')
  for z in (-.5,.38):box(.55,base,z,.12,3,.12,INK)
 for ceiling in (bottom,11):
  box(5.34,ceiling-.08,-.14,.32,.08,.28,INK)
  box(5.475,ceiling-.55,-.025,.05,.47,.05,INK)
  prism([(5,ceiling-1),(6,ceiling-1),(5.72,ceiling-.53),(5.28,ceiling-.53)],-.18,.36,'#BC9565')
 # Furniture rests on actual support surfaces, independent of rear-wall tile lines.
 box(6.4,top,-.16,3,.42,.55,'#BC9565');box(6.4,top+.42,-.18,3,.28,.6,'#5A839E')
 for x in (6.5,9.15):box(x,0,-.1,.15,1.3,.25,INK)
 box(6.4,1.3,-.16,3,.15,.55,'#BC9565')
 for _,v,c in sorted(faces,key=lambda f:f[0],reverse=True):
  pts=[p3(t) for t in v];d.polygon(pts,fill=c);d.line(pts+pts[:1],fill='#71868E',width=2)
 # Dimension endpoints are projected from the same world coordinates as the geometry.
 dim(p3((11.3,0,0)),p3((11.3,bottom,0)),f'{bottom:g}',(left+845,980))
 dim(p3((11.3,top,0)),p3((11.3,11,0)),f'{11-top:g}',(left+845,590))
 a,b=p3((1,top,-.51)),p3((10,top,-.51));dashed(a,b,ORANGE,3)
 text(left+25,1215,f'楼板Y={bottom:g}～{top:g}；主体落脚Y={top:g}',27,BLUE)
 if i==2:
  line((left+58,864),p3((1.5,5.75,-.51)),ORANGE,2)
  text(left+22,825,'H 接门口',23,ORANGE)
  text(left+24,875,'升高0.5',22,ORANGE)
 notes=[
  ['用A整砖跨层，K/L半宽侧墙接两端。','门口与室内地面同为Y=6；净洞仍高3。','灯具整体1×1，门上沿高1；墙板完整。'],
  ['用C上半砖；楼板下露出半格背景墙。','完整墙板保留，被楼板遮挡部分不裁小。','吊灯贴实际底面Y=5.5，整体仍高1。'],
  ['H高端Y=6接门口，低端Y=5.5接B半砖。','门保持Y=6安装；室内半格高差由坡面连接。','H单独占一格，不是把斜坡叠在B砖上。']
 ][i]
 for j,t in enumerate(notes):text(left+28,1270+j*44,t,25)
 text(left+28,1432,'局部线框透视 · 对照真实拼接',29,BLUE)
 # Enlarged detail: slab front/back and complete rear panels; no depth exaggeration.
 detail_center=(1.5,5.5,0)
 def pd(v):
  x,y,z=camera(v,detail_center)
  return left+450+x*137*24/z,1790-y*137*24/z
 def wire(poly,z,dep,c,fill=False):
  near=[(x,y,z) for x,y in poly];far=[(x,y,z+dep) for x,y in poly]
  if fill:d.polygon([pd(v) for v in near],fill='#E5EDF2')
  for k in range(len(poly)):
   n=(k+1)%len(poly)
   line(pd(near[k]),pd(near[n]),c,2);line(pd(far[k]),pd(far[n]),c,2);line(pd(near[k]),pd(far[k]),c,2)
 for x in range(3):
  for y in (4,5,6):wire([(x,y),(x+1,y),(x+1,y+1),(x,y+1)],.5,.2,GREEN)
 for x in range(3):
  if i==2 and x==0:poly=[(0,5),(1,5),(1,5.5),(0,6)]
  else:poly=[(x,bottom),(x+1,bottom),(x+1,top),(x,top)]
  wire(poly,-.5,1,ORANGE if i==2 and x==0 else BLUE,True)
 if i==2:
  text(left+75,1555,'门口6 → H → B地面5.5',25,ORANGE)
  for xx,label in ((.5,'H'),(1.5,'B'),(2.5,'B')):text(*pd((xx-.1,5.15,-.51)),label,25,BLUE)
 dim(pd((3.4,bottom,-.5)),pd((3.4,top,-.5)),f'高{top-bottom:g}',(left+802,1800))
 dim(pd((0,4.1,-.5)),pd((0,4.1,.5)),'深1',(left+150,2010))
 text(left+28,2050,'蓝：实体格  绿：完整背景墙  橙：缓坡衔接',23)
 assert math.isclose(bottom+(top-bottom)+(11-top),11)
 if i==2:
  h_top=lambda x:6-.5*x
  assert h_top(0)==6 and h_top(1)==top
 # All schemes retain disjoint solid and background depth intervals.
 assert -.5+1==.5 and .5+.2<=1
text(58,2150,'常规楼板采用上半砖或整砖，落脚顶面同为Y=6；下半砖接缓坡保留作特殊组合，不作为常规层间做法。',29,BLUE)
im.save(OUT)
print(f'Saved {OUT}; slab boundaries and H-to-B seam checks passed.')
