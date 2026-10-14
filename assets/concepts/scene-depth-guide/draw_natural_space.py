"""Tile attachment and resource placement construction drawings, in world units."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont
from draw_natural_states import cube, FACES, EDGES, R, U, F, dot, make_model
from natural_depth_raster import render_faces

ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'public/concepts'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#263F48'; BLUE='#376E9B'; GREEN='#538E68'; ORANGE='#AE7342'; GRAY='#BCC8CB'

def box(x,y,z,w,h,d,color):
    pts=cube(x,y,z,w,h,d)
    return [([pts[i] for i in ids],color) for ids in FACES]

def patch(x,y,z,w,h,d,color,front=False):
    contour=((.02,.2),(.2,.05),(.42,0),(.65,.08),(.91,.1),(1,.4),(.9,.65),(.7,.94),(.38,1),(.08,.8),(0,.5))
    a=[(x+u*w,y+v*h,z) if front else (x+u*w,y,z+v*d) for u,v in contour]
    b=[(xx,yy,zz+d) if front else (xx,yy+h,zz) for xx,yy,zz in a]
    return [(a,color),(b,color)]+[([a[i],a[(i+1)%len(a)],b[(i+1)%len(a)],b[i]],color) for i in range(len(a))]

def flora(kind,x):
    faces=[]
    count=8 if kind=='grass' else 3
    for i in range(count):
        xx=x+.12+i*(.76/(count-1));h=(.32+(i%3)*.08) if kind=='grass' else (.68+(i%2)*.17)
        z=-1.18-(i%2)*.09
        if kind=='grass':
            faces.append(([(xx-.035,0,-1),(xx+.035,0,-1),(xx+.06,h,z)],'#77A165'))
        else:
            faces.append(([(xx-.015,0,-1),(xx+.015,0,-1),(xx+.015,h,z),(xx-.015,h,z)],'#658B55'))
            faces.append(([(xx,h*.45,z),(xx-.14,h*.55,z-.05),(xx-.06,h*.35,z-.08)],'#79965E'))
            for j in range(5):
                a=j*math.tau/5;px=xx+.085*math.cos(a);py=h+.085*math.sin(a)
                faces.extend(box(px-.045,py-.045,z-.035,.09,.09,.05,'#D69B8B'))
            faces.extend(box(xx-.03,h-.03,z-.065,.06,.06,.035,'#DAC069'))
    return faces

def grass_tile(x,height=.5,root_gap=False):
    faces=[]
    for verts,col in make_model('grass',{'id':'mature','w':1,'h':height,'d':2.4}):
        vertices=[(xx+x+.5,yy,zz-.2) for xx,yy,zz in verts]
        if root_gap and col=='#769757':continue
        # Root opening X=[.15,.85], Z=[−0.95,−0.35]: only its front strip lies on the host top.
        if root_gap and min(v[0] for v in vertices)<x+.85 and max(v[0] for v in vertices)>x+.15 and max(v[2] for v in vertices)>.35:continue
        faces.append((vertices,col))
    if root_gap:
        for xx,zz,w,d in ((x,-1,.15,2),(x+.85,-1,.15,2),(x+.15,-1,.7,1.35),(x+.15,.95,.7,.05)):
            faces.append(([(xx,.012,zz),(xx+w,.012,zz),(xx+w,.012,zz+d),(xx,.012,zz+d)],'#769757'))
    return faces

class Sheet:
    def __init__(self,title,subtitle,height=2200):
        self.im=Image.new('RGB',(2400,height),'#F5F3EC');self.d=ImageDraw.Draw(self.im)
        self.text(45,32,title,46);self.text(45,103,subtitle,27,BLUE)
    def text(self,x,y,s,n=26,c=INK):
        f=ImageFont.truetype(FONT,n);b=self.d.textbbox((x,y),s,font=f)
        assert b[2]<2390 and b[3]<self.im.height-8,(s,b)
        self.d.text((x,y),s,font=f,fill=c)
    def line(self,a,b,c=GRAY,width=2):self.d.line((a,b),fill=c,width=width)
    def dash(self,a,b,c=GRAY):
        n=max(1,math.ceil(math.dist(a,b)/12))
        for i in range(0,n,2):self.line(tuple(a[j]+(b[j]-a[j])*i/n for j in (0,1)),tuple(a[j]+(b[j]-a[j])*min(i+1,n)/n for j in (0,1)),c,1)
    def card(self,x,y,w,h,title):
        self.d.rounded_rectangle((x,y,x+w,y+h),18,fill='white',outline='#D0DDDE',width=2);self.text(x+25,y+20,title,33,BLUE)
    def camera(self,x,y,scale,center):
        def p(v):
            v=tuple(v[i]-center[i] for i in range(3));factor=scale*24/(24+dot(v,F))
            return x+factor*dot(v,R),y-factor*dot(v,U)
        p.depth=lambda v:24+dot(tuple(v[i]-center[i] for i in range(3)),F)
        return p
    def scene(self,faces,p):render_faces(self.im,faces,p)
    def mesh(self,faces,p):
        for verts,color in sorted(faces,key=lambda f:sum(dot(v,F) for v in f[0])/len(f[0]),reverse=True):
            xy=[p(v) for v in verts];self.d.polygon(xy,fill=color);self.d.line(xy+[xy[0]],fill='#74837D',width=1)
    def wire(self,coords,p,c=GRAY):
        points=cube(*coords)
        for a,b in EDGES:self.dash(p(points[a]),p(points[b]),c)
    def dim(self,a,b,label,p,dx=0,dy=0):
        aa,bb=p(a),p(b);self.line(aa,bb,BLUE,2)
        for q in (aa,bb):self.line((q[0]-5,q[1]-5),(q[0]+5,q[1]+5),BLUE,2)
        self.text((aa[0]+bb[0])/2+dx,(aa[1]+bb[1])/2+dy,label,23,BLUE)
    def save(self,name):self.im.save(OUT/name)

s=Sheet('01 单格附着物｜青苔的四种形态','宿主格 X=[0,1]、Y=[−1,0]、Z=[−1,+1]；镜头从 Z 正侧看。绿色附着层不替代格体。')
for idx,kind in enumerate(('top','front','wrap','hang')):
    x=35+(idx%2)*1190;y=190+(idx//2)*930
    titles=('顶面片状青苔','前立面斑块青苔','前上沿包边青苔','前上沿垂挂青苔')
    s.card(x,y,1150,890,titles[idx]);faces=box(0,-1,-1,1,1,2,'#B7A48B')
    if kind in ('top','wrap'):
        for xx,ww,zz,dd in ((.08,.35,-.98,1.4),(.35,.35,-.98,1.88),(.65,.27,-.98,1.2)):
            faces+=patch(xx,0,zz,ww,.03,dd,'#7E9C61')
    if kind in ('front','wrap'):
        for xx,ww,yy,hh in ((.08,.3,-.65,.53),(.3,.4,-.85,.7),(.64,.28,-.62,.5)):
            if kind=='wrap':hh=-yy+.03
            faces+=patch(xx,yy,-1.03,ww,hh,.03,'#73965D',front=True)
        if kind=='wrap':faces+=box(.08,0,-1.03,.84,.03,.05,'#7E9C61')
    if kind=='hang':
        faces+=box(.1,0,-1.03,.8,.03,.05,'#779B60')
        for i in range(7):
            xx=.14+i*.10;low=-.25-(i%3)*.10
            faces.append(([(xx-.03,.02,-1),(xx+.045,.02,-1),(xx+.025,low,-1.15),(xx-.025,low+.06,-1.13)],'#7F9D60'))
    p=s.camera(x+350,y+390,230,(.5,-.4,0));s.mesh(faces[:6],p);s.mesh(faces[6:],p)
    s.wire((0,-1,-1.5,1,1,.5),p,GREEN)
    s.dim((0,-1.18,-1),(1,-1.18,-1),'宽1',p,dy=20)
    s.dim((1.16,-1,-1),(1.16,0,-1),'格高1',p,dx=8)
    # Equal-unit YZ section; moss thickness exaggerated nowhere.
    ox=x+700;oy=y+570;u=140
    q=lambda z,yy:(ox+(z+1.5)*u,oy-yy*u)
    s.text(x+755,y+160,'YZ 侧剖 · 等比例',24)
    s.d.rectangle((*q(-1,0),*q(1,-1)),fill='#D0BEA2',outline=INK,width=2)
    s.d.rectangle((*q(-1.5,0),*q(-1,-1)),outline=GREEN,width=2)
    if kind in ('top','wrap'):s.d.rectangle((*q(-1 if kind=='wrap' else -.98,.03),*q(.9,0)),fill=GREEN)
    if kind in ('front','wrap'):s.d.rectangle((*q(-1.03,.03 if kind=='wrap' else -.12),*q(-1,-.85)),fill=GREEN)
    if kind=='hang':s.d.polygon([q(-1,.03),q(-1.15,-.45),q(-1.08,-.4),q(-1,0)],fill=GREEN)
    s.text(x+690,y+610,'前沿0.5',22,GREEN);s.text(x+900,y+610,'格深2',22,BLUE)
    notes=[('高0.03；Z=[−0.9,+0.98]','顶面生长，不把整格涂成草格。'),('凸出0.03；Z=[+1,+1.03]','沿前立面贴附，Y=[−0.85,−0.12]。'),('顶片 + 前片连续包住前上棱','贴面厚0.03；接角不留悬空缝。'),('前伸0.15；最低垂到Y=−0.45','根挂Z=+1的前棱，叶须伸入前沿。')][idx]
    s.text(x+25,y+735,notes[0],27,GREEN);s.text(x+25,y+790,notes[1],25)
s.text(45,2100,'附着层依附宿主面：宿主挖除则附着物移除；坡砖按实际坡面贴附，半砖按实际顶面落点。',27)
s.text(45,2150,'厚度及形态为本轮制作方案；不新增可站立青苔层、不把前沿填成实体格。',26,BLUE)
s.save('natural-attachments-space.png')

s=Sheet('02 整格草地｜顶面全覆盖 + 前缘伸叶','每格顶面1×2都铺草；成熟叶高0.5，草叶总深2.4。根在真实格面上，前叶再伸入前沿0.4。',2100)
s.card(35,180,1500,980,'A 三格连续草地透视 · 前、中、后都有草')
faces=[]
for x in range(3):faces+=box(x,-1,-1,1,1,2,'#B9A98C')
p=s.camera(760,675,230,(1.5,-.2,-.1));s.mesh(faces,p)
for x in range(3):s.mesh(grass_tile(x),p)
s.wire((0,0,-1.4,3,.5,2.4),p,GREEN)
s.dim((0,-1.2,-1),(3,-1.2,-1),'3个宿主格连续铺草',p,dx=-150,dy=30)
s.dim((3.1,.65,-1.4),(3.1,.65,1),'总深2.4',p,dx=15,dy=-45)
s.text(75,280,'低草底覆盖整个顶面，草簇在X、Z两个方向分布。',27,GREEN)
s.text(75,1040,'相邻格不留裸土缝；格界线只用于量尺寸，不切出一条条草带。',26)
s.card(1560,180,805,980,'B 俯视 XZ · 一格完整覆盖')
ox=1850;oy=380;u=245;q=lambda xx,z:(ox+xx*u,oy+(z+1.4)*u)
s.d.rectangle((*q(0,-1.4),*q(1,1)),fill='#AAC393',outline=GREEN,width=3)
s.d.rectangle((*q(0,-1),*q(1,1)),fill='#789B59',outline=INK,width=3)
for i in range(8):
    for j in range(16):
        px,py=q(.055+i*.125,-.96+j*.125);s.line((px-4,py+5),(px+5,py-5),'#B7CD9A',2)
s.text(1660,330,'镜头侧 / Z正',25,BLUE)
s.text(1650,1015,'深2顶面全铺 + 前伸0.4',27,GREEN)
s.text(1650,1070,'前沿还余0.1；不增加土台。',23)
# Geometry keeps the camera at −Z internally; labels use the +Z-toward-camera convention.
for z,t in ((-1.4,'+1.4'),(-1,'+1'),(1,'−1')):s.text(2130,q(0,z)[1]-10,t,23,BLUE)
s.card(35,1190,1500,770,'C 侧向透视 · 深度与高度从格子直接读')
faces=box(0,-1,-1,1,1,2,'#B9A98C');p=s.camera(555,1545,210,(.5,-.1,0));s.mesh(faces,p);s.mesh(grass_tile(0),p)
s.wire((0,0,-1.4,1,.5,2.4),p,GREEN)
s.dim((1.4,0,-1.4),(1.4,.5,-1.4),'高0.5',p,dx=12)
s.dim((0,-1.1,-1.4),(0,-1.1,-1),'前伸0.4',p,dx=-140,dy=10)
s.text(970,1370,'后排：到格子背面 −1',25)
s.text(970,1430,'中排：覆盖格顶面',25)
s.text(970,1490,'前排：根在前棱 +1',25)
s.text(970,1550,'叶尖：最前到 +1.4',25,GREEN)
s.text(80,1880,'薄草底厚0.012；高叶之间留空，整格覆盖不等于半格高的绿色实心块。',25)
s.card(1560,1190,805,770,'D 花长在草地里 · 草仍铺满')
faces=box(0,-.5,-1,1,.5,2,'#B9A98C');p=s.camera(1950,1580,200,(.5,.3,0));s.mesh(faces,p);s.mesh(grass_tile(0)+flora('flower',0),p)
s.text(1600,1850,'花沿前缘长，花后与两侧继续铺草。',24)
s.text(45,2015,'生长和割短改变草高与密度；整格覆盖范围保持。树根处只避让实际根口，见树木组合图。',27,BLUE)
s.save('natural-flora-space.png')

# Internal z = −Z (camera at −Z). Tree sample: bush-kind 矮冠树, T=3, C=2, trunk column 2.
TZ=.65;TREE={'id':'mature','w':3.6,'h':5.15,'d':.7};PURPLE='#8A5BB8'
def tree_at(cx,state=TREE):
    return [([(xx+cx,yy,zz+TZ) for xx,yy,zz in vs],c) for vs,c in make_model('tree',state)]
s=Sheet('03 树木｜后置落根、冠团平台与成熟净空（矮冠树样例）','整株在人物身体区之后 Z=[−1,−0.3]；根落在深2宿主格内；冠顶平台写在 Z=0 的人物平面。单位：格。',2250)
s.card(35,180,1370,1920,'A 实体透视 + 逐格高度标尺')
faces=[]
for x in range(5):faces+=box(x,-1,-1,1,1,2,'#B6A183' if x!=2 else '#C8A570')
# Hosts first: the painter sort cannot order thin turf strips against the large host tops.
p=s.camera(690,1010,200,(2.5,2.4,.3));s.mesh(faces,p);faces=[]
for x in range(5):faces+=grass_tile(x,root_gap=x==2)
faces+=tree_at(2.5)
s.mesh(faces,p)
s.wire((.7,0,.3,3.6,5.15,.7),p,GREEN)
for yy in range(6):
    s.dash(p((0,yy,1)),p((5,yy,1)),BLUE)
    px,py=p((5.15,yy,1));s.text(px+10,py-14,str(yy),25,BLUE)
for xx in range(6):s.dash(p((xx,0,1)),p((xx,5,1)),BLUE)
s.line(p((1,5,0)),p((4,5,0)),PURPLE,6)
px,py=p((1,5,0));s.text(px-20,py-62,'冠顶平台 3列 · 顶面Y=5 · Z=0',25,PURPLE)
s.dim((.5,0,-.6),(.5,5.15,-.6),'株高5.15',p,dx=-150)
s.dim((.7,5.5,.3),(4.3,5.5,.3),'冠宽3.6',p,dy=-40)
s.text(75,1880,'中间格承托树根：宿主格深2，树干整段落在土上，不需要根土台。',26)
s.text(75,1940,'干高3 / 冠Y=[2.27,5.15]，二者相交；叶团顶比平台高0.15，脚陷在叶里。',26,GREEN)
s.text(75,2000,'紫线是平台碰撞（XY），位于人物平面Z=0；绿色叶团只是它在后方的外观。',26,PURPLE)
s.card(1440,180,925,880,'B XY 正视：平台、叶团与站立')
u=72;ox=1720;oy=905
for xx in range(6):s.line((ox+xx*u,oy),(ox+xx*u,oy-8*u),GRAY,1)
for yy in range(9):s.line((ox,oy-yy*u),(ox+5*u,oy-yy*u),GRAY,1)
s.d.ellipse((ox+.7*u,oy-5.15*u,ox+4.3*u,oy-2.27*u),fill='#ABC19C',outline=GREEN,width=3)
s.d.rectangle((ox+2.25*u,oy-3*u,ox+2.75*u,oy),fill='#997450')
for xx in (1,2,3):s.d.rectangle((ox+xx*u,oy-5*u,ox+(xx+1)*u,oy-4*u),outline=PURPLE,width=3)
s.line((ox+u,oy-5*u),(ox+4*u,oy-5*u),PURPLE,5)
s.d.rounded_rectangle((ox+2.1*u,oy-7.8*u,ox+2.9*u,oy-5*u),12,outline=INK,width=3)
s.d.rectangle((ox,oy,ox+5*u,oy+u*.4),fill='#C9AC79',outline=INK,width=2)
for yy in (0,5,8):s.text(ox-55,oy-yy*u-15,str(yy),22,BLUE)
s.text(ox+5.15*u,oy-5.3*u,'平台行4',22,PURPLE)
s.text(ox+5.15*u,oy-7.9*u,'碰撞0.8×2.8',22)
s.text(1480,990,'平台行偏移4 ≥ 净空3；平台上方保留3格空气。',24)
s.card(1440,1095,925,1005,'C XZ 俯视：总深3空间带内的位置')
u=125;ox=1500;oy=1240;q=lambda x,z:(ox+x*u,oy+(z+1.5)*u)
s.d.rectangle((*q(0,-1.5),*q(5,-1)),fill='#ECE8DF')
s.d.rectangle((*q(0,-1.2),*q(5,-1)),fill='#D9C9B0',outline=ORANGE,width=2)
s.d.rectangle((*q(0,-1),*q(5,1)),fill='#E2D6C3')
s.d.rectangle((*q(0,1),*q(5,1.5)),fill='#E6EEF2')
s.d.rectangle((*q(0,-.3),*q(5,.3)),outline=BLUE,width=3)
s.d.ellipse((*q(.7,-1),*q(4.3,-.3)),fill='#ABC09C',outline=GREEN,width=3)
s.d.rectangle((*q(2.25,-.9),*q(2.75,-.4)),fill='#9A7652',outline=INK,width=3)
s.line(q(1,0),q(4,0),PURPLE,5)
for xx in range(6):s.dash(q(xx,-1.5),q(xx,1.5),BLUE)
for z,label in ((-1.5,'−1.5'),(-1.2,'−1.2'),(-1,'−1'),(-.3,'−0.3'),(.3,'+0.3'),(1,'+1'),(1.5,'+1.5')):
    s.text(q(5,z)[0]+12,q(5,z)[1]-14,label,20,BLUE)
s.text(1480,1640,'后沿：背景墙 [−1.2,−1]（橙框），树后可连续铺墙',23)
s.text(1480,1690,'蓝框：人物身体区 [−0.3,+0.3]，树体不进入',23,BLUE)
s.text(1480,1740,'格子 [−1,+1]：宿主土与冠团；前沿 [+1,+1.5] 留空；下方朝镜头',23)
s.text(1480,1810,'根中心 (2.5,0,−0.65)；干 Z=[−0.9,−0.4]',25)
s.text(1480,1870,'冠 X=[0.7,4.3] / Z=[−1,−0.3]',25,GREEN)
s.text(1480,1930,'冠团在格内，与后沿背景墙零交集',25,ORANGE)
s.text(1480,1990,'紫线：平台在 Z=0，只按 XY 碰撞',24,PURPLE)
s.text(45,2160,'各生长阶段沿用同一宿主格与根锚点；幼苗就预留成熟净空。平台只在成熟时写入，砍伐时移除。',27,BLUE)
s.save('natural-tree-space.png')

s=Sheet('04 矿脉｜嵌在岩层中的矿格，不是独立漂浮方块','岩层剖块 5×4×2，共20格；五个宿主石格含矿。矿种只改这些石格的材质/储量，不叠加另一套实体。',2250)
vein={(1,1),(2,1),(3,1),(1,2),(2,2)}
for idx,state in enumerate(('intact','partial','depleted')):
    x=35+(idx%2)*1190;y=185+(idx//2)*970;s.card(x,y,1150,930,('A 开采前：20石格 / 5含矿格','B 部分开采：18石格 / 3含矿格','C 耗尽：15围岩格 / 0含矿格')[idx])
    deleted=set() if state=='intact' else ({(3,1),(2,2)} if state=='partial' else vein)
    faces=[];remaining=[]
    for xx in range(5):
        for yy in range(4):
            if (xx,yy) in deleted:continue
            remaining.append((xx,yy));faces+=box(xx,yy,-1,1,1,2,'#A6A79F')
            if (xx,yy) in vein:
                partial=state=='partial' and (xx,yy)==(2,1)
                for j in range(1 if partial else 3):
                    px=xx+.18+j*.27;py=yy+.22+j*.22
                    faces.append(([(px-.12,py,-1.005),(px+.06,py+.15,-1.005),(px+.18,py+.07,-1.005),(px,py-.08,-1.005)],'#629A9B'))
    # The exposed band branches across retained hosts; removed cells break it.
    for a,b in (((1,1),(1,2)),((1,2),(2,2)),((1,1),(2,1)),((2,1),(3,1))):
        if a not in vein-deleted or b not in vein-deleted:continue
        ax,ay=a[0]+.35,a[1]+.32;bx,by=b[0]+.58,b[1]+.64
        mx,my=(ax+bx)/2+.10,(ay+by)/2-.08
        faces.append(([(ax-.05,ay,-1.006),(mx-.06,my,-1.006),(bx-.04,by,-1.006),(bx+.04,by+.06,-1.006),(mx+.06,my+.04,-1.006),(ax+.05,ay+.03,-1.006)],'#629A9B'))
    assert len(remaining)==20-len(deleted)
    p=s.camera(x+520,y+450,115,(2.5,2,0));s.mesh([f for f in faces if f[1]!='#629A9B'],p);s.mesh([f for f in faces if f[1]=='#629A9B'],p)
    for xx,yy in deleted:s.wire((xx,yy,-1,1,1,2),p,'#BE9D75')
    if state=='partial':
        px,py=p((2.1,1.4,-1.02));s.text(px,py,'50%',21,'#8D522F')
    s.dim((0,-.22,-1),(5,-.22,-1),'岩层宽5',p,dy=25)
    s.dim((5.2,0,-1),(5.2,4,-1),'高4',p,dx=10)
    s.text(x+30,y+778,('矿区左下(1,1)，原包围3×2；右上角不是矿格。','挖掉(3,1)、(2,2)；(2,1)采到50%但仍是整格。','仅原五矿格成为洞；其他围岩保留，矿不自然再生。')[idx],24)
    s.text(x+30,y+839,'青色只标可见矿物；橙虚线是已挖空位置，不保留碰撞。',24,GREEN)
x=1225;y=1155;s.card(x,y,1140,930,'D 单格含矿石：外形与内含物')
faces=box(0,0,-1,1,1,2,'#ADADA5')
for xx,yy,w,h in ((.12,.18,.22,.15),(.4,.4,.3,.18),(.65,.66,.22,.15)):
    faces+=box(xx,yy,-1.02,w,h,.03,'#629A9B')
p=s.camera(x+330,y+420,240,(.5,.5,0));s.mesh(faces[:6],p);s.mesh(faces[6:],p)
s.dim((0,-.2,-1),(1,-.2,-1),'宽1',p,dy=20);s.dim((1.2,0,-1),(1.2,1,-1),'高1',p,dx=5)
s.text(x+665,y+210,'宿主石格',27,BLUE);s.text(x+665,y+260,'宽1×高1×深2',25)
s.text(x+665,y+340,'矿丝 / 矿物嵌体',26,GREEN)
s.text(x+665,y+390,'穿入岩体并露出表面',24)
s.text(x+665,y+440,'露头凸出≤0.03',24)
s.text(x+665,y+520,'仅暴露面显示露头',24)
s.text(x+665,y+570,'深处矿带剖切才可见',24)
s.text(x+665,y+620,'XZ剖切示意 · 深2',22,BLUE)
s.d.rectangle((x+665,y+660,x+955,y+752),fill='#ADADA5',outline=INK,width=2)
s.d.polygon([(x+690,y+752),(x+750,y+706),(x+790,y+660),(x+830,y+660),(x+786,y+714),(x+718,y+752)],fill='#629A9B')
s.line((x+795,y+705),(x+900,y+675),GREEN,5)
s.text(x+965,y+704,'前',21,BLUE)
s.text(x+30,y+778,'不是背景薄墙上的贴花资源，也不是前沿长出的植物。',24)
s.text(x+30,y+837,'示例矿带坐标和露头厚度为本轮方案；未规定产量数值。',24,GREEN)
s.text(45,2160,'岩层与泥土同为格子深2，Z=[−1,+1]；露头仅表面细节，XY碰撞不变。五矿格都采完仍有15格围岩，不能整块岩层消失。',26,BLUE)
s.save('natural-ore-space.png')
print('Four placement diagrams saved; tile counts and drawing bounds checked.')

s=Sheet('05 树木与整格草地｜宿主格、根口、相邻树和侧剖','同一株树始终落在同一宿主格；草铺满宿主顶面，只在根口避让；背景墙在后沿，树后可连续铺墙。单位：格。',2400)
s.card(35,180,1135,1100,'A 成熟组合透视 · 墙在后沿连续')
faces=[]
for x in range(-1,6):faces+=box(x,-1,-1,1,1,2,'#B9A98C')+box(x,0,1,1,6,.2,'#C8D3D8')
p=s.camera(600,800,92,(2.5,2.6,.3));s.mesh(faces,p);faces=[]
for x in range(-1,6):faces+=grass_tile(x,root_gap=x==2)
faces+=tree_at(2.5)
s.mesh(faces,p);s.wire((.7,0,.3,3.6,5.15,.7),p,GREEN)
s.line(p((1,5,0)),p((4,5,0)),PURPLE,5)
s.text(75,1150,'墙 Z=[−1.2,−1] 在后沿，与冠团零交集，树后连续铺墙。',25)
s.text(75,1210,'冠 Z=[−1,−0.3]；干 Z=[−0.9,−0.4]；紫线为平台（Z=0）。',25,GREEN)
s.card(1200,180,1165,1100,'B 根部放大 · 宿主草与根口')
p=s.camera(1510,760,210,(.5,.2,.25));s.mesh(box(0,-.5,-1,1,.5,2,'#B9A98C'),p)
s.mesh(grass_tile(0,root_gap=True)+box(.25,0,.4,.5,1,.5,'#9B7855'),p)
s.text(1240,320,'低处透视：树干下段截示',25)
s.text(1890,320,'XZ俯视：根口0.7×0.6',25,BLUE)
u=230;ox=1970;oy=410;q=lambda x,z:(ox+x*u,oy+(z+1)*u)
s.d.rectangle((*q(0,-1),*q(1,1)),fill='#88A86B',outline=INK,width=3)
s.d.rectangle((*q(.15,-.95),*q(.85,-.35)),fill='#B9A98C',outline=ORANGE,width=2)
s.d.rectangle((*q(.25,-.9),*q(.75,-.4)),fill='#9B7855',outline=INK,width=3)
for z,label in ((-1,'−1'),(0,'0'),(1,'+1')):s.text(q(1,z)[0]+10,q(1,z)[1]-13,label,21,BLUE)
s.text(1890,900,'棕色：干0.5×0.5，Z=[−0.9,−0.4]',24)
s.text(1890,950,'橙框：根口 Z=[−0.95,−0.35]',24,ORANGE)
s.text(1890,1000,'绿色：宿主顶面其余全铺草',24,GREEN)
s.text(1240,1150,'宿主格深2，树干整段落在土上；旧版根土台取消。',25)
s.text(1240,1210,'幼苗、成树、树桩沿用同一根口与根锚点。',25,GREEN)
s.card(35,1310,1135,920,'C 相邻树透视 · 树干列间距 ≥ 7')
faces=[]
for x in range(10):faces+=box(x,-.4,-1,1,.4,2,'#B9A98C')
p=s.camera(585,1800,70,(4.5,2.4,.3));s.mesh(faces,p);faces=[]
for x in range(10):faces+=grass_tile(x,root_gap=x in (1,8))
for cx in (1,8):faces+=tree_at(cx+.5)
s.mesh(faces,p)
for cx in (1,8):s.line(p((cx-1,5,0)),p((cx+2,5,0)),PURPLE,4)
s.dim((1.5,0,-1.4),(8.5,0,-1.4),'树干列间距7 = 游戏 treeMinGap',p,dx=-200,dy=30)
s.text(75,2120,'7 ≥ 2×最大平台伸展3+1：不同树的平台和冠团永不相连。',25)
s.text(75,2180,'树冠不能穿进建筑或地形格；成熟包络内的格必须是空气。',25,GREEN)
s.card(1200,1310,1165,920,'D YZ侧剖 · 站在冠顶时的前后关系')
u=78;ox=1420;oy=2130;q=lambda z,y:(ox-z*u,oy-y*u)
s.d.rectangle((*q(1.5,8.6),*q(1,-1)),fill='#EEF3F5')
s.d.rectangle((*q(-1,8.6),*q(-1.5,-1)),fill='#F0EDE6')
s.d.rectangle((*q(-1,8.6),*q(-1.2,-1)),fill='#D9C9B0',outline=ORANGE,width=2)
s.d.rectangle((*q(1,0),*q(-1,-1)),fill='#B9A98C',outline=INK,width=2)
s.d.rectangle((*q(-.4,3),*q(-.9,0)),fill='#9B7855',outline=INK,width=2)
s.d.ellipse((*q(-.3,5.15),*q(-1,2.27)),fill='#ACC79B',outline=GREEN,width=3)
s.d.rectangle((*q(.3,8.6),*q(-.3,0)),outline=BLUE,width=2)
s.d.rounded_rectangle((*q(.25,8.1),*q(-.25,5)),10,fill='#F3D7B8',outline=INK,width=2)
s.line(q(.45,5),q(-.45,5),PURPLE,5)
for z,label in ((1,'+1'),(0,'0'),(-1,'−1')):s.text(q(z,0)[0]-14,2210,label,20,BLUE)
s.text(1670,1440,'左 = 镜头一侧（+Z）',24,BLUE)
s.text(1670,1510,'玩家角色站在平台 Y=5，',25)
s.text(1670,1555,'身体在 Z=[−0.3,+0.3]；',25)
s.text(1670,1600,'叶团在其后 Z=[−1,−0.3]，',25,GREEN)
s.text(1670,1645,'顶比脚高0.15，脚陷入叶团。',25,GREEN)
s.text(1670,1730,'树体永远在角色之后，',25)
s.text(1670,1775,'不遮挡角色，也不淡化。',25)
s.text(1670,1860,'背景墙：后沿 [−1.2,−1]，',24,ORANGE)
s.text(1670,1905,'与叶团零交集，树后可铺墙。',24,ORANGE)
s.text(1670,1990,'紫线只表示碰撞高度；',23,PURPLE)
s.text(1670,2035,'平台碰撞只看 XY。',23,PURPLE)
s.text(45,2290,'坡面：草贴实际表面，树干仍竖直；根口需真实土壤承托。宿主挖空后不保留悬空树与草。',27,BLUE)
s.text(45,2340,'本图定义空间与遮挡；现行游戏树中心Z=−0.7、前沿−0.1、地形Z=[−1,+0.5]，与本图尚未同步。',26)
s.save('natural-tree-ground-space.png')
print('Tree and full-tile grass perspective sheet saved.')

# Front and back are rendered from the same host and attached surface geometry.
def surface_vine(side, stage='mature'):
    faces=[];full=stage=='mature';length={'sprout':.2,'growing':.6,'mature':1,'cut':.25}[stage]
    sign=-1 if side=='front' else 1;z=sign*1.015
    for branch,x in enumerate((.16,.39,.62,.84)):
        segments=10
        for j in range(segments):
            t=j/segments;end=(j+1)/segments
            if end>length+.001:continue
            ax=x+.035*math.sin(j*1.6+branch);bx=x+.035*math.sin((j+1)*1.6+branch)
            ay=-1+t;by=-1+end
            faces.append(([(ax-.009,ay,z),(ax+.009,ay,z),(bx+.009,by,z),(bx-.009,by,z)],'#557347'))
            for d in (-1,1):
                lx=bx+d*.06;ly=by+.018;zz=sign*1.055
                vertices=[(bx,by,z),(lx-d*.055,ly+.06,zz),(lx-d*.02,ly+.13,zz),(lx+d*.035,ly+.10,zz),(lx+d*.07,ly+.13,zz),(lx+d*.08,ly+.03,zz),(lx+d*.025,ly-.04,zz)]
                # Leaves remain inside their own host face and its 0.08 outward envelope.
                vertices=[(min(.99,max(.01,a)),min(.01,b),c) for a,b,c in vertices]
                faces.append((vertices,('#719557','#4D7E50','#86A55D')[(j+branch)%3]))
    return faces

def surface_moss(side):
    sign=-1 if side=='front' else 1
    return sum((patch(x,-.94,z,w,.94,.03,col,front=True) for x,w,z,col in ((.02,.37,-1.03 if sign<0 else 1,'#79955D'),(.30,.4,-1.03 if sign<0 else 1,'#8BA46A'),(.65,.33,-1.03 if sign<0 else 1,'#6F8D55'))),[])

def draw_surface(s,x,y,kind,back=False,stage='mature',scale=230):
    p=s.camera(x,y,scale,(.5,-.25,0))
    def show(faces):
        if back:faces=[([(1-a,b,-c) for a,b,c in vertices],color) for vertices,color in faces]
        s.mesh(faces,p)
    show(box(0,-1,-1,1,1,2,'#B8A488'))
    if kind=='moss':
        show(grass_tile(0,.25));show(surface_moss('back' if back else 'front'))
        # The rim connects the top turf to the front and back attached layer.
        show(box(0,-.035,-1.03,1,.05,.03,'#769757')+box(0,-.035,1,1,.05,.03,'#769757'))
    else:
        show(surface_vine('back' if back else 'front',stage))
        if stage=='mature':
            for xx in (.18,.42,.66,.84):
                show(box(xx-.009,.008,-1.015,.018,.018,2.03,'#557347'))
                for zz in (-.8,-.3,.2,.7):
                    show([([(xx-.07,.035,zz),(xx,.065,zz-.10),(xx+.09,.035,zz),(xx,.04,zz+.12)],'#739853')])
    return p

s=Sheet('06 贴面植物｜顶面、正面、背面都覆盖','同一宿主格，左列从Z正侧看正面，右列绕到Z负侧看背面；覆盖层沿外表面绕过棱边。',2400)
for idx,(kind,back) in enumerate((('moss',False),('moss',True),('vine',False),('vine',True))):
    x=35+(idx%2)*1190;y=185+(idx//2)*1035
    s.card(x,y,1150,995,('A 草顶 + 苔被：正面透视','B 同一草苔格：背面透视','C 藤蔓 / 爬山虎：正面透视','D 同一藤蔓格：背面透视')[idx])
    p=draw_surface(s,x+545,y+425,kind,back)
    s.dim((0,-1.16,-1),(1,-1.16,-1),'格宽1',p,dy=25)
    s.dim((1.12,-1,-1),(1.12,0,-1),'格高1',p,dx=15)
    s.text(x+35,y+800,('顶面整格草底；正面薄苔连续包边，向下覆盖砖面。','背面同样有薄苔；顶面草与后上棱相接，不留裸背。','藤茎贴面分枝，叶片层向外最多0.08；翻过顶部。','背面藤叶从同一顶边接续；不是把正面图贴到背面。')[idx],25)
    s.text(x+35,y+865,('正面 Z=[+1,+1.03]；顶草根仍在整个顶面。','背面 Z=[−1.03,−1]；背面朝Z负方向凸出。','正面叶层 Z=[+1,+1.08]；沿棱进入顶面。','背面叶层 Z=[−1.08,−1]；后沿有墙处需避让。')[idx],25,GREEN)
s.text(45,2280,'只覆盖实际外露面：相邻格内部接触面不长重复叶层；有后墙贴住的背面也不画穿墙藤叶。',27,BLUE)
s.text(45,2340,'图示是贴面植物的正背面方案；草叶、低苔和藤叶分别画出高度与厚度，格体本身深2。',26)
s.save('natural-surface-vines.png')

s=Sheet('07 藤蔓｜萌芽、攀附生长、绕顶成熟、修剪后','同一格、同一镜头、同一根部；藤茎从下方支点向上爬，成熟后越过顶边连接背面。',2250)
for idx,stage in enumerate(('sprout','growing','mature','cut')):
    x=35+(idx%2)*1190;y=185+(idx//2)*960
    s.card(x,y,1150,920,('A 萌芽：贴面短枝','B 生长：沿面分枝','C 成熟：正面 → 顶面 → 背面','D 修剪后：保留根与低枝')[idx])
    p=draw_surface(s,x+520,y+415,'vine',stage=stage)
    s.text(x+35,y+740,('支点位于底沿Y=−1；正面攀升0.2，叶尖约到Y=−0.67。','正面攀升0.6，叶尖约到Y=−0.27；持续贴住宿主面。','正面攀升1到顶边；顶面跨深2，连接段另计。','长枝与上部叶层去掉；低枝高0.2，原支点不移动。')[idx],25)
    s.text(x+35,y+810,'宿主格不缩放、不随叶量消失；整株拔除时仅移除藤与根。',25,GREEN)
s.text(45,2130,'下垂变体从上棱扎附、向下挂；换成跨两格高的墙时，藤沿连续外露面续接，不跨空格悬浮。',26,BLUE)
s.text(45,2190,'本页是形态与空间参考；藤是否可攀爬、长速及采集产物另属玩法，不由叶层包络推导。',26)
s.save('natural-vine-states.png')
for face in ('front','back'):
    for vs,c in surface_vine(face):
        for xx,yy,zz in vs:assert 0<=xx<=1 and -1<=yy<=.02 and 1<=abs(zz)<=1.08
print('Front/back surface plants and four vine states saved; leaf envelopes checked.')

s=Sheet('08 垂挂藤｜上沿扎附，正面与背面向下垂','宿主仍为深2、高1；最长藤从顶沿向下1.5，越过格底0.5。侧向散开最多0.15。',1300)
for idx,back in enumerate((False,True)):
    x=35+1190*idx;y=180;s.card(x,y,1150,990,('A 前上沿垂挂 · 镜头从Z正侧看','B 后上沿垂挂 · 镜头绕到Z负侧')[idx])
    p=s.camera(x+545,y+450,240,(.5,-.6,0))
    def show(faces):
        if back:faces=[([(1-a,b,-c) for a,b,c in vs],col) for vs,col in faces]
        s.mesh(faces,p)
    show(box(0,-1,-1,1,1,2,'#B8A488'))
    sign=1 if back else -1;faces=[]
    for vs,col in surface_vine('back' if back else 'front'):
        avg=sum(v[0] for v in vs)/len(vs);length=1.5 if avg<.28 else 1.1 if avg<.51 else .75 if avg<.74 else 1.3
        faces.append(([(a,-length*(min(0,b)+1),c+sign*.065*(min(0,b)+1)) for a,b,c in vs],col))
    show(faces)
    show(box(.08,0,.99 if back else -1.03,.84,.03,.04,'#6C8C50'))
    s.dim((1.22,0,-1.05),(1.22,-1.5,-1.05),'最长1.5',p,dx=15)
    s.text(x+35,y+810,'上棱有连续支点，藤沿面下垂后越过砖底；长短错落。',25)
    s.text(x+35,y+870,'剪短只去掉末端；根部宿主挖除后，对应悬垂藤移除。',25,GREEN)
s.text(45,1220,'背面藤向Z负侧散开，前面藤向Z正侧散开；不让前后叶层穿进砖体，也不长进贴合的后墙。',27,BLUE)
s.save('natural-vine-hanging.png')
print('Front and back hanging vine perspectives saved.')

# Shape atlas: stems follow explicit surface paths; leaf silhouettes vary along them.
def vine_path(points, leaf_size=.085, stride=2, plane='front', seed=0):
    faces=[];samples=[]
    for a,b in zip(points,points[1:]):
        count=max(2,math.ceil(math.dist(a,b)/.045))
        samples += [tuple(a[k]+(b[k]-a[k])*i/count for k in range(3)) for i in range(count)]
    samples.append(points[-1])
    for a,b in zip(samples,samples[1:]):
        horizontal=math.hypot(b[0]-a[0],b[2]-a[2])
        offset=(.008*(b[2]-a[2])/horizontal,0,-.008*(b[0]-a[0])/horizontal) if horizontal else (.008,0,0)
        faces.append(([tuple(a[k]-offset[k] for k in range(3)),tuple(a[k]+offset[k] for k in range(3)),tuple(b[k]+offset[k] for k in range(3)),tuple(b[k]-offset[k] for k in range(3))],'#536B38'))
    for i,(x,y,z) in enumerate(samples):
        if i%stride:continue
        side=-1 if (i//stride+seed)%2 else 1
        r=leaf_size*(.72+.28*math.sin(i*1.73+seed)**2)
        # Heart/lobed leaf outline; varying tilt prevents a repeated tile pattern.
        angle=side*.7+math.sin(i+seed)*.3;u=(math.cos(angle),math.sin(angle));v=(-u[1],u[0])
        if plane=='droop':angle=side*.4+math.sin(i+seed)*.1;u=(math.cos(angle),math.sin(angle));v=(-u[1],u[0])
        outline=((0,0),(-.45,.28),(-.60,.85),(-.22,1.10),(0,.91),(.28,1.1),(.6,.8),(.4,.25))
        vertices=[]
        for aa,bb in outline:
            xx=(aa*u[0]+bb*v[0])*r;yy=(aa*u[1]+bb*v[1])*r
            if plane=='droop':vertices.append((x+xx,y-yy,z-.018))
            elif plane=='slope':vertices.append((x+xx,y+xx/1.4+.018,z+yy))
            elif plane=='top':vertices.append((x+xx,y+.018,z+yy))
            elif plane=='side':vertices.append((x+.018,y+yy,z+xx))
            else:vertices.append((x+xx,y+yy,z-.018))
        base=vertices[0]
        faces.append(([(x-.003,y,z),(x+.003,y,z),(base[0]+.003,base[1],base[2]),(base[0]-.003,base[1],base[2])],'#536B38'))
        faces.append((vertices,('#648845','#82A25B','#4C7950','#A3B86A')[(i//stride+seed)%4]))
    return faces

def trim_vine(faces,low):
    result=[]
    for vertices,color in faces:
        if all(v[1]>=low for v in vertices):result.append((vertices,color));continue
        if color!='#536B38':continue
        clipped=[]
        for a,b in zip(vertices,vertices[1:]+vertices[:1]):
            if a[1]>=low:clipped.append(a)
            if (a[1]>=low)!=(b[1]>=low):
                t=(low-a[1])/(b[1]-a[1]);clipped.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(3)))
        if len(clipped)>=3:result.append((clipped,color))
    return result

def hanging_vine(length):
    faces=[]
    for j,factor in enumerate((1,.73,.5,.87)):
        x=.15+j*.22;end=-1.5*factor
        faces+=vine_path([(x,0,-1),(x+.025,-.1,-1.04),(x+.04,-.4,-1.07),(x-.03,end*.75,-1.1),(x,end,-1.13)],.08,3,seed=j)
    return trim_vine(faces,-length)

def atlas_form(index):
    ground=box(-.18,-.14,-1.17,1.36,.14,2.3,'#C4B397')
    wall=box(0,0,-1,1,1,2,'#B3A28A');plants=[];center=(.5,.5,0);scale=255
    if index==0:
        for xx,yy,ww,hh in ((.05,.1,.28,.28),(.4,.52,.32,.43),(.72,.12,.22,.45),(.18,.7,.2,.2)):
            plants+=patch(xx,yy,-1.03,ww,hh,.03,'#7B9861',front=True)
        plants+=patch(.12,1,-.7,.7,.03,1.3,'#7B9861')
    elif index==1:
        plants=[([(xx,yy+1,zz) for xx,yy,zz in vs],c) for vs,c in grass_tile(0,.18)]
        for i in range(15):
            xx=.03+i*.066;bottom=.58+.13*math.sin(i*1.7)
            plants.append(([(xx-.025,1,-1.015),(xx+.025,1,-1.015),(xx+.015,bottom,-1.07)],'#769453'))
    elif index==2:
        points=[(.12,.02,-1.03),(.28,.28,-1.03),(.23,.5,-1.03),(.58,.7,-1.03),(.72,.97,-1.03)]
        plants=vine_path(points,stride=3)
        plants+=vine_path([points[2],(.1,.65,-1.03),(.09,.87,-1.03)],.06,3,seed=1)
    elif index==3:
        root=(.5,.02,-1.03)
        for j,end in enumerate((.09,.28,.5,.73,.92)):
            plants+=vine_path([root,(.5,.25,-1.03),((end+.5)/2,.55,-1.03),(end,.94,-1.03)],.1,2,seed=j)
    elif index==4:
        for j in range(7):
            xx=.07+j*.14
            plants+=vine_path([(xx,.02,-1.03),(xx+.04,.28,-1.04),(xx-.02,.58,-1.03),(xx+.02,.94,-1.04)],.15,1,seed=j)
        plants+=vine_path([(.5,.98,-1.03),(.5,1.03,-.9),(.5,1.03,.92)],.14,2,'top')
    elif index==5:
        ground=[];center=(.5,.25,0);wall=box(0,.5,-1,1,.5,2,'#B3A28A')
        plants=vine_path([(.38,1,-1.03),(.48,.8,-1.07),(.4,.48,-1.1),(.57,.17,-1.11),(.49,-.12,-1.12),(.65,-.42,-1.11)],.12,3)
    elif index==6:
        ground=[];center=(.5,.25,0);wall=box(0,.6,-1,1,.4,2,'#B3A28A')
        for j in range(6):
            xx=.07+j*.17;bottom=-.42+.23*((j*3)%5)/4
            plants+=vine_path([(xx,1,-1.03),(xx+.05,.6,-1.06),(xx-.04,.2,-1.1),(xx+.02,bottom,-1.13)],.14,2,seed=j)
    elif index==7:
        for j in range(4):
            yy=.2+j*.21
            plants+=vine_path([(.15,yy-.1,-1.03),(.55,yy,-1.03),(1.025,yy+.03,-1.03)],.12,2,seed=j)
            plants+=vine_path([(1.025,yy+.03,-1.03),(1.025,yy+.05,0),(1.025,yy+.1,.9)],.12,2,'side',j)
    elif index==8:
        ground=box(-.1,-.15,-.45,2.2,.15,.8,'#C4B397');wall=[];center=(1,.8,0);scale=205
        for xx,yy,ww,hh in ((0,0,.4,1.6),(1.6,0,.4,1.6),(.4,0,1.2,.3),(.4,1.3,1.2,.3)):
            wall+=box(xx,yy,-.3,ww,hh,.6,'#B3A28A')
        for shift in (0,.13):
            plants+=vine_path([(.16+shift,.02,-.33),(.16+shift,.9,-.33),(.25+shift,1.46,-.33),(.8,1.46,-.33),(1.5,1.46,-.33),(1.82-shift,1.35,-.33),(1.84-shift,.3,-.33)],.12,2,seed=int(shift*10))
        # The open window is physically absent; foliage stays on its rim.
    elif index==9:
        wall=[];ground=[];center=(.7,.35,0);scale=235
        a=(0,0,-1);b=(1.4,0,-1);c=(1.4,1,-1);d=(0,0,1);e=(1.4,0,1);f=(1.4,1,1)
        wall=[([a,b,c],'#B3A28A'),([d,f,e],'#A9977F'),([a,c,f,d],'#C5B499'),([b,e,f,c],'#AF9D84')]
        for j in range(4):
            z=-.8+j*.54
            plants+=vine_path([(.03,.05,z),(.35,.29,z+.025),(.7,.54,z-.02),(1.05,.79,z+.02),(1.35,1.005,z)],.12,2,'slope',j)
    elif index==10:
        wall=[];ground=box(-.25,-.12,-.75,1.5,.12,1.5,'#C4B397');center=(.5,.8,0);scale=205
        pts=[(.5+.23*math.cos(i*math.tau/10),0,.23*math.sin(i*math.tau/10)) for i in range(10)]
        for j in range(10):
            a=pts[j];b=pts[(j+1)%10];wall.append(([a,b,(b[0],1.8,b[2]),(a[0],1.8,a[2])],'#94704F'))
        wall.append(([(x,1.8,z) for x,y,z in pts],'#B58D62'))
        for j in range(110):
            t=j/109;angle=t*math.tau*3;x=.5+.27*math.cos(angle);z=.27*math.sin(angle);y=.03+1.68*t
            if j:
                plants+=vine_path([prev,(x,y,z)],.10,8,seed=j)
            prev=(x,y,z)
    elif index==11:
        ground=box(-.15,-.14,-1.17,2.3,.14,2.3,'#C4B397');wall=box(0,0,-1,1,1,2,'#B3A28A')+box(1,0,-1,1,1,2,'#B6A58E');center=(1,.45,0);scale=240
        for j in range(4):
            yy=.16+j*.21
            plants+=vine_path([(.03,yy,-1.03),(.6,yy+.1,-1.03),(1,yy+.03,-1.03),(1.4,yy-.04,-1.03),(1.94,yy+.08,-1.03)],.14,2,seed=j)
    return ground+wall,plants,center,scale

forms=[
('01 斑块苔被','不规则苔岛，砖面仍有裸露；贴面厚0.03。'),
('02 草顶包边','整格草顶接短须草裙；边缘下垂约0.3～0.55。'),
('03 稀疏主藤','一条弯曲主藤 + 少量分枝，叶间能看见岩面。'),
('04 扇形攀附','从低处根点向上分扇，轮廓向顶端展开。'),
('05 密叶满铺','多分枝交错覆面，叶片方向和大小交替。'),
('06 单根长垂','上棱一个主支点，长藤弯垂；末端露出砖底。'),
('07 帘状垂挂','上棱多个支点，长短参差，形成通透的叶帘。'),
('08 外转角包覆','正面藤越过侧棱到侧面，连续路径绕实角。'),
('09 洞口绕边','沿窗框与洞边生长；叶留在边框，洞口保持空。'),
('10 坡面匍匐','藤沿实际斜面贴伏；高度随坡面连续抬升。'),
('11 树干缠绕','藤贴圆柱表面螺旋上升，有前后遮挡与裸干。'),
('12 跨格连片','相邻格外表面续接藤茎；缝处不截断叶带。')]
for page in range(2):
    s=Sheet('09 藤蔓与贴面植物｜形态图谱 '+('Ⅰ · 覆盖轮廓' if page==0 else 'Ⅱ · 空间附着'),'每张卡是不同形态，不是同一图换颜色；同组相机方向一致，宿主保留厚度。蓝色短线为1格标尺。',2790)
    for slot in range(6):
        index=page*6+slot;x=35+1190*(slot%2);y=185+830*(slot//2)
        s.card(x,y,1150,795,forms[index][0])
        host,plants,center,scale=atlas_form(index);p=s.camera(x+560,y+380,scale,center)
        if index==9:
            # Turn the ramp toward its low end so the attached leaf surface is visible.
            host=[([(1.4-a,b,-c) for a,b,c in vs],color) for vs,color in host]
            plants=[([(1.4-a,b,-c) for a,b,c in vs],color) for vs,color in plants]
        s.scene(host+plants,p)
        # One-unit screen reference, identical perspective and no fabricated collision box.
        s.line((x+430,y+651),(x+430+scale,y+651),BLUE,3);s.text(x+510,y+665,'1格',22,BLUE)
        s.text(x+35,y+733,forms[index][1],26)
        assert host and plants
    s.text(45,2720,'贴面、转角、悬垂、绕洞、坡面、缠干分别处理；背面按实际外露面复用，同样避让墙体和内部接触面。',26,BLUE)
    s.save(f'natural-vine-forms-{page+1}.png')
print('Twelve distinct vine and surface-plant forms saved in two perspective atlases.')

s=Sheet('10 灌木与盆景｜冠幅、落脚和真实承托','单位：格；左列实体透视，右列等比例XZ俯视。外观包络与实际落脚分开，前方均为Z正。',2180)
for row,kind in enumerate(('shrub','bonsai')):
    y=190+row*930
    shrub=kind=='shrub';w,h,d=(2,1.5,.6) if shrub else (1,2,1)
    zc=.6 if shrub else .5
    s.card(35,y,1150,900,'A 灌木：冠宽2，根在中间宿主格' if shrub else 'C 盆景：固定盆体，整株总高2')
    faces=[]
    for x in (-1.5,-.5,.5) if shrub else (-.5,):faces+=box(x,-.2,-1,1,.2,2,'#C6B394')
    faces += [([(x,yy,z+zc) for x,yy,z in vertices],color) for vertices,color in make_model(kind,{'id':'fruiting' if shrub else 'mature','w':w,'h':h,'d':d})]
    p=s.camera(560,y+380,185,(0,h*.45,.3))
    s.mesh(faces,p);s.wire((-w/2,0,zc-d/2,w,h,d),p)
    s.dim((-w/2,h+.16,zc),(w/2,h+.16,zc),f'冠宽{w:g}',p,dx=-45,dy=-35)
    s.dim((w/2+.16,0,zc-d/2),(w/2+.16,h,zc-d/2),f'总高{h:g}',p,dx=12)
    s.text(65,y+720,'根颈Y=0、Z=−0.6；枝叶Z=[−0.9,−0.3]，身体区及前方留空。' if shrub else '盆底Y=0、中心Z=−0.5；土面Y=0.45；土面以上株高1.55。',27)
    s.text(65,y+770,'挂果贴在冠层外表面；采果后枝叶与根部保留。' if shrub else '盆沿高0.5；盆沿深0.76；成熟枝叶深1。',27)
    s.text(65,y+820,'一格根部宿主，不把冠幅2当成两格实心占位。' if shrub else '成熟冠层、固定盆沿、盆底落脚是三个不同范围。',25,BLUE)
    s.card(1225,y,1140,900,'B 灌木：XZ俯视与根部宿主' if shrub else 'D 盆景：XZ俯视与盆底承托')
    scale=200;ox=1795;oy=y+420
    def q(x,z):return ox+x*scale,oy-z*scale
    def rect(x,z,bw,bd,fill,outline):
        s.d.rectangle((*q(x,z+bd),*q(x+bw,z)),fill=fill,outline=outline,width=3)
    for x in (-1.5,-.5,.5) if shrub else (-.5,):rect(x,-1,1,2,'#EEE5D3','#B3AB9A')
    rect(-.5,-1,1,2,None,ORANGE)
    rect(-w/2,zc-d/2,w,d,None,GREEN)
    if shrub:
        for x in (-.44,0,.44):rect(x-.015,zc-.015,.03,.03,'#98734F','#98734F')
        s.text(1270,y+90,'绿框：冠层2×0.6；橙框：根部宿主1×2。',25)
        s.text(1270,y+700,'三根枝干均落在中间一格内；图外另留成熟净空。',25)
        s.text(1270,y+753,'冠层跨左右格；根在Z=−0.6，落在宿主格顶面靠后处。',26)
    else:
        rect(-.38,zc-.38,.76,.76,'#D2B294',ORANGE)
        rect(-.35,zc-.35,.7,.7,None,BLUE)
        s.text(1270,y+90,'绿框：成熟冠层1×1，贴格子背面 Z=[−1,0]。',25)
        s.text(1270,y+700,'橙框盆沿0.76×0.76；蓝框盆底0.7×0.7。',26)
        s.text(1270,y+753,'按家具规则后对齐；前半格留给人物让位。',25)
    s.text(ox-40,oy+215,'前方 +Z',25,BLUE)
    s.line((ox-100,y+820),(ox+100,y+820),BLUE,3);s.text(ox-40,y+838,'1格标尺',23,BLUE)
s.text(45,2100,'叶片不填满包络；落脚必须接触真实承托面。此图定义资料尺寸，不将冠层或预留框变成实体碰撞。',26,BLUE)
s.save('natural-shrub-bonsai-space.png')
print('Shrub and bonsai placement perspectives saved.')

# Drooping forms use a fixed attachment and an explicit downward path in the same perspective.
s=Sheet('11 下垂植物｜草裙、苔须、藤帘、垂花、悬崖盆景、垂枝树','下垂是独立形态，不能把直立株整体倒转。蓝线标量下垂起点到最低点；宿主与盆体保留真实厚度。',3200)
drooping=[
 ('A 整格草顶 + 边缘草裙',0,-.6,'草根仍在顶面；草裙向下0.6，不向空中加土台。','顶草高0.5，前叶到Z=+1.4；草裙前伸0.15。'),
 ('B 棱边苔须 / 悬垂苔帘',0,-.8,'苔层厚0.03；上棱附着，苔须最下到Y=−0.8。','贴面低苔与悬垂苔须分开；须层前伸最多0.15。'),
 ('C 长垂藤 / 藤帘',0,-1.5,'支点在上棱Y=0；藤帘长短错落，最长下垂1.5。','高1砖底以下再垂0.5；背面按对应外法线摆放。'),
 ('D 沿边垂花 / 开花藤',0,-1.25,'根与枝基贴砖前上棱；花枝向下，花冠最低Y=−1.25。','成熟最大前伸0.28；采花去花冠，保留悬垂枝叶。'),
 ('E 悬崖式盆景',.9,-.8,'从最高弯枝Y=0.9垂到−0.8，下垂落差1.7。','盆底Y=0；盆土Y=0.45；枝叶最低低于盆底0.8。'),
 ('F 垂枝树 / 柳枝形',3.3,1.2,'树总高5；垂枝从冠缘Y=3.3下垂，最低Y=1.2。','根在Z=−0.65；树与垂枝均在Z=[−1,−0.3]，身体区留空。')]
for index,(title,start,low,note,detail) in enumerate(drooping):
    x=35+1190*(index%2);y=185+980*(index//2)
    s.card(x,y,1150,950,title)
    host=box(0,-1,-1,1,1,2,'#B7A48B');plants=[]
    center=(.5,-.35,0);scale=240;dim_x=1.2;dim_z=-1
    if index==0:
        plants=grass_tile(0)
        for j in range(12):
            xx=.05+j*.081;bottom=-.6+.20*(j%3)/2
            plants.append(([(xx-.018,0,-1),(xx+.018,0,-1),(xx+.014,bottom,-1.15)],'#729655'))
    elif index==1:
        plants=patch(.06,-.15,-1.03,.88,.18,.03,'#6E935B',front=True)
        for j in range(10):
            xx=.07+j*.095;bottom=-.8+.3*(j%4)/3
            plants.append(([(xx-.025,0,-1.01),(xx+.025,0,-1.01),(xx+.02,bottom+.13,-1.12),(xx,bottom,-1.15)],'#789B60'))
    elif index==2:
        center=(.5,-.5,0)
        plants=hanging_vine(1.5)
    elif index==3:
        center=(.5,-.5,0)
        for j,length in enumerate((.98,.73,1.12)):
            xx=.18+j*.30
            plants+=vine_path([(xx,0,-1),(xx+.05,-.32,-1.06),(xx,-length,-1.19)],.10,3,seed=j)
            # Terminal bells point down and remain attached to their own flower stalk.
            tip=(xx,-length,-1.19)
            for k in range(8):
                a=k*math.tau/8;b=(k+1)*math.tau/8
                plants.append(([tip,(xx+.09*math.cos(a),-length-.13,-1.19+.09*math.sin(a)),(xx+.09*math.cos(b),-length-.13,-1.19+.09*math.sin(b))],'#CF9D9F'))
    elif index==4:
        host=box(-.35,-1,-.35,.7,1,.7,'#C3AE8E')+make_model('bonsai',{'id':'empty','w':.76,'h':.5,'d':.76})
        center=(.1,.03,0);scale=240;dim_x=.75;dim_z=-.5
        for j in range(3):
            zz=-.15+j*.14
            plants+=vine_path([(0,.45,zz),(.08,.80,zz),(.30,.9,zz-.08),(.38,.52,-.42+j*.01),(.38,-.18,-.45+j*.01),(.35,-.8+j*.13,-.46+j*.01)],.10,3,plane='droop',seed=j)
        plants=trim_vine(plants,-.8)
    else:
        host=[]
        for xx in (-1.5,-.5,.5):host+=box(xx,-.25,-1,1,.25,2,'#C3AE8E')
        plants=[([(a,b,c+TZ) for a,b,c in vs],color) for vs,color in make_model('tree',{'id':'mature','w':3,'h':5,'d':.7})]
        for j in range(9):
            xx=-1.22+j*.305;zz=max(-.965,-.3-.7*math.sqrt(1-(xx/1.5)**2-((3.3-3.6)/1.4)**2))
            length=2.1-.5*(j%3)/2
            branch=vine_path([(xx,3.3,zz),(xx+.05,2.8,max(-.975,zz-.02)),(xx-.03,3.3-length,max(-.975,zz-.02))],.12,3,plane='droop',seed=j)
            plants += [([(a,b,(c+.3)*.5+TZ) for a,b,c in vs],color) for vs,color in trim_vine(branch,low)]
            plants.append(([(-.012,3.3,TZ),(.012,3.3,TZ),(xx+.012,3.3,(zz+.3)*.5+TZ),(xx-.012,3.3,(zz+.3)*.5+TZ)],'#94704F'))
        center=(0,2.35,.5);scale=110;dim_x=1.7;dim_z=-1
    if index==3:flower_geometry=plants
    if index==4:pot_geometry=host[6:];cascade_geometry=plants
    if index==5:willow_geometry=plants;willow_branches=plants[len(make_model('tree',{'id':'mature','w':3,'h':5,'d':1.4})): ]
    p=s.camera(x+550,y+420,scale,center)
    s.scene(host+plants,p)
    s.dim((dim_x,start,dim_z),(dim_x,low,dim_z),f'下垂{start-low:g}',p,dx=12)
    s.text(x+35,y+763,note,25)
    s.text(x+35,y+813,detail,24,BLUE)
    s.dim((center[0]-1.6,-.9 if index<5 else -.5,0),(center[0]-.6,-.9 if index<5 else -.5,0),'X向1格',p,dy=25)
    points=[v for vs,_ in plants for v in vs]
    if index==5:
        assert all(.3-1e-9<=v[2]<=1+1e-9 for v in points),'tree entered body zone or left the tile'
        assert math.isclose(min(v[1] for v in points),0),'tree root must remain on soil'
    if index==4:
        assert all(c<-.35 or a>.35 or a<-.35 for a,b,c in points if b<0),'cascade intersects support'
        assert all(-.5<=a<=.5 and -.5<=c<=.5 for a,b,c in points),'cascade exceeds furniture width/depth'
    print(title,'plant bounds',[(round(min(v[i] for v in points),3),round(max(v[i] for v in points),3)) for i in range(3)])
    assert math.isclose(min(v[1] for v in points),low) if index!=5 else math.isclose(max(v[1] for v in points),5),(title,'vertical bounds')
    assert all(math.isfinite(n) for v in points for n in v)
s.text(45,3130,'支点不随下垂移动；叶层避开砖体、墙与下方障碍。下垂距离量Y差，不等于弯曲枝条的路径总长。',26,BLUE)
s.save('natural-drooping-forms.png')
print('Six drooping plant perspectives saved; attachment and vertical bounds checked.')

s=Sheet('12 垂藤状态｜短芽、向下生长、成熟、剪短','同一宿主、同一镜头与比例；支点固定在上棱Y=0，枝端向下延长，不从砖底向上爬。',2250)
for index,(title,length) in enumerate((('A 萌芽短藤',.2),('B 向下生长',.6),('C 长垂成熟',1.5),('D 修剪后',.3))):
    x=35+1190*(index%2);y=185+960*(index//2)
    s.card(x,y,1150,920,title)
    host=box(0,-1,-1,1,1,2,'#B7A48B');plants=[]
    plants=hanging_vine(length)
    p=s.camera(x+540,y+350,250,(.5,-.55,0))
    s.scene(host+plants,p);s.wire((.04,-1.5,-1.15,.91,1.6,.15),p)
    s.dim((1.15,0,-1),(1.15,-length,-1),f'下垂{length:g}',p,dx=12)
    s.text(x+35,y+727,f'上棱支点Y=0；当前最低Y=−{length:g}；宿主砖高1。',26)
    s.text(x+35,y+785,'灰框为成熟下垂范围；前伸最多0.15，叶片不填满包络。',24,BLUE)
    s.dim((-1.2,-.8,-1),(-.2,-.8,-1),'X向1格',p,dy=18)
    assert math.isclose(min(v[1] for vs,_ in plants for v in vs),-length)
s.text(45,2150,'剪短保留上沿根与短枝；整株拔除才清除藤体。宿主被挖除则移除失去支点的藤段。',26,BLUE)
s.save('natural-drooping-vine-states.png')
print('Four downward vine states saved; fixed supports and lowest tips checked.')

from draw_drooping_states import render_drooping_states
flower_stems=[face for face in flower_geometry if face[1]!='#CF9D9F']
flower_buds=[([tuple(vs[0][k]+(v[k]-vs[0][k])*.45 for k in range(3)) for v in vs],'#C0A183') for vs,color in flower_geometry if color=='#CF9D9F']
tree_spec=(('幼苗','seedling',.45,.6,.25),('幼树','young',1.2,2,.4),('生长中 · 初生短垂枝','growing',2.2,3.5,.6),('成熟长垂枝','mature',3,5,.7),('砍后树桩','stump',.5,.3,.5),('树桩再萌','sprout',.6,.8,.5))
tree_states=[]
for label,sid,w,h,d in tree_spec:
    geometry=[([(x,y,z+TZ) for x,y,z in vs],color) for vs,color in make_model('tree',{'id':sid,'w':w,'h':h,'d':d})]
    if sid=='mature':geometry=willow_geometry
    elif sid=='growing':geometry += [([(x*w/3,y*h/5,(z-TZ)*d/.7+TZ) for x,y,z in vs],color) for vs,color in trim_vine(willow_branches,2.7)]
    note='根在同一土面；树冠展开后才长出下垂枝。' if sid not in ('stump','sprout') else '砍伐移除树冠与垂枝；原树桩保留，再萌从桩上发生。'
    tree_states.append((label,geometry,note))
render_drooping_states(Sheet,[
 {'kind':'flower','title':'13 垂花｜短叶枝、延长、含苞、开花、采后、移除','host':box(0,-1,-1,1,1,2,'#B7A48B'),'states':[
  ('01 短叶枝',trim_vine(flower_stems,-.15),'根在前上棱，短芽向下，宿主格不缩小。'),
  ('02 向下延长',trim_vine(flower_stems,-.6),'上段保持，沿原路径继续向下生长。'),
  ('03 末端含苞',flower_stems+flower_buds,'完整长枝保留；末端为紧收的小花苞。'),
  ('04 朝下开花',flower_geometry,'末端花冠朝下展开，最低Y=−1.25。'),
  ('05 采花后',flower_stems,'只去掉花冠；枝、叶柄和叶片的位置保持原样。'),
  ('06 整株移除',[],'根、枝叶与花一起移除；宿主砖仍在。')]},
 {'kind':'bonsai','title':'14 悬崖盆景｜幼株、越盆沿、长垂、修剪、空盆','host':box(-.35,-1,-.35,.7,1,.7,'#C3AE8E'),'states':[
  ('01 盆内幼株',pot_geometry+vine_path([(0,.45,0),(.02,.62,-.01),(.04,.8,-.02)],.08,3,plane='droop'),'幼株先在盆内生长；容器和土面从一开始就固定。'),
  ('02 越过盆沿',pot_geometry+trim_vine(cascade_geometry,.1),'主枝绕过盆沿，末端到Y=0.1，尚未低于盆底。'),
  ('03 长垂成熟',pot_geometry+cascade_geometry,'含盆最高Y=0.9、最低Y=−0.8；下方留出真实净空。'),
  ('04 修剪后',pot_geometry+trim_vine(cascade_geometry,0),'截去盆底以下的垂枝；原弯枝、上段叶序和盆体保留。'),
  ('05 拔除后空盆',pot_geometry,'活株与根去掉，盆与土保留；没有悬空残叶。')]},
 {'kind':'tree','title':'15 垂枝树｜幼苗到成熟、砍伐与树桩再萌','host':sum((box(x,-.25,-1,1,.25,2,'#C3AE8E') for x in (-1.5,-.5,.5)),[]),'states':tree_states}
])
# A cut may remove geometry, but must never reposition a surviving leaf.
full=hanging_vine(1.5);cut=hanging_vine(.3)
assert all(face in full for face in cut if face[1]!='#536B38'),'pruning moved a surviving leaf'
assert all(min(v[1] for v in vs)>=-.3-1e-10 for vs,_ in cut),'pruning left a segment below the cut'
print('Three complete drooping state sheets saved; surviving-leaf positions checked.')

from draw_plant_clearance import render_plant_clearance
render_plant_clearance(Sheet)
