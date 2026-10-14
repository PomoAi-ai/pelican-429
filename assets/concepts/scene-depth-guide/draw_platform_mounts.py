"""Platform forms (centred without a wall, wall-hung with one) using one rigid perspective camera."""
from pathlib import Path
import math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
W,H=2500,3895
im=Image.new('RGB',(W,H),'#F5F3EE');d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#23394A';BLUE='#326BB0';GREEN='#59846A';ORANGE='#B96F36';GRAY='#A8BDC5'
def text(x,y,s,n=26,c=INK):
 f=ImageFont.truetype(FONT,n);b=d.textbbox((x,y),s,font=f)
 assert 0<=b[0] and b[2]<W-20 and b[3]<H-10,(s,b)
 d.text((x,y),s,font=f,fill=c)
def line(a,b,c=GRAY,w=2):d.line((a,b),fill=c,width=w)
def dash(a,b,c=GRAY):
 n=max(1,math.ceil(math.dist(a,b)/12))
 for i in range(0,n,2):line(tuple(a[k]+(b[k]-a[k])*i/n for k in (0,1)),tuple(a[k]+(b[k]-a[k])*min(i+1,n)/n for k in (0,1)),c)
def dim(a,b,s,xy,c=BLUE):
 line(a,b,c);t=math.atan2(b[1]-a[1],b[0]-a[0])
 for v,u in ((a,t),(b,t+math.pi)):
  for dt in (-.45,.45):line(v,(v[0]+10*math.cos(u+dt),v[1]+10*math.sin(u+dt)),c)
 text(*xy,s,23,c)
a=math.radians(27);e=math.radians(20)
R=(math.cos(a),0,math.sin(a));U=(-math.sin(a)*math.sin(e),math.cos(e),math.cos(a)*math.sin(e));F=(-math.sin(a)*math.cos(e),-math.sin(e),math.cos(a)*math.cos(e))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def project(v,ox,oy):
 v=(v[0]-.5,v[1]-.5,v[2]);depth=6+dot(v,F)
 return (ox+190*6*dot(v,R)/depth,oy-190*6*dot(v,U)/depth)
def cuboid(x,y,z,w,h,dep):
 v=[(x+dx*w,y+dy*h,z+dz*dep) for dx,dy,dz in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]
 return v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]
EDGES=((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))
WALL_FACES=('#DDE8E5','#B8CDC7','#A6BCB8','#E8F0ED','#B1C5C1','#BDCECB');SLAB_FACES=('#C99651','#B98749','#956D40','#E8BD7C','#BD915E','#AD7D45')
FRONT=-.5
def form(hung):
 """Geometry keeps the camera at −Z internally: the front edge is fixed, the back reaches the wall face only when a wall exists."""
 back=1 if hung else .5
 assert back-FRONT==(1.5 if hung else 1) and FRONT<=-.3
 return back,back-FRONT,'挂墙深1.5' if hung else '居中深1'
def solids(p,parts):
 scene=[]
 for verts,inds,colors in parts:
  for ids,col in zip(inds,colors):
   pts=[verts[j] for j in ids];scene.append((sum(dot(v,F) for v in pts)/4,pts,col))
 for _,pts,col in sorted(scene,key=lambda item:item[0],reverse=True):
  xy=[p(v) for v in pts];d.polygon(xy,fill=col);d.line(xy+xy[:1],fill='#6C8585',width=2)
text(55,28,'平台形态｜两种形态 × 两种高度对齐',48)
text(60,103,'前沿固定Z=+0.5。背后无墙：深1居中，Z=[−0.5,+0.5]；背后有墙：挂到墙面，深1.5，Z=[−1,+0.5]。宽1、板厚0.2为示例。',29,BLUE)
text(60,154,'行看高度对齐，列看形态。形态按“背后有没有墙”自动决定；禁止深1贴墙（前沿会落在人物脚下）。',27)
cases=[(title,hung,top) for title,top in [('整砖顶面对齐',1),('半砖顶面对齐',.5)] for hung in (False,True)]
for i,(title,hung,top) in enumerate(cases):
 back,depth,name=form(hung);bottom=top-.2
 cx=45+(i%2)*1235;cy=215+(i//2)*945
 d.rounded_rectangle((cx,cy,cx+1175,cy+915),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+23,f'{title} · {name}',35,BLUE)
 text(cx+28,cy+79,f'平台顶Y={top:g}，底Y={bottom:g}；'+('背后有墙，背面贴墙面' if hung else '背后无墙，离格子背面0.5'),27)
 text(cx+90,cy+133,'实体透视',25)
 text(cx+705,cy+133,'同镜头线框',25)
 wall,faces=cuboid(0,0,1,1,1,.2)
 slab,sfaces=cuboid(0,bottom,FRONT,1,.2,depth)
 ref,_=cuboid(0,bottom,-1,1,.2,2)
 for wire,ox in ((False,cx+270),(True,cx+845)):
  oy=cy+355;p=lambda v:project(v,ox,oy)
  if not wire:solids(p,([(wall,faces,WALL_FACES)] if hung else [])+[(slab,sfaces,SLAB_FACES)])
  else:
   for verts,c in ([(wall,GREEN)] if hung else [])+[(slab,ORANGE)]:
    for j,k in EDGES:line(p(verts[j]),p(verts[k]),c,2)
  # Full tile depth at slab height: shows the 0.5 kept clear in front and the gap behind a centred slab.
  for j,k in EDGES:dash(p(ref[j]),p(ref[k]))
  # Gameplay plane cut across the platform top, at its actual Z=0 location.
  line(p((0,top+.002,0)),p((1,top+.002,0)),BLUE,4)
  dim(p((1.13,bottom,FRONT)),p((1.13,bottom,back)),f'深{depth:g}',(ox+170,oy+105))
 text(cx+28,cy+565,'YZ侧剖方格｜每大格1，小格0.1；蓝虚线为人物平面Z=0',24,BLUE)
 # Equal-scale side section: depth direction horizontal, height vertical.
 sx=cx+250;sy=cy+812;unit=160
 q=lambda z,y:(sx+(z+1.5)*unit,sy-y*unit)
 for k in range(31):line(q(-1.5+k*.1,0),q(-1.5+k*.1,1),'#E6ECEE',1)
 for k in range(11):line(q(-1.5,k*.1),q(1.5,k*.1),'#E6ECEE',1)
 if hung:d.rectangle((*q(1,1),*q(1.2,0)),fill='#DDE8E5',outline=GREEN,width=2)
 d.rectangle((*q(FRONT,top),*q(back,bottom)),fill='#E8BD7C',outline=ORANGE,width=2)
 dash(q(0,0),q(0,1),BLUE)
 for z in (-1,1):dash(q(z,0),q(z,1))
 # Labels use the +Z-toward-camera convention.
 for z in (-1.5,-1,-.5,0,.5,1,1.5):text(q(z,0)[0]-14,sy+12,f'{-z:+g}' if z else '0',19,BLUE)
 dim(q(FRONT,1.1),q(back,1.1),f'深{depth:g}',(q(1.5,0)[0]+50,sy-unit-30))
 text(cx+30,cy+625,'对齐基准：'+('砖顶' if top==1 else '半砖顶'),24,BLUE)
 text(cx+30,cy+670,f'顶面Y={top:g}',24,ORANGE)
 text(cx+30,cy+715,'板厚0.2 ↓',24,ORANGE)
 text(cx+800,cy+670,'墙厚0.2' if hung else '背后无墙',24,GREEN)
 text(cx+800,cy+715,'墙板完整1×1' if hung else '灰虚线：格子正背面',24,GREEN)
 text(cx+28,cy+865,f'{name}；平台Z=[{-back:g}, {-FRONT:g}]；平台顶Y={top:g}、底Y={bottom:g}。',23)
 assert math.isclose(top-bottom,.2) and FRONT<0<back<=1
text(60,2145,'两种形态都可以放家具；平台被拆除时，上面的家具一并拆除。',27,BLUE)
text(60,2205,'整砖顶齐：顶面Y=j+1；半砖顶齐：顶面Y=j+0.5，可挂在下半砖旁，后续版本必须实现。“墙格底边对齐”候选已删除。',27,ORANGE)
text(60,2265,'前沿固定+0.5：人物身体区约[−0.3,+0.3]，身前留0.2。挂墙款是把居中款向后延到墙面，前沿不动。',27)
text(60,2325,'板厚0.2仅示例；同层拼接按落脚面齐平。蓝线标人物平面，侧剖小格0.1为标尺。',26)
text(60,2445,'左右半格平台｜正面X方向分半，俯视看X宽度与Z深度',40,BLUE)
text(60,2505,'左右半宽必须支持（半格房屋接半宽侧墙要用）。左半X=[0,0.5]，右半X=[0.5,1]；形态仍按背后有没有墙决定。',27)
def plan(cx,py,x0,width,hung,back,depth,u=150):
 """True top view: X and Z share one scale; the back edge is at the top."""
 px=cx+690
 q=lambda x,z:(px+x*u,py-(z+1)*u)
 for k in range(5):
  dash(q(k*.25,-1),q(k*.25,1),'#CAD7DC')
  dash(q(0,-1+k*.5),q(1,-1+k*.5),'#CAD7DC')
 if hung:d.rectangle((*q(0,1.2),*q(1,1)),fill='#DDE8E5',outline=GREEN,width=2)
 d.rectangle((*q(x0,back),*q(x0+width,FRONT)),fill='#E8BD7C',outline=ORANGE,width=3)
 dash(q(0,0),q(1,0),BLUE)
 text(px+u+15,q(1,0)[1]-12,'Z=0',20,BLUE)
 for x in (0,.5,1):text(q(x,-1)[0]-9,py+8,f'{x:g}',19)
 dim(q(1.23,FRONT),q(1.23,back),f'深{depth:g}',(px+u+65,q(1,.35)[1]))
 dim(q(-.12,-1),q(-.12,FRONT),'0.5',(px-80,q(0,-.75)[1]-12))
 return q
for i,(side,x0,hung) in enumerate((('左半',0,True),('右半',.5,True),('左半',0,False),('右半',.5,False))):
 cx=45+(i%2)*1235;cy=2565+(i//2)*605
 back,depth,name=form(hung)
 d.rounded_rectangle((cx,cy,cx+1175,cy+580),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+22,f'{side}平台 · 宽0.5 × 厚0.2示例 × {name}',30,BLUE)
 text(cx+70,cy+82,'透视与整格参照线框',24)
 text(cx+690,cy+82,'水平俯视 XZ｜上方是后沿'+('与墙' if hung else '，无墙'),24)
 wall,inds=cuboid(0,0,1,1,1,.2)
 slab,sinds=cuboid(x0,.3,FRONT,.5,.2,depth)
 ox,oy=cx+285,cy+315
 p=lambda v:project(v,ox,oy)
 solids(p,([(wall,inds,WALL_FACES)] if hung else [])+[(slab,sinds,SLAB_FACES)])
 # Empty half is a reference outline, not another solid platform.
 ref,_=cuboid(0,.3,-1,1,.2,2)
 for j,k in EDGES:dash(p(ref[j]),p(ref[k]))
 line(p((x0,.502,0)),p((x0+.5,.502,0)),BLUE,4)
 text(cx+60,cy+470,'灰虚线：完整格子1宽×深2；另一半留空',23)
 q=plan(cx,cy+455,x0,.5,hung,back,depth)
 dash(q(.5,-1),q(.5,1),INK)
 text(cx+28,cy+533,f'{side}占半格，另一半X留空；前沿固定+0.5，前方留0.5。',23)
text(60,3800,'半宽是几何定义：碰撞承托范围也需相应缩为半格；同格左右拼合是否允许需另定，不自动视为已实现。',26,ORANGE)
im.crop((0,2405,W,H)).save(ROOT/'public/concepts/platform-half-plan.png')
for axis in (R,U,F):assert math.isclose(dot(axis,axis),1)
assert abs(dot(R,U))<1e-10 and abs(dot(U,F))<1e-10
im.save(ROOT/'public/concepts/platform-mount-perspective.png')
print('Four platform alignment examples generated; two forms and dimensional checks passed.')

# Front edge is fixed; only the back follows the wall.
W,H=2500,2430
im=Image.new('RGB',(W,H),'#F5F3EE');d=ImageDraw.Draw(im)
text(55,30,'平台前后位置｜前沿固定 · 背面随墙',48)
text(60,108,'背后无墙：深1，以人物Z=0居中。背后有墙：从墙面挂出1.5。两种前沿都在Z=+0.5，玩家不能调整前后位置。',29,BLUE)
text(60,161,'形态按“背后有没有墙”自动决定；墙被拆除或补上时，平台随之换形态。',27)
text(60,211,'统一示例：背景墙在后沿Z=[−1.2,−1]，墙面Z=−1、厚0.2；平台顶Y=0.5、板厚0.2。安装支撑方式另定。',26)
for i,(label,x0,width,hung) in enumerate((label,x0,width,hung) for label,x0,width in (('整宽',0,1),('左半',0,.5),('右半',.5,.5)) for hung in (False,True)):
 cx=45+(i%2)*1235;cy=275+(i//2)*655
 back,depth,name=form(hung)
 d.rounded_rectangle((cx,cy,cx+1175,cy+625),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+22,f'{label} · 宽{width:g} × {name}',33,BLUE)
 text(cx+28,cy+78,f'Z=[{-back:g}, {-FRONT:g}]；'+('背面贴墙面Z=−1。' if hung else '背后无墙，离格子背面0.5。'),25)
 text(cx+70,cy+127,'透视 + 整格线框',24)
 text(cx+680,cy+127,'XZ水平俯视｜上方是后沿'+('与墙' if hung else '，无墙'),24)
 wall,inds=cuboid(0,0,1,1,1,.2)
 slab,sinds=cuboid(x0,.3,FRONT,width,.2,depth)
 ox,oy=cx+285,cy+350
 p=lambda v:project(v,ox,oy)
 solids(p,([(wall,inds,WALL_FACES)] if hung else [])+[(slab,sinds,SLAB_FACES)])
 ref,_=cuboid(0,.3,-1,1,.2,2)
 for j,k in EDGES:dash(p(ref[j]),p(ref[k]))
 line(p((x0,.502,0)),p((x0+width,.502,0)),BLUE,4)
 text(cx+60,cy+510,'灰框：完整格子深2；蓝线：人物Z=0',23)
 plan(cx-10,cy+520,x0,width,hung,back,depth)
 text(cx+680,cy+550,'橙色实体；前方留0.5',23,ORANGE)
 text(cx+28,cy+572,'前沿固定+0.5；X宽度和落脚高度独立选择。',25)
text(60,2278,'共6种宽度×形态组合；高度对齐（整砖顶、半砖顶）另计。两种形态都可以放家具。',28,BLUE)
text(60,2340,'厚0.2仍为示例。支架方式未定；不得为贴墙把深1平台整体后移到Z=[−1,0]。',27)
im.save(ROOT/'public/concepts/platform-position-plan.png')
print('Six platform position examples generated; front edge and wall contact checked.')
