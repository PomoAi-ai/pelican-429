from pathlib import Path
from math import sin, cos, radians, dist, ceil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
out = ROOT / 'public/concepts/natural-rock-wireframe.png'
im=Image.new('RGB',(2400,1820),'#f6f4ee'); d=ImageDraw.Draw(im)
INK='#283e48'; BLUE='#376e9b'; GRAY='#b7c1c7'; GREEN='#538e68'; ORANGE='#af7543'
font='/System/Library/Fonts/STHeiti Medium.ttc'
def text(x,y,s,size=27,color=INK):
    f=ImageFont.truetype(font,size)
    b=d.textbbox((x,y),s,font=f)
    assert b[2]<2380 and b[3]<im.height-10,(s,b)
    d.text((x,y),s,font=f,fill=color)
def line(a,b,color=INK,width=2,dash=False):
    if not dash:d.line([a,b],fill=color,width=width);return
    n=max(1,ceil(dist(a,b)/9))
    for i in range(0,n,2):d.line([tuple(a[j]+(b[j]-a[j])*k/n for j in (0,1)) for k in (i,min(i+1,n))],fill=color,width=width)
a,e=map(radians,(25,18)); R=(cos(a),0,sin(a)); U=(-sin(a)*sin(e),cos(e),cos(a)*sin(e)); F=(-sin(a)*cos(e),-sin(e),cos(a)*cos(e))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def camera(cx,cy,scale,target):
    def p(v):
        v=tuple(v[i]-target[i] for i in range(3));k=scale*24/(24+dot(v,F))
        return cx+k*dot(v,R),cy-k*dot(v,U)
    return p
def path(p,pts,color=INK,width=2,dash=False,close=False):
    pts=list(pts)
    if close:pts.append(pts[0])
    for a,b in zip(pts,pts[1:]):line(p(a),p(b),color,width,dash)
def box(p,x,y,z,w,h,depth,color=GRAY,dash=True):
    pts=[(x+dx*w,y+dy*h,z+dz*depth) for dx in (0,1) for dy in (0,1) for dz in (0,1)]
    for i in range(8):
        for bit in (1,2,4):
            if i<(i^bit):path(p,[pts[i],pts[i^bit]],color,2,dash)
def card(x,y,w,h,title):
    d.rounded_rectangle((x,y,x+w,y+h),16,fill='white',outline='#d4dddf',width=2);text(x+25,y+22,title,34,BLUE)
def dim(p,a,b,label,dx=0,dy=0):
    aa,bb=p(a),p(b);line(aa,bb,BLUE)
    for q in (aa,bb):line((q[0]-5,q[1]-6),(q[0]+5,q[1]+6),BLUE)
    text((aa[0]+bb[0])/2+dx,(aa[1]+bb[1])/2+dy,label,24,BLUE)

text(45,35,'岩石｜尺寸、占格与深度线框定义',48)
text(45,108,'沿用已有空间定义：中央深1，前后各预留0.5；前方为−Z。岩石新增规格尚未确认。',28,BLUE)
card(35,180,1145,810,'A  独立石块 · 标准平底款')
p=camera(565,470,280,(.5,-.15,0))
box(p,0,-1,-.5,1,1,1,GRAY,False)
box(p,0,0,-1,1,.65,.5,GREEN)
box(p,.1,0,-.3,.8,.5,.6,BLUE)
# Three irregular rings define a faceted stone with a flat supported footprint.
rings=[[(.2,0,-.22),(.68,0,-.25),(.81,0,.02),(.67,0,.22),(.27,0,.19)],[(.1,.22,-.16),(.69,.2,-.3),(.9,.24,.01),(.66,.25,.3),(.21,.3,.17)],[(.28,.43,-.1),(.6,.5,-.14),(.7,.44,.03),(.58,.4,.15),(.3,.45,.09)]]
for j,ring in enumerate(rings):path(p,ring,INK,3,j==0,True)
for j in range(2):
    for i in range(5):path(p,[rings[j][i],rings[j+1][i]],INK,3)
assert min(v[1] for ring in rings for v in ring)==0
assert all(.1<=x<=.9 and 0<=y<=.5 and -.3<=z<=.3 for ring in rings for x,y,z in ring)
dim(p,(.1,.65,-.3),(.9,.65,-.3),'宽0.8',-45,-42)
dim(p,(1.02,0,-.3),(1.02,.5,-.3),'高0.5',14,-10)
text(75,792,'本轮尺寸：0.8 × 0.5 × 0.6 格；Z=[−0.3,+0.3]。',28)
text(75,842,'底面接Y=0；蓝虚框为外观包络，灰框为宿主砖。',27)
text(75,890,'绿虚框是前延预留，里面没有额外地板。',27,GREEN)
text(75,937,'是否可采、是否阻挡：待定，不由外形推导。',26,ORANGE)

card(1210,180,1155,810,'B  多格岩体 · 复用地形轮廓')
p=camera(1750,480,160,(1.5,.65,0))
shapes=[[(0,0),(1,0),(1,1)],[(1,0),(2,0),(2,1),(1,1)],[(2,0),(3,0),(2,1)],[(1,1),(2,1),(2,1.5),(1,1.5)]]
for poly in shapes:
    for z in (-.5,.5):path(p,[(x,y,z) for x,y in poly],INK if z<0 else GRAY,3,z>0,True)
    for x,y in poly:path(p,[(x,y,-.5),(x,y,.5)],INK,2)
box(p,0,0,-.5,3,2,1,BLUE)
for x in (1,2):path(p,[(x,0,-.5),(x,2,-.5)],BLUE,1,True)
path(p,[(0,1,-.5),(3,1,-.5)],BLUE,1,True)
for i in range(3):box(p,i,-1,-.5,1,1,1,GRAY)
dim(p,(0,-.15,-.6),(3,-.15,-.6),'宽3',-28,28)
dim(p,(3.2,0,.5),(3.2,2,.5),'格域高2',18,-8)
text(1250,792,'示例：左右整格坡 + 中央整砖 + 上方下半砖。',27)
text(1250,842,'实际最高1.5；所在格域3×2；实体深始终为1。',27)
text(1250,890,'不把多格岩体包成一个实心大盒，不额外叠碰撞。',26)
text(1250,937,'若包含矿脉，按宿主格记录；采空后留下对应洞格。',26,ORANGE)

card(35,1020,2330,645,'C  深度核对 · A的等比例XZ俯视 + 两类岩石的处理边界')
ox,oy,u=190,1160,215
q=lambda x,z:(ox+x*u,oy+(z+1)*u)
for z0,z1,col in [(-1,-.5,GREEN),(-.5,.5,BLUE),(.5,1,ORANGE)]:
    a,b=q(0,z0),q(1,z1);d.rectangle((*a,*b),outline=col,width=3)
# Wall location is only the existing example, not a confirmed offset.
d.rectangle((*q(0,.5),*q(1,.7)),outline=ORANGE,width=3)
d.rectangle((*q(.1,-.3),*q(.9,.3)),outline=INK,width=3)
foot=[q(x,z) for x,_,z in rings[0]]
d.line(foot+[foot[0]],fill=INK,width=3)
text(575,1370,'黑矩形：外观包络；黑多边形：接触底面',24)
text(575,1410,'后侧间隙0.2；墙前面示例Z=+0.5',24)
line(q(-.12,0),q(1.15,0),BLUE,2,True)
for z,label in [(-1,'−1'),(-.5,'−0.5'),(0,'0'),(.5,'+0.5'),(1,'+1')]:text(450,q(0,z)[1]-14,label,23,BLUE)
text(85,1133,'镜头侧 / 前方−Z',23,GREEN)
text(575,1190,'前延0.5：只预留空间',26,GREEN)
text(575,1320,'中央深1；石块宽0.8、深0.6',26,BLUE)
text(575,1490,'后延0.5：墙示例Z=[+0.5,+0.7]',26,ORANGE)
text(575,1540,'墙厚0.2；固定偏移仍未定',25,ORANGE)
text(1080,1155,'已有定义',31,BLUE)
for i,s in enumerate(['地形半砖、斜坡只改XY轮廓，深度保持1。','花草的前伸方式不能直接套给承重石块。','露天石块与可采矿脉必须分别标明交互。']):text(1080,1210+i*48,s,27)
text(1080,1375,'本轮空间方案，尚未实现',31,ORANGE)
for i,s in enumerate(['标准石块接水平面；坡面不直接放平底款。','小石块是独立物件，移除时保留下方宿主。','完整底面须受支撑；草、预留框不提供承托。','本图不新增采集产物、再生时间或阻挡默认值。']):text(1080,1430+i*47,s,27)
text(45,1700,'依据：depth-definitions / tile-shape-definitions / natural-spatial-definitions / natural-ore-definitions',25,BLUE)
text(45,1750,'这是按坐标绘制的设计线框，不是已实现模型。未改变现有定义、游戏资源、碰撞或存档。',28)
im.save(out)
print(out)

# Placement examples use the same stone vertices so only the supporting surface changes.
def stone(p,dx=0,dy=0,color=INK):
    shifted=[[(x+dx,y+dy,z) for x,y,z in ring] for ring in rings]
    for j,ring in enumerate(shifted):path(p,ring,color,3,j==0,True)
    for j in range(2):
        for i in range(5):path(p,[shifted[j][i],shifted[j+1][i]],color,3)

def prism(p,poly,color=INK):
    for z in (-.5,.5):path(p,[(x,y,z) for x,y in poly],color,2,z>0,True)
    for x,y in poly:path(p,[(x,y,-.5),(x,y,.5)],color,2)

im=Image.new('RGB',(2400,2300),'#f6f4ee');d=ImageDraw.Draw(im)
text(45,35,'岩石｜六种格子关系与移除结果',48)
text(45,108,'本轮空间方案：标准平底石块依附水平承托面；多格岩体逐格定义。所有小石块保持相同尺寸。',27,BLUE)

for x,y,w,h,title in [
    (35,180,1145,650,'A  整砖承托 · 底面Y=0'),
    (1210,180,1155,650,'B  下半砖承托 · 底面Y=−0.5'),
    (35,855,1145,650,'C  斜坡反例 · 平底款不能直接摆放'),
    (1210,855,1155,650,'D  相邻两格 · 各自落脚，不跨缝悬空'),
    (35,1530,1145,650,'E  移除独立石块 · 宿主砖保留'),
    (1210,1530,1155,650,'F  移除岩体顶格 · 只改变该格实体'),
]:card(x,y,w,h,title)

for cx,top in [(570,0),(1765,-.5)]:
    p=camera(cx,465,225,(.5,-.2,0))
    box(p,0,-1,-.5,1,1,1,BLUE)
    box(p,0,-1,-.5,1,1+top,1,GRAY,False)
    stone(p,dy=top)
    path(p,[(0,top,-.5),(1,top,-.5)],GREEN,4)
    dim(p,(1.12,top,-.3),(1.12,top+.5,-.3),'石高0.5',15,-5)
text(75,690,'宿主格Y=[−1,0]；石块Y=[0,0.5]。',27)
text(75,743,'底面完整接触砖顶；宿主砖不算入石块高度。',26)
text(1250,690,'同一逻辑格，下半砖Y=[−1,−0.5]。',27)
text(1250,743,'石块整体下移0.5；Y=[−0.5,0]，不悬在旧顶面。',26)

p=camera(565,1090,190,(.5,-.2,0))
box(p,0,-1,-.5,1,1,1,BLUE)
prism(p,[(0,-1),(1,-1),(1,0)],GRAY)
stone(p,dy=-.19,color=ORANGE)
path(p,[(.2,-.8,-.22),(.2,-.19,-.22)],ORANGE,3,True)
text(75,1330,'坡顶Y=X−1；右底点接触时，左底仍悬空0.61。',26)
text(75,1380,'降低整个石块又会穿坡；不靠隐藏底部掩盖。',26)
text(75,1430,'本轮平底款不支持斜面；贴坡款需另定义底形。',26,ORANGE)

p=camera(1775,1090,190,(1,-.2,0))
for x in (0,1):
    box(p,x,-1,-.5,1,1,1,GRAY,False)
    box(p,x+.1,0,-.3,.8,.5,.6,BLUE)
    stone(p,dx=x)
dim(p,(.9,.7,-.3),(1.1,.7,-.3),'')
text(1250,975,'外观间隙0.2',25,BLUE)
text(1250,1330,'左石X=[0.1,0.9]；右石X=[1.1,1.9]。',26)
text(1250,1380,'每件绑定自己的宿主；只避让各自实际接触底面。',26)
text(1250,1430,'底面处不穿草；周边继续铺草，图中省略植物。',26,GREEN)

for cx,exists in [(345,True),(875,False)]:
    p=camera(cx,1830,170,(.5,-.2,0))
    box(p,0,-1,-.5,1,1,1,GRAY,False)
    if exists:stone(p)
    text(cx-38,1635,'存在' if exists else '移除',26,BLUE)
text(605,1820,'→',45,ORANGE)
text(75,2015,'移除石块仅去掉该物件；地形格仍然完整。',26)
text(75,2060,'这是空间结果对照，不指定采集工具、时长或产物。',25)
text(75,2105,'宿主被挖除后不能悬空；清理或坠落机制另定。',25,ORANGE)

for cx,cap in [(1505,True),(2060,False)]:
    p=camera(cx,1850,125,(1.5,.65,0))
    for poly in shapes[:4 if cap else 3]:prism(p,poly)
    box(p,1,1,-.5,1,1,1,BLUE)
    text(cx-95,1635,'四格有实体' if cap else '三格有实体',26,BLUE)
text(1785,1820,'→',45,ORANGE)
text(1250,2015,'移除(1,1)下半砖：顶高从1.5变1，其他三格不变。',25)
text(1250,2060,'蓝虚框为原顶格；其上半原本为空，不是新挖掉的。',25)
text(1250,2105,'剩余岩体保持原坐标，不居中、不缩小整组。',25,ORANGE)

text(45,2220,'实线：形体/格界；虚线：参考格域/后侧边。各卡按标注读数，不跨卡量像素。仅为资料，未接入游戏。',27,BLUE)

def area(poly):
    return abs(sum(x*v-u*y for (x,y),(u,v) in zip(poly,poly[1:]+poly[:1])))/2
assert sum(area(poly) for poly in shapes)==2.5
assert sum(area(poly) for poly in shapes[:3])==2
assert all(y==0 for _,y,_ in rings[0])
assert all(-.5<=y-.5<=0 for ring in rings for _,y,_ in ring)
assert abs((-.19)-(.2-1)-.61)<1e-9
out=ROOT/'public/concepts/natural-rock-placement-wireframe.png'
im.save(out)
print(out)
print('Geometry checks passed: flat support, half-tile placement, slope gap, terrain volume 2.5 -> 2.')
