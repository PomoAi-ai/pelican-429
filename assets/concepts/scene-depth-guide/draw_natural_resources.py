"""Design-only plant and ore diagrams; dimensions are proposals, not runtime assets."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/concepts'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
INK, BLUE, GREEN, GRAY = '#263F4C', '#376D9E', '#53896A', '#B7C6CB'
ITEMS = [
    ('grass', '01 地被 / 草丛', 1, .5, .4, -.4, '割短与连根清除分开；再长条件为草案。'),
    ('flower', '02 花卉 / 草本', 1, 1, .4, -.4, '萌芽 → 长叶 → 开花；花期、产物待定。'),
    ('shrub', '03 灌木 / 野果丛', 2, 1.5, .8, -.3, '采果保留植株；挂果不等于植株重新长大。'),
    ('bonsai', '04 盆景 / 盆栽', 1, 2, 1, 0, '容器 + 活植物；深1沿用家具，生长为草案。'),
    ('tree', '05 树木', 3, 5, 1.4, -.3, '自然再生是已有设计方向；时间与方式未定。'),
    ('ore', '06 矿脉', 3, 2, 1, 0, '5个矿格位于3×2包围内；有限储量，不再生。'),
]
EDGES = ((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))
FACES = ((0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2))
a, e = map(math.radians, (25, 18))
R = (math.cos(a), 0, math.sin(a))
U = (-math.sin(a)*math.sin(e), math.cos(e), math.cos(a)*math.sin(e))
F = (-math.sin(a)*math.cos(e), -math.sin(e), math.cos(a)*math.cos(e))
def dot(v, b): return sum(x*y for x,y in zip(v,b))
def cube(x,y,z,w,h,dep):
    return [(x+dx*w,y+dy*h,z+dz*dep) for dx,dy,dz in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]

def model(kind,w,h,dep,zc):
    faces=[]
    def box(x,y,z,bw,bh,bd,color):
        vertices=cube(x,y,z,bw,bh,bd)
        faces.extend(([vertices[i] for i in ids],color) for ids in FACES)
    def ellipsoid(x,y,z,rx,ry,rz,color):
        def point(i,j):
            lat=-math.pi/2+i*math.pi/6; lon=j*math.pi/4
            return (x+rx*math.cos(lat)*math.cos(lon),y+ry*math.sin(lat),z+rz*math.cos(lat)*math.sin(lon))
        for i in range(6):
            for j in range(8):faces.append(([point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)],color))
    if kind=='grass':
        for i in range(9):
            x=.12+i*.095; z=zc+((i%3)-1)*.12; high=.28+(i%3)*.11
            faces.append(([(x-.035,0,z),(x+.035,0,z),(x+(.10 if i%2 else -.10),high,z+.025)],'#70A365'))
    elif kind=='flower':
        for x,high,z in ((.23,.65,zc-.09),(.55,.84,zc+.03),(.78,.72,zc-.01)):
            box(x-.012,0,z-.012,.024,high,.024,GREEN)
            ellipsoid(x-.07,high*.4,z,.10,.045,.07,GREEN)
            for j in range(5):
                ang=j*2*math.pi/5
                ellipsoid(x+.08*math.cos(ang),high+.08*math.sin(ang),z,.06,.06,.04,'#D99B83')
            ellipsoid(x,high,z-.025,.04,.04,.025,'#D9B853')
    elif kind=='shrub':
        for x in (.6,1,1.4):box(x-.025,0,zc-.025,.05,.85,.05,'#96744F')
        ellipsoid(1,.94,zc,1,.56,.4,'#779968')
        for x,y in ((.4,1.02),(.8,1.35),(1.35,.85),(1.55,1.18)):
            ellipsoid(x,y,zc-.32,.05,.05,.05,'#B76365')
    elif kind=='bonsai':
        box(.15,0,-.35,.7,.45,.7,'#B38E72')
        for z in (-.38,.32):box(.12,.4,z,.76,.1,.06,'#C7A084')
        for x in (.12,.82):box(x,.4,-.32,.06,.1,.64,'#C7A084')
        box(.18,.45,-.32,.64,.015,.64,'#685747')
        box(.46,.46,-.05,.08,1.25,.1,'#8E7554')
        ellipsoid(.33,1.1,0,.31,.27,.35,GREEN)
        ellipsoid(.67,1.45,0,.30,.25,.35,'#6E986A')
        ellipsoid(.45,1.78,0,.28,.22,.30,'#87A86F')
    elif kind=='tree':
        box(1.3,0,zc-.2,.4,3.3,.4,'#947352')
        ellipsoid(1.5,3.6,zc,1.5,1.4,.7,'#72936B')
    else:
        for x,y in ((0,0),(1,0),(2,0),(0,1),(1,1)):
            box(x,y,-.5,1,1,1,'#9A9D9A')
            for j in range(3):
                px=x+.2+j*.26; py=y+.23+((j+x)%3)*.2
                faces.append(([(px-.09,py,-.501),(px,py+.13,-.501),(px+.1,py+.01,-.501),(px,py-.07,-.501)],'#64AEB0'))
    # Catch wrong envelope coordinates without asserting illustration style.
    for vertices,_ in faces:
        for x,y,z in vertices:
            assert -.002<=x<=w+.002 and -.002<=y<=h+.002 and zc-dep/2-.002<=z<=zc+dep/2+.002,(kind,x,y,z)
    return faces

for b in (R,U,F): assert math.isclose(dot(b,b),1)
assert abs(dot(R,U))<1e-10 and abs(dot(R,F))<1e-10 and abs(dot(U,F))<1e-10
im=Image.new('RGB',(2400,2700),'#F5F3EC'); draw=ImageDraw.Draw(im)
def text(x,y,value,size=27,color=INK):
    font=ImageFont.truetype(FONT,size)
    bounds=draw.textbbox((x,y),value,font=font)
    assert bounds[2]<im.width-15 and bounds[3]<im.height-8,(value,bounds)
    draw.text((x,y),value,font=font,fill=color)
def line(a,b,color=GRAY,width=2): draw.line((a,b),fill=color,width=width)
def dashed(a,b):
    n=max(1,math.ceil(math.dist(a,b)/10))
    for i in range(0,n,2):
        line(tuple(a[j]+(b[j]-a[j])*i/n for j in (0,1)),tuple(a[j]+(b[j]-a[j])*min(i+1,n)/n for j in (0,1)),GRAY,1)
text(45,30,'植物、生长物与矿脉｜透视定义图谱',48)
text(45,100,'设计资料 · 新尺寸为草案 · 各卡按标尺放大 · 包围盒不是碰撞体 · 未修改游戏模型',29,BLUE)
text(45,150,'单位统一为格，小物按卡片放大；每卡左右共用镜头与比例。矿脉不属于可再生植物。',27)
for index,(kind,title,w,h,dep,zc,note) in enumerate(ITEMS):
    cx=30+(index%2)*1190; cy=215+(index//2)*790
    draw.rounded_rectangle((cx,cy,cx+1150,cy+765),18,fill='white',outline='#D6E0E2',width=2)
    text(cx+25,cy+22,title,36,BLUE)
    text(cx+25,cy+78,f'成熟外观包络 {w:g} × {h:g} × {dep:g} 格' if kind!='ore' else '矿脉包围 3 × 2 × 1；单格 1 × 1 × 1',27)
    text(cx+150,cy+135,'实体透视',24);text(cx+740,cy+135,'同镜头线框',24)
    faces=model(kind,w,h,dep,zc)
    scale=min(260/w,350/h)
    for wire,ox in ((False,cx+285),(True,cx+845)):
        def project(v):
            v=(v[0]-w/2,v[1]-h/2,v[2]-zc)
            factor=scale*20/(20+dot(v,F))
            return (ox+factor*dot(v,R),cy+390-factor*dot(v,U))
        if kind!='ore':
            floor=cube(0,-.14,-.5,w,.14,1)
            for ids in FACES:
                xy=[project(floor[j]) for j in ids]
                if not wire:draw.polygon(xy,fill='#E5DED0')
                draw.line(xy+[xy[0]],fill='#C6BCA9',width=1)
            for x in range(math.ceil(w)+1):line(project((x,0,-.5)),project((x,0,.5)),'#9CAFA6',1)
        for vertices,color in sorted(faces,key=lambda face:sum(dot(v,F) for v in face[0])/len(face[0]),reverse=True):
            xy=[project(v) for v in vertices]
            if not wire:draw.polygon(xy,fill=color)
            draw.line(xy+[xy[0]],fill=BLUE if wire else '#526D62',width=1)
        bounds=cube(0,0,zc-dep/2,w,h,dep)
        for j,k in EDGES:dashed(project(bounds[j]),project(bounds[k]))
        for y in range(math.floor(h)+1):
            p=project((-.17,y,zc-dep/2));line(p,(p[0]+7,p[1]),'#B27442',2)
        text(ox-55,cy+613,'1格标尺',20,BLUE)
        line((ox-scale/2,cy+648),(ox+scale/2,cy+648),BLUE,3)
        line((ox-scale/2,cy+642),(ox-scale/2,cy+654),BLUE,2);line((ox+scale/2,cy+642),(ox+scale/2,cy+654),BLUE,2)
    text(cx+25,cy+680,f'Z=[{zc-dep/2:+g}, {zc+dep/2:+g}]  ·  '+note,23)
    text(cx+25,cy+723,'浅色底板只表示承托面；枝叶可伸入预留区。' if kind!='ore' else '岩层中的含矿格；线框中的空位不生成矿格或碰撞。',23,GREEN)
text(45,2610,'花草、灌木与树根均落在中央实体顶面；盆底必须有支撑。树冠平台、树干碰撞与外观分别定义。',27)
text(45,2653,'盆景深1沿用家具定义；自然植被深度为本轮草案。矿色为通用示意，不表示阶段1已经支持金属矿。',25,BLUE)
im.save(OUT/'natural-resources-perspective.png')

im=Image.new('RGB',(2400,1430),'#F5F3EC');draw=ImageDraw.Draw(im)
text(45,30,'植物与矿脉｜统一深度、支撑与生长状态',46)
text(45,105,'YZ剖面：中央实体深1，两侧各额外0.5；墙厚0.2占外延区。叶冠可伸出，根不能悬空。',29,BLUE)
# Same unit in Y and Z; height is cropped to emphasize support and root placement.
s=390; ox=510; oy=775
p=lambda z,y:(ox+z*s,oy-y*s)
for lo,hi,color in ((-1,-.5,'#E5EFE3'),(-.5,.5,'#E5EBF0'),(.5,1,'#F2E3CE')):
    draw.rectangle((*p(lo,1.35),*p(hi,-.3)),fill=color)
for i in range(-10,11):line(p(i/10,-.3),p(i/10,1.35),'#D1D9D8',1)
for i in range(-3,14):line(p(-1,i/10),p(1,i/10),'#D1D9D8',1)
draw.rectangle((*p(-.5,0),*p(.5,-.25)),fill='#BAA184',outline=INK,width=3)
draw.rectangle((*p(.5,1.35),*p(.7,0)),fill='#B6C4CD',outline=BLUE,width=3)
# Tree stem section is cropped; crown interval shown independently above it.
draw.rectangle((*p(-.5,1.1),*p(-.1,0)),fill='#AD8E62',outline=INK,width=3)
line(p(-1,1.15),p(.4,1.15),GREEN,5)
text(140,180,'树冠纵深范围 [−1,+0.4]（树高在图谱中完整展示）',24,GREEN)
text(385,440,'树干截面',24);text(730,295,'墙',26,BLUE)
for z,label in ((-1,'−1'),(-.5,'−0.5'),(0,'0'),(.5,'+0.5'),(1,'+1')):text(p(z,0)[0]-20,910,label,23,BLUE)
text(140,962,'内沿0.5',26,GREEN);text(410,962,'中央1格',26,BLUE);text(765,962,'外延0.5',26,'#A57447')
text(120,1020,'地板顶面Y=0；根中心Z=−0.3。',26)
text(120,1065,'树干底径0.4为样例，墙Z=[+0.5,+0.7]仅示例。',24)
text(120,1110,'两侧预留区没有额外地板，不能当作承托面。',24)
text(1120,225,'生长状态（设计草案）',34,BLUE)
for y,label,note in (
    (300,'草花：萌芽 → 成熟 → 割短/采花','再长与再开花条件未定；连根移除另外定义。'),
    (440,'灌木：幼丛 → 成熟；挂果另算','采果保留植株；阶段1尚不启用食物系统。'),
    (580,'盆景：容器 + 幼株/成形/修剪后','盆底贴承托面，根在盆土；不默认增加养护系统。'),
    (720,'树木：幼苗 → 幼树 → 成树 → 砍伐','自然再生是设计目标；方式、时长与条件未定。'),
    (860,'矿脉：未采 → 部分开采 → 耗尽','有限资源，不进入植物再生循环；逐格保存储量。')):
    text(1120,y,label,29,GREEN if y<860 else '#A57447');text(1120,y+55,note,25)
text(1120,1055,'图示尺寸 ≠ 实心碰撞 ≠ 采集范围',32,BLUE)
text(1120,1120,'成熟包络提前留空；受建筑阻挡时暂停生长为草案。',25)
text(65,1240,'实现边界：当前割草长回是渲染效果，不能当作已有持久化生长；矿脉与盆内生长均未接入游戏。',28)
text(65,1300,'资料沿用新深度规则；旧植物/远景图中的游戏实现Z值不用于覆盖本图。所有新增数值仍待确认。',27)
text(65,1360,'完整说明见 natural-resource-definitions.md；本图只做空间、生命周期和采集语义的对照。',26,BLUE)
im.save(OUT/'natural-resources-depth.png')
print('Saved two natural-resource diagrams; geometry envelopes and camera basis checked.')
