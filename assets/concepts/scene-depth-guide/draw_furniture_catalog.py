"""Furniture design proposals: common perspective, tile rulers and geometry wireframes."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/concepts'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#23394A'; BLUE='#326BB0'; GREEN='#59846A'; ORANGE='#B96F36'; GRAY='#B7C8CE'
WOOD='#C7A477'; NAVY='#344D62'; IVORY='#E1E5DA'; CYAN='#65CBD9'
ITEMS=[
 ('bed','01 床',3,1,1,'1 必须做 · 休息','夜里睡到天亮、回血；已有3×1尺寸草案。','地面支撑；躺卧外观另定，不填满包围盒。'),
 ('lamp','02 吊灯',1,1,1,'1 必须做 · 房屋照明','宽1×高1沿用最新定义；深1已确认。','顶部贴天花板实际底面；避开门洞与跳跃通口。'),
 ('station','03 算力工作站',2,2,1,'1 必须做 · 算力','新尺寸提案；屏幕、主机、操作台合成一件。','地面支撑；无须额外买桌椅才能产出算力。'),
 ('depot','04 储物仓 / 材料柜',2,2,1,'1 必须做 · 材料','新尺寸提案；承接木材、石料存放与仓库扩容。','地面支撑；不是另加个人背包或多种箱子系统。'),
 ('dock','05 机器人坞',3,2,1,'1 必须做 · 机器人','新尺寸提案；一件含2机位，停靠、充电与升级。','上方保留进出空间；机位占区不等于全实心。'),
 ('battery','06 蓄电池柜',1,2,1,'1 必须做 · 电力','新尺寸提案；独立储能设施，不藏在装饰柜中。','地面支撑；可并排扩容，电力数值另见系统。'),
 ('terminal','07 交易终端',1,2,1,'1 必须做 · 交易','同一造型，两种标识：算力商 / 机器人技师。','新尺寸提案；两种交互职责仍分别保留。'),
 ('solar','08 太阳能板',1,.5,1,'1 必须做 · 室外设施','每块占宽1格；高0.5参照旧资源，深1已确认。','屋顶或室外；开局4块，不纳入室内家具数量。'),
 ('table','09 普通桌',3,2,1,'2 选做 · 生活陈设','3×2是既有放置草案，不表示台面高2。','台面高1.2为示例；桌子不自动拥有工作站功能。'),
 ('chair','10 椅子',1,2,1,'2 选做 · 生活陈设','新尺寸提案；座面高0.7，为配桌示意。','坐姿与使用动画未定；不是NPC入住必需条件。'),
 ('shelf','11 置物架',2,2,1,'2 选做 · 装饰收纳','新尺寸提案；先作陈设，不增加额外库存容量。','地面支撑；需要功能储物时使用04储物仓。'),
 ('plant','12 盆栽',1,2,1,'2 选做 · 室内装饰','新尺寸提案；纯装饰，不引入种植和收获系统。','图示放在中间空间；可用预留区但需另定位置。'),
]
assert all(item[4] == 1 for item in ITEMS)
a,e=map(math.radians,(25,17))
R=(math.cos(a),0,math.sin(a)); U=(-math.sin(a)*math.sin(e),math.cos(e),math.cos(a)*math.sin(e)); F=(-math.sin(a)*math.cos(e),-math.sin(e),math.cos(a)*math.cos(e))
def dot(v,b):return sum(x*y for x,y in zip(v,b))
def project(v,ox,oy):
 v=(v[0]-1.5,v[1]-1,v[2]); dep=14+dot(v,F)
 return ox+125*14*dot(v,R)/dep,oy-125*14*dot(v,U)/dep
EDGES=((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))
FACES=((0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2))
def cube(x,y,z,w,h,dep):return [(x+dx*w,y+dy*h,z+dz*dep) for dx,dy,dz in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]
def model(kind,w,h,dep):
 parts=[];front=.5-dep
 def box(x,y,z,bw,bh,bd,c):
  assert x>=0 and y>=0 and z>=front-1e-8 and x+bw<=w+1e-8 and y+bh<=h+1e-8 and z+bd<=.5+1e-8,(kind,x,y,z,bw,bh,bd)
  parts.append((cube(x,y,z,bw,bh,bd),c))
 if kind=='bed':
  for x in (.08,w-.2):
   for z in (front+.05,.35):box(x,0,z,.12,.4,.12,NAVY)
  box(0,.28,front,w,.18,dep,WOOD);box(.08,.46,front+.02,w-.16,.24,dep-.04,IVORY)
  box(.75,.7,front+.02,2.1,.08,dep-.04,'#578DB3');box(.12,.7,front+.1,.55,.12,dep-.2,'#F5F2E6')
  box(0,.3,front,.09,.7,dep,WOOD)
 elif kind=='lamp':
  box(.32,.9,front+dep/2-.13,.36,.1,.26,NAVY);box(.48,.35,front+dep/2-.02,.04,.55,.04,NAVY)
  box(.15,.22,front+.06,.7,.13,dep-.12,WOOD);box(0,.04,front,1,.18,dep,WOOD);box(.04,0,front+.02,.92,.04,dep-.04,CYAN)
 elif kind=='station':
  for x in (.05,1.65):box(x,0,front+.05,.3,1.05,dep-.1,NAVY)
  box(0,1,front,2,.16,dep,WOOD);box(.25,1.4,.32,1.5,.6,.18,NAVY);box(.32,1.47,.30,1.36,.44,.02,CYAN)
  box(.88,1.16,.34,.24,.24,.12,NAVY);box(.45,1.16,front+.06,1.1,.035,.22,'#9CB5BD')
  box(.08,.1,front+.03,.44,.74,.5,NAVY)
 elif kind=='depot':
  box(0,0,front,2,.16,dep,NAVY)
  for y in (.18,1.1):
   box(.04,y,front+.02,1.92,.88,dep-.04,WOOD)
   for x in (.15,1.78):box(x,y,front,.06,.88,.025,NAVY)
   box(.88,y+.33,front-.0,.24,.14,.025,IVORY)
 elif kind=='dock':
  box(0,0,front,3,.15,dep,NAVY)
  for x in (.3,1.7):box(x,.15,front+.04,1,.06,dep-.08,CYAN)
  for x in (0,2.85):box(x,.15,.35,.15,1.85,.15,NAVY)
  box(0,1.8,.35,3,.2,.15,WOOD)
  for x in (.8,2.2):box(x,.9,.38,.1,.9,.08,CYAN)
 elif kind=='battery':
  box(.03,0,front,.94,1.95,dep,NAVY);box(.14,1.95,front+.12,.72,.05,dep-.24,IVORY)
  for y in (.22,.6,.98,1.36):box(.15,y,front,.5,.25,.035,CYAN)
  box(.77,.2,front,.1,1.5,.035,WOOD)
 elif kind=='terminal':
  box(.13,0,front,.74,.12,dep,NAVY);box(.38,.12,front+.16,.24,1.04,.18,NAVY)
  box(0,1.16,front+.25,1,.84,.25,NAVY);box(.08,1.25,front+.23,.84,.58,.02,CYAN)
  box(.18,1.9,front+.23,.64,.06,.02,WOOD)
 elif kind=='solar':
  box(.43,0,front+.18,.14,.4,.35,NAVY);box(0,.4,front,1,.1,dep,NAVY)
  for x in (.04,.35,.66):
   for z in (front+.04,front+dep/2+.02):box(x,.5-.015,z,.28,.015,dep/2-.06,'#4C88B6')
 elif kind=='table':
  for x in (.12,w-.26):
   for z in (front+.06,.32):box(x,0,z,.14,1.06,.12,NAVY)
  box(0,1.06,front,w,.14,dep,WOOD)
 elif kind=='chair':
  for x in (.12,.76):
   for z in (front+.05,.34):box(x,0,z,.12,.62,.12,NAVY)
  box(.05,.62,front,.9,.08,dep,WOOD)
  for x in (.08,.82):box(x,.7,.4,.1,1.3,.1,NAVY)
  box(.08,1.05,.4,.84,.95,.1,WOOD)
 elif kind=='shelf':
  for x in (0,1.9):box(x,0,front,.1,2,dep,NAVY)
  for y in (0,.9,1.9):box(0,y,front,2,.1,dep,WOOD)
  for i in range(5):box(.2+i*.18,1,.28,.12,.55+(i%2)*.16,.22,['#688CAF',WOOD][i%2])
 elif kind=='plant':
  box(.2,0,front+.04,.6,.55,dep-.08,WOOD);box(.46,.55,front+.22,.06,1.45,.06,GREEN)
  for x,y in ((.02,1.15),(.5,1.4),(.12,1.7)):box(x,y,front+.17,.46,.15,.16,'#7C9C63')
 return parts
for axis in (R,U,F):assert math.isclose(dot(axis,axis),1)
assert abs(dot(R,U))<1e-10
for page in range(3):
 im=Image.new('RGB',(2500,2100),'#F5F3EE');d=ImageDraw.Draw(im)
 def text(x,y,s,n=27,c=INK):
  f=ImageFont.truetype(FONT,n);b=d.textbbox((x,y),s,font=f)
  assert b[2]<2480 and b[3]<2090,(s,b)
  d.text((x,y),s,font=f,fill=c)
 def line(a,b,c=GRAY,width=2):d.line((a,b),fill=c,width=width)
 def dash(a,b,c=GRAY):
  n=max(1,math.ceil(math.dist(a,b)/10))
  for i in range(0,n,2):line(tuple(a[j]+(b[j]-a[j])*i/n for j in (0,1)),tuple(a[j]+(b[j]-a[j])*min(i+1,n)/n for j in (0,1)),c,1)
 def dim(a,b,label,xy):
  line(a,b,BLUE);ang=math.atan2(b[1]-a[1],b[0]-a[0])
  for v,t in ((a,ang),(b,ang+math.pi)):
   for dt in (-.45,.45):line(v,(v[0]+10*math.cos(t+dt),v[1]+10*math.sin(t+dt)),BLUE)
  text(*xy,label,23,BLUE)
 titles=['01 必须做｜休息、照明、算力与储物','02 必须做｜机器人、电力与交易','03 选做｜普通桌椅与装饰']
 text(55,30,titles[page],46)
 text(60,100,'按当前阶段1玩法建议分级；图为新概念方案，不是现有游戏模型截图。家具深1已确认，新增宽高待确认。',29,BLUE)
 text(60,153,'每件均附实体透视、同镜头线框及宽高深；灰虚线是放置包围盒，不是实心碰撞体。',27)
 for i,item in enumerate(ITEMS[page*4:page*4+4]):
  kind,title,w,h,dep,priority,note,rule=item
  cx=40+(i%2)*1240;cy=210+(i//2)*880
  d.rounded_rectangle((cx,cy,cx+1190,cy+850),18,fill='white',outline='#D5E0E5',width=2)
  text(cx+26,cy+20,title,36,BLUE);text(cx+26,cy+77,priority,25,ORANGE if page==2 else GREEN)
  text(cx+26,cy+120,f'放置包围：宽{w:g} × 高{h:g} × 深{dep:g} 格',29)
  text(cx+120,cy+183,'实体透视',24);text(cx+740,cy+183,'同镜头线框',24)
  parts=model(kind,w,h,dep)
  for wire,ox in ((False,cx+335),(True,cx+895)):
   oy=cy+418
   # Center every object's envelope without changing camera or world scale.
   def p(v):return project((v[0]+(3-w)/2,v[1],v[2]),ox,oy)
   for x in range(math.ceil(w)+1):line(p((x,0,-.5)),p((x,0,.5)),'#DAE3E6',1)
   for z in (-.5,0,.5):line(p((0,0,z)),p((w,0,z)),'#DAE3E6',1)
   if wire:
    for verts,c in parts:
     for j,k in EDGES:line(p(verts[j]),p(verts[k]),GREEN if kind=='plant' else BLUE,1)
   else:
    faces=[]
    for verts,c in parts:
     rgb=tuple(int(c[k:k+2],16) for k in (1,3,5))
     for fi,ids in enumerate(FACES):
      pts=[verts[k] for k in ids];factor=(.94,.83,.69,1.08,.85,.78)[fi]
      col=tuple(min(255,round(t*factor)) for t in rgb)
      faces.append((sum(dot(v,F) for v in pts)/4,pts,col))
    for _,pts,c in sorted(faces,key=lambda v:v[0],reverse=True):
     xy=[p(v) for v in pts];d.polygon(xy,fill=c);d.line(xy+xy[:1],fill='#6B8088',width=2)
   envelope=cube(0,0,.5-dep,w,h,dep)
   for j,k in EDGES:dash(p(envelope[j]),p(envelope[k]))
   # One-unit ticks retain the same scale for every object, including empty table headroom.
   for y in range(math.floor(h)+1):line(p((-.10,y,.5-dep)),p((0,y,.5-dep)),ORANGE,2)
   dim(p((0,-.24,.5-dep)),p((w,-.24,.5-dep)),f'宽{w:g}',(ox-40,oy+195))
   dim(p((w+.16,0,.5-dep)),p((w+.16,h,.5-dep)),f'高{h:g}',(ox+160,oy-130))
   dim(p((w+.14,0,.5-dep)),p((w+.14,0,.5)),f'深{dep:g}',(ox+145,oy+110))
  text(cx+27,cy+690,note,25)
  text(cx+27,cy+740,rule,25)
  text(cx+27,cy+792,'已确认深1，Z=[−0.5,+0.5]；前后不另留人物通道，不占墙厚。',23,BLUE)
 text(60,2020,'统一世界单位；家具统一深1；平台深0.75/0.5分别定义。墙仍完整1×1×0.2，固定偏移未定。',26)
 text(60,2060,'人物外观高3.1格；3.3是头身比例。床桌占格是草案，碰撞、坐卧姿态与交互范围需分别定义。',25,ORANGE)
 name=('furniture-essential-home.png','furniture-essential-systems.png','furniture-optional.png')[page]
 im.save(OUT/name)
 print(f'Saved {name}; all part bounds checked, shared camera basis verified.')
