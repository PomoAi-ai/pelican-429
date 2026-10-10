"""Wireframe room cutaway and dimensioned plan, drawn locally with Pillow."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/concepts/room-space-perspective.png'
im=Image.new('RGB',(2400,1700),'#FAFBFC')
d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK,MUTED,BLUE,ORANGE,GRID='#203B4E','#657783','#326BB0','#C06A32','#D7E0E5'

def text(x,y,s,size=28,color=INK):
    f=ImageFont.truetype(FONT,size)
    bounds=d.textbbox((x,y),s,font=f)
    assert bounds[0]>=15 and bounds[2]<2380 and bounds[3]<1690,(s,bounds)
    d.text((x,y),s,font=f,fill=color)

def arrow(a,b,color=BLUE,width=4):
    d.line((a,b),fill=color,width=width)
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    d.polygon([b,(b[0]-15*math.cos(angle-.4),b[1]-15*math.sin(angle-.4)),(b[0]-15*math.cos(angle+.4),b[1]-15*math.sin(angle+.4))],fill=color)

def dashed(a,b,color=MUTED):
    length=math.dist(a,b)
    for t in range(0,round(length),22):
        end=min(t+11,length)
        d.line([tuple(a[i]+(b[i]-a[i])*t/length for i in range(2)),tuple(a[i]+(b[i]-a[i])*end/length for i in range(2))],fill=color,width=3)

def dimension(a,b,label,xy):
    arrow(a,b,BLUE,2);arrow(b,a,BLUE,2)
    for x,y in (a,b):d.ellipse((x-3,y-3,x+3,y+3),fill=BLUE)
    text(*xy,label,29,BLUE)

def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def norm(v):return tuple(x/math.sqrt(dot(v,v)) for x in v)
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

# This inspection camera is intentionally different from the frontal gameplay camera.
EYE=(12,8,14);TARGET=(3.3,1.7,-.25)
FORWARD=norm(sub(TARGET,EYE));RIGHT=norm(cross(FORWARD,(0,1,0)));UP=cross(RIGHT,FORWARD)
FOCAL=2350;CX,CY=1050,748

def project(x,y,z):
    v=sub((x,y,z),EYE);depth=dot(v,FORWARD)
    assert depth>0
    return (CX+FOCAL*dot(v,RIGHT)/depth,CY-FOCAL*dot(v,UP)/depth)

DOOR_THICKNESS=.14  # Matches the shared runtime door width.
ROOM_END=6+DOOR_THICKNESS
faces=[]
def face(points,color):
    depth=sum(dot(sub(p,EYE),FORWARD) for p in points)/len(points)
    faces.append((depth,points,color))

def box(x,y,z,w,h,depth,front,top,side):
    # Positive X/Y/Z faces are visible from this camera; hidden faces are omitted.
    face([(x,y,z+depth),(x+w,y,z+depth),(x+w,y+h,z+depth),(x,y+h,z+depth)],front)
    face([(x,y+h,z),(x+w,y+h,z),(x+w,y+h,z+depth),(x,y+h,z+depth)],top)
    face([(x+w,y,z),(x+w,y+h,z),(x+w,y+h,z+depth),(x+w,y,z+depth)],side)

text(60,35,'房间空间透视｜门、背景墙与地板',52)
text(63,108,'独立空间示意 · 横版玩法仍沿 X / Y · 此图采用斜上方观察镜头，专门看清房间内部，不代表游戏镜头',27,MUTED)
d.rounded_rectangle((50,175,2350,1240),20,fill='white',outline=GRID,width=2)
text(85,205,'01  空间剖开：背景墙与薄门框',34)
text(85,258,'示例内宽 6 格 / 高 4 格；沿用当前地形深 1.5 格。房间布局与背景墙安装位置为说明方案。',26,MUTED)

# Interior x=[0,6], y=[0,4], z=[-1,.5]; the thin door sits at the right boundary.
box(-.22,-.35,-1,ROOM_END+.22,.35,1.5,'#BEA588','#DCC9A8','#A38B72')
faces.pop(-2)  # The tiled top replaces the large face so painter ordering cannot erase seams.
face([(-.22,0,-1.14),(ROOM_END,0,-1.14),(ROOM_END,0,-1),(-.22,0,-1)],'#DCC9A8')
face([(-.22,0,-1),(0,0,-1),(0,0,.5),(-.22,0,.5)],'#DCC9A8')
# Draw actual ground footprint separately from the rear structural ledge.
for x in range(7):
    right=min(x+1,ROOM_END)
    face([(x,.002,-1),(right,.002,-1),(right,.002,.5),(x,.002,.5)],'#E4D3B6' if x%2==0 else '#DCC9A8')
# Back wall panels: proposed inner face at z=-1, actual kit thickness .14.
box(0,0,-1.14,6,4,.14,'#D7E3E9','#EAF0F2','#9DAEB9')
faces.pop(-3)  # The panel grid supplies the visible front face.
for x in range(6):
    for y in range(4):
        face([(x,y,-.998),(x+1,y,-.998),(x+1,y+1,-.998),(x,y+1,-.998)],'#D9E5EA' if (x+y)%2==0 else '#D0DEE5')
box(-.22,0,-1,.22,4,1.5,'#B7C5CE','#E5EBEE','#BFCFD9')
# Keep Y/Z dimensions for comparison; replace the one-tile X extrusion with a thin frame.
for z in (-.816,.316):
    box(6,.15,z-.11,DOOR_THICKNESS,2.7,.22,'#7196B6','#CFDEEB','#9DBAD2')
box(6,0,-.95,DOOR_THICKNESS,.15,1.4,'#688AA5','#B6CCDD','#54778F')
box(6,2.79,-.95,DOOR_THICKNESS,.21,1.4,'#688AA5','#B6CCDD','#54778F')
# Room wall above the gate; opening below remains clear in this open-door illustration.
box(6,3,-1,DOOR_THICKNESS,1,1.5,'#C3D3DE','#E5EDF1','#A6BECF')
for _,points,color in sorted(faces,reverse=True,key=lambda f:f[0]):
    pts=[project(*p) for p in points]
    d.polygon(pts,fill=color)
    d.line(pts+[pts[0]],fill='#607988',width=2)

# Z=0 floor trace: draw only the visible walking surface, rather than a third movement axis.
a,b=project(.35,.025,0),project(6,.025,0)
arrow(a,b,ORANGE,7)
# Roof and front cut lines explain the exposed room without inventing a glass wall.
for a,b in [((0,4,.5),(6,4,.5)),((0,4,-1),(6,4,-1))]:dashed(project(*a),project(*b),'#9CACB3')

# Leaders terminate at visible faces, and their text lives outside the room silhouette.
text(90,365,'背景墙',33,BLUE)
text(90,416,'在人物后方填充房间',27)
text(90,458,'此示例墙厚 0.14 格',27,MUTED)
d.line([(380,432),(470,432),project(1.1,2.7,-1)],fill=BLUE,width=3)
d.ellipse(tuple(v for p in [(project(1.1,2.7,-1)[0]-5,project(1.1,2.7,-1)[1]-5),(project(1.1,2.7,-1)[0]+5,project(1.1,2.7,-1)[1]+5)] for v in p),fill=BLUE)
text(1750,355,'薄门框 · 沿 X 穿过',33,BLUE)
text(1750,408,'沿通行方向厚 0.14 格（现行）',25,BLUE)
text(1750,453,'前后跨度 Z = 1.4 格 / 高 3 格',25,MUTED)
text(1750,498,'1.4 是跨地板的跨度，不是门厚。',25,MUTED)
d.line([(1730,425),(1670,425),project(ROOM_END,2,-.25)],fill=BLUE,width=3)
text(1750,605,'近侧敞开供观察',31)
text(1750,651,'虚线：切除边界；蓝线：门框',25,MUTED)
text(1750,724,'橙线：人物左右行走方向',26,ORANGE)
text(1750,768,'参考平面 Z = 0',27,ORANGE)

# Dimensions stay outside the rendered structure.
dimension(project(0,-.65,.65),project(6,-.65,.65),'房间内宽 6 格（示例）',(830,1105))
dimension(project(-.55,0,.6),project(-.55,4,.6),'高 4 格',(420,725))
dimension(project(ROOM_END+.6,-.12,-1),project(ROOM_END+.6,-.12,.5),'地板深 1.5 格',(1680,1010))
text(90,1176,'地板前缘只画剖切带，不表示实体高度；构件按前后遮挡。人物沿 X 通行，不沿 Z 走向背景墙。',27,MUTED)

# Exact-scale top view: physical depth remains readable even when perspective foreshortens it.
d.rounded_rectangle((50,1270,1510,1640),20,fill='white',outline=GRID,width=2)
text(85,1295,'02  俯视 XZ：门在右侧，背景墙在后侧',31)
u=110;px,py=185,1400
# Full interior depth 1.5; front cut edge is dashed, not an actual front wall.
d.rectangle((px,py,px+ROOM_END*u,py+1.5*u),fill='white',outline='#8A9EAA',width=2)
d.rectangle((px,py-.14*u,px+6*u,py),outline=BLUE,width=2)
for x in range(1,7):d.line((px+x*u,py,px+x*u,py+1.5*u),fill='#BCA98E',width=2)
for z in (-.816,.316):
    top=py+(z-.11+1)*u
    d.rectangle((px+6*u,top,px+ROOM_END*u,top+.22*u),fill='white',outline=BLUE,width=2)
dashed((px+(6+DOOR_THICKNESS/2)*u,py+.05*u),(px+(6+DOOR_THICKNESS/2)*u,py+1.45*u),BLUE)
arrow((px+.4*u,py+u),(px+(ROOM_END+.5)*u,py+u),ORANGE,4)
text(px+220,1354,'背景墙 · 内表面 Z = −1（示例）',24,BLUE)
text(px+180,1583,'近侧前沿 Z = +0.5',24,MUTED)
text(1020,1395,'后方 −Z',25,MUTED)
text(1020,1545,'前方 +Z',25,MUTED)
dimension((985,py),(985,py+1.5*u),'深 1.5 格',(1045,1475))
text(690,1583,'门厚 X = 0.14 格',23,BLUE)

d.rounded_rectangle((1540,1270,2350,1640),20,fill='white',outline=GRID,width=2)
text(1570,1295,'读图约定',31)
text(1570,1360,'共享门构件已改为 X 厚 0.14 格。',26,BLUE)
text(1570,1410,'房间 6×4、后墙位置为示例；门尺寸已同步。',25)
text(1570,1460,'暂保留原门高度；净高仍约 2.64，',26,ORANGE)
text(1570,1504,'仍需调整，图中不宣称角色已经能通过。',25,ORANGE)
text(1570,1570,'当前 1.5 格地形深度仍待设计确认。',26,MUTED)
text(60,1658,'本地 Python / Pillow 空间制图 · 结构观察镜头，不是实际游戏镜头 · 尺寸箭头连接对应边界',24,MUTED)

assert math.isclose(dot(RIGHT,UP),0,abs_tol=1e-9)
assert math.isclose(dot(FORWARD,RIGHT),0,abs_tol=1e-9)
assert math.isclose(.5-(-1),1.5)
assert math.isclose(ROOM_END-6,DOOR_THICKNESS)
assert DOOR_THICKNESS < 1/5
assert math.isclose((.316+.11)-(-.816-.11),1.352) # Pillars stay within the 1.4-depth envelope.
assert all(55<project(*p)[0]<2345 and 290<project(*p)[1]<1170 for _,ps,_ in faces for p in ps)
OUT.parent.mkdir(parents=True,exist_ok=True)
im.save(OUT)
print(OUT)
