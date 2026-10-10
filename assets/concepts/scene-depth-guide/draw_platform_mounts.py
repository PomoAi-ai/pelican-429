"""Four platform depth/placement examples using one rigid perspective camera."""
from pathlib import Path
import math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
W,H=2500,4840
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
 return (ox+280*6*dot(v,R)/depth,oy-280*6*dot(v,U)/depth)
def cuboid(x,y,z,w,h,dep):
 v=[(x+dx*w,y+dy*h,z+dz*dep) for dx,dy,dz in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]
 return v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]
EDGES=((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))
text(55,28,'平台物理形态｜高度对齐 × 两种深度',48)
text(60,103,'已确认深度：3/4格（0.75）、2/4格（0.5）。宽1、板厚0.2暂作示例；墙板完整1×1。',29,BLUE)
text(60,154,'行看高度对齐，列看深度。只允许以人物平面Z=0居中；取消贴墙与任意前后偏移。',27)
cases=[(title,depth,top,candidate) for title,top,candidate in [('整砖顶面对齐',1,False),('半砖顶面对齐',.5,False),('墙格底边对齐',.2,True)] for depth in (.75,.5)]
for i,(title,depth,top,candidate) in enumerate(cases):
 gap=.5-depth/2;bottom=top-.2
 cx=45+(i%2)*1235;cy=215+(i//2)*945
 front=-depth/2;back=depth/2
 d.rounded_rectangle((cx,cy,cx+1175,cy+915),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+23,f'{title} · 深'+('3/4' if depth==.75 else '2/4'),35,BLUE)
 text(cx+28,cy+79,f'平台顶Y={top:g}，底Y={bottom:g}；'+('底边对齐是候选示例' if candidate else '落脚面与砖顶齐平'),27)
 text(cx+90,cy+133,'实体透视',25)
 text(cx+705,cy+133,'同镜头线框',25)
 wall,faces=cuboid(0,0,.5,1,1,.2)
 slab,sfaces=cuboid(0,bottom,front,1,.2,depth)
 for wire,ox in ((False,cx+270),(True,cx+845)):
  oy=cy+355;p=lambda v:project(v,ox,oy)
  if not wire:
   scene=[]
   for verts,inds,colors in ((wall,faces,('#DDE8E5','#B8CDC7','#A6BCB8','#E8F0ED','#B1C5C1','#BDCECB')),(slab,sfaces,('#C99651','#B98749','#956D40','#E8BD7C','#BD915E','#AD7D45'))):
    for ids,col in zip(inds,colors):
     pts=[verts[j] for j in ids];scene.append((sum(dot(v,F) for v in pts)/4,pts,col))
   for _,pts,col in sorted(scene,key=lambda item:item[0],reverse=True):
    xy=[p(v) for v in pts];d.polygon(xy,fill=col);d.line(xy+xy[:1],fill='#6C8585',width=2)
  else:
   for verts,c in ((wall,GREEN),(slab,ORANGE)):
    for j,k in EDGES:line(p(verts[j]),p(verts[k]),c,2)
  # Gameplay plane cut across the platform top, at its actual Z=0 location.
  line(p((0,top+.002,0)),p((1,top+.002,0)),BLUE,4)
  # Alignment reference follows the same camera as wall and slab.
  ref_y=0 if candidate else top
  dash(p((-.18,ref_y,.5)),p((1.2,ref_y,.5)),BLUE)
  dim(p((1.13,bottom,front)),p((1.13,bottom,back)),f'深{depth:g}',(ox+170,oy+105))
  if gap:
   dim(p((1.06,.5,back)),p((1.06,.5,.5)),f'缝{gap:g}',(ox+105,oy-105),ORANGE)
 text(cx+28,cy+565,'YZ侧剖方格｜每大格1，小格0.1；蓝虚线为人物平面Z=0',24,BLUE)
 # Equal-scale side section: depth direction horizontal, height vertical.
 sx=cx+280;sy=cy+812;unit=220
 q=lambda z,y:(sx+(z+1)*unit,sy-y*unit)
 for k in range(21):line(q(-1+k*.1,0),q(-1+k*.1,1),'#E6ECEE',1)
 for k in range(11):line(q(-1,k*.1),q(1,k*.1),'#E6ECEE',1)
 d.rectangle((*q(.5,1),*q(.7,0)),fill='#DDE8E5',outline=GREEN,width=2)
 d.rectangle((*q(front,top),*q(back,bottom)),fill='#E8BD7C',outline=ORANGE,width=2)
 dash(q(0,0),q(0,1),BLUE)
 for z in (-1,-.5,0,.5,1):text(q(z,0)[0]-14,sy+12,f'{z:g}',19,BLUE)
 dim(q(front,-.08),q(back,-.08),f'深{depth:g}',(q(front,-.08)[0],sy+30))
 if gap:dim(q(back,.65),q(.5,.65),f'缝{gap:g}',(q(back,.65)[0]-5,sy-185),ORANGE)
 text(cx+30,cy+670,f'顶面Y={top:g}',24,ORANGE)
 dash(q(-.9,0 if candidate else top),q(.8,0 if candidate else top),BLUE)
 text(cx+30,cy+625,'对齐基准：'+('底边' if candidate else '砖顶'),24,BLUE)
 text(cx+30,cy+715,'板厚0.2 ↓',24,ORANGE)
 text(cx+800,cy+670,'墙厚0.2',24,GREEN)
 text(cx+800,cy+715,'墙板完整1×1',24,GREEN)
 text(cx+28,cy+865,f'深{depth:g}；平台Z=[{front:g}, {back:g}]；平台顶Y={top:g}、底Y={bottom:g}。',23)
 assert front<=0<=back and math.isclose(back-front,depth) and math.isclose(.5-back,gap)
 assert math.isclose(front,-back) and front<0<back and front>=-.5 and back<=.5
 assert depth in (.75,.5) and math.isclose(top-bottom,.2)
text(60,3090,'1 必须做：中间2/4格（深0.5）必须支持，不能用3/4替代；左右半宽组合不因此全必做。',27,BLUE)
text(60,3150,'墙格底边对齐：本图按平台底面Y=0画，顶面为Y=0.2；这是候选，不等于落脚面在Y=0。',27,ORANGE)
text(60,3210,'唯一前后位置：居中Z=[−D/2,+D/2]。深0.5为[−0.25,+0.25]；深0.75为[−0.375,+0.375]。',27)
text(60,3270,'板厚0.2仅示例，0.5厚款未定；同层拼接按落脚面齐平。蓝线标人物平面，侧剖小格0.1为标尺。',26)
text(60,3390,'左右半格平台｜正面X方向分半，俯视看X宽度与Z深度',40,BLUE)
text(60,3450,'中间2/4格深度必须支持；左右半宽组合仍按需。左半X=[0,0.5]，右半X=[0.5,1]。',27)
for i,(side,x0,depth) in enumerate((('左半',0,.75),('右半',.5,.75),('左半',0,.5),('右半',.5,.5))):
 cx=45+(i%2)*1235;cy=3510+(i//2)*605
 front=-depth/2;back=depth/2
 d.rounded_rectangle((cx,cy,cx+1175,cy+580),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+22,f'{side}平台 · 宽0.5 × 厚0.2示例 × 深{depth:g}',30,BLUE)
 text(cx+70,cy+82,'透视与整格参照线框',24)
 text(cx+690,cy+82,'水平俯视 XZ｜上方是墙',24)
 wall,inds=cuboid(0,0,.5,1,1,.2)
 slab,sinds=cuboid(x0,.3,front,.5,.2,depth)
 ox,oy=cx+285,cy+315
 p=lambda v:project(v,ox,oy)
 scene=[]
 for verts,faces,colors in ((wall,inds,('#DDE8E5','#B8CDC7','#A6BCB8','#E8F0ED','#B1C5C1','#BDCECB')),(slab,sinds,('#C99651','#B98749','#956D40','#E8BD7C','#BD915E','#AD7D45'))):
  for face_ids,col in zip(faces,colors):
   pts=[verts[j] for j in face_ids];scene.append((sum(dot(v,F) for v in pts)/4,pts,col))
 for _,pts,col in sorted(scene,key=lambda item:item[0],reverse=True):
  xy=[p(v) for v in pts];d.polygon(xy,fill=col);d.line(xy+xy[:1],fill='#6C8585',width=2)
 # Empty half is a reference outline, not another solid platform.
 ref,_=cuboid(0,.3,front,1,.2,depth)
 for j,k in EDGES:dash(p(ref[j]),p(ref[k]))
 line(p((x0,.502,0)),p((x0+.5,.502,0)),BLUE,4)
 text(cx+60,cy+470,'灰虚线：完整1格宽；另一半留空',23)
 # True top view: X and Z use the same scale, without perspective distortion.
 u=245;px=cx+690;py=cy+425
 q=lambda x,z:(px+x*u,py-(z+.5)*u)
 for k in range(5):
  dash(q(k*.25,-.5),q(k*.25,.5),'#CAD7DC')
  dash(q(0,-.5+k*.25),q(1,-.5+k*.25),'#CAD7DC')
 d.rectangle((*q(0,.7),*q(1,.5)),fill='#DDE8E5',outline=GREEN,width=2)
 d.rectangle((*q(x0,back),*q(x0+.5,front)),fill='#E8BD7C',outline=ORANGE,width=3)
 dash(q(.5,-.5),q(.5,.5),INK)
 dash(q(0,0),q(1,0),BLUE)
 text(px+u+15,q(1,0)[1]-12,'Z=0',20,BLUE)
 for x in (0,.5,1):text(q(x,-.5)[0]-9,py+8,f'{x:g}',19)
 dim(q(x0,-.65),q(x0+.5,-.65),'宽0.5',(q(x0,-.65)[0],py+52))
 dim(q(1.23,front),q(1.23,back),f'深{depth:g}',(px+u+65,cy+175))
 text(cx+28,cy+533,f'{side}占半格；Z方向只许居中，另一半X留空。墙板仍为完整1×1。',23)
 assert math.isclose((x0+.5)-x0,.5) and math.isclose(back-front,depth) and math.isclose(front,-back)
text(60,4745,'半宽是几何定义：碰撞承托范围也需相应缩为半格；同格左右拼合是否允许需另定，不自动视为已实现。',26,ORANGE)
im.crop((0,3350,W,H)).save(ROOT/'public/concepts/platform-half-plan.png')
for axis in (R,U,F):assert math.isclose(dot(axis,axis),1)
assert abs(dot(R,U))<1e-10 and abs(dot(U,F))<1e-10
im.save(ROOT/'public/concepts/platform-mount-perspective.png')
print('Six platform alignment examples generated; two depths and dimensional checks passed.')

# Installation position is independent of width, depth and top alignment.
W,H=2500,2430
im=Image.new('RGB',(W,H),'#F5F3EE');d=ImageDraw.Draw(im)
text(55,30,'平台允许形态｜只许居中 · 两种深度',48)
text(60,108,'1 必须做：中间2/4格（深0.5）必须支持，不能用3/4替代；左右半宽组合不因此全必做。',29,BLUE)
text(60,161,'取消贴墙和任意前后偏移：人物Z=0必须位于平台深度中间，不能落在平台前沿。',27)
text(60,211,'统一示例：墙面Z=+0.5，墙厚0.2；平台顶Y=0.5、板厚0.2。安装支撑方式另定。',26)
for i,(label,x0,width,depth) in enumerate((label,x0,width,depth) for label,x0,width in (('整宽',0,1),('左半',0,.5),('右半',.5,.5)) for depth in (.75,.5)):
 cx=45+(i%2)*1235;cy=275+(i//2)*655
 front=-depth/2;back=depth/2;gap=.5-back
 d.rounded_rectangle((cx,cy,cx+1175,cy+625),18,fill='white',outline='#D5E0E5',width=2)
 text(cx+28,cy+22,f'{label} · 宽{width:g} × 深{depth:g}｜居中离墙',33,BLUE)
 text(cx+28,cy+78,f'居中Z=[{front:g}, {back:g}]；离示例墙面{gap:g}格。',25)
 text(cx+70,cy+127,'居中透视 + 整格线框',24)
 text(cx+680,cy+127,'XZ水平俯视｜上方是墙',24)
 wall,inds=cuboid(0,0,.5,1,1,.2)
 slab,sinds=cuboid(x0,.3,front,width,.2,depth)
 ox,oy=cx+285,cy+350
 p=lambda v:project(v,ox,oy)
 scene=[]
 for verts,faces,colors in ((wall,inds,('#DDE8E5','#B8CDC7','#A6BCB8','#E8F0ED','#B1C5C1','#BDCECB')),(slab,sinds,('#C99651','#B98749','#956D40','#E8BD7C','#BD915E','#AD7D45'))):
  for ids,col in zip(faces,colors):
   pts=[verts[j] for j in ids];scene.append((sum(dot(v,F) for v in pts)/4,pts,col))
 for _,pts,col in sorted(scene,key=lambda item:item[0],reverse=True):
  xy=[p(v) for v in pts];d.polygon(xy,fill=col);d.line(xy+xy[:1],fill='#6C8585',width=2)
 ref,_=cuboid(0,.3,-.5,1,.2,1)
 for j,k in EDGES:dash(p(ref[j]),p(ref[k]))
 line(p((x0,.502,0)),p((x0+width,.502,0)),BLUE,4)
 dim(p((1.14,.5,back)),p((1.14,.5,.5)),f'缝{gap:g}',(ox+175,oy-30),ORANGE)
 text(cx+60,cy+510,'灰框：中间完整1格；蓝线：人物Z=0',23)
 u=265;px=cx+680;py=cy+475
 q=lambda x,z:(px+x*u,py-(z+.5)*u)
 for k in range(5):
  dash(q(k*.25,-.5),q(k*.25,.5),'#CAD7DC')
  dash(q(0,-.5+k*.25),q(1,-.5+k*.25),'#CAD7DC')
 d.rectangle((*q(0,.7),*q(1,.5)),fill='#DDE8E5',outline=GREEN,width=2)
 d.rectangle((*q(x0,back),*q(x0+width,front)),fill='#E8BD7C',outline=ORANGE,width=3)
 dash(q(0,0),q(1,0),BLUE)
 text(px+u+12,q(1,0)[1]-10,'Z=0',20,BLUE)
 dim(q(1.2,back),q(1.2,.5),f'缝{gap:g}',(px+u+65,cy+174),ORANGE)
 dim(q(-.12,front),q(-.12,back),f'{depth:g}',(px-70,cy+340))
 for x in (0,.5,1):text(q(x,-.5)[0]-9,py+9,f'{x:g}',19)
 text(cx+680,cy+515,'橙色实体；蓝线穿过深度中间',23,ORANGE)
 text(cx+28,cy+572,'居中：前后各留'+f'{gap:g}格；X宽度和落脚高度独立选择。',25)
 assert math.isclose(back-front,depth) and math.isclose(front,-back)
 assert gap>0 and front>=-.5 and back<.5 and math.isclose(front+.5,gap)
text(60,2278,'共6种宽度×深度组合，不再是12种；前后位置固定居中，高度对齐另计。',28,BLUE)
text(60,2340,'不要求全部组合实现；厚0.2仍为示例。支架或悬挂方式未定，不得靠偏移平台贴墙。',27)
im.save(ROOT/'public/concepts/platform-position-plan.png')
print('Six centered platform examples generated; width, depth, symmetry and wall gaps checked.')
