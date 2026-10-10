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
        z=-.68-(i%2)*.09
        if kind=='grass':
            faces.append(([(xx-.035,0,-.5),(xx+.035,0,-.5),(xx+.06,h,z)],'#77A165'))
        else:
            faces.append(([(xx-.015,0,-.5),(xx+.015,0,-.5),(xx+.015,h,z),(xx-.015,h,z)],'#658B55'))
            faces.append(([(xx,h*.45,z),(xx-.14,h*.55,z-.05),(xx-.06,h*.35,z-.08)],'#79965E'))
            for j in range(5):
                a=j*math.tau/5;px=xx+.085*math.cos(a);py=h+.085*math.sin(a)
                faces.extend(box(px-.045,py-.045,z-.035,.09,.09,.05,'#D69B8B'))
            faces.extend(box(xx-.03,h-.03,z-.065,.06,.06,.035,'#DAC069'))
    return faces

def grass_tile(x,height=.5,root_gap=False):
    faces=[]
    for verts,col in make_model('grass',{'id':'mature','w':1,'h':height,'d':1.4}):
        vertices=[(xx+x+.5,yy,zz-.2) for xx,yy,zz in verts]
        if root_gap and col=='#769757':continue
        if root_gap and min(v[0] for v in vertices)<x+.8 and max(v[0] for v in vertices)>x+.2 and min(v[2] for v in vertices)<0 and max(v[2] for v in vertices)>-.5:continue
        faces.append((vertices,col))
    if root_gap:
        for xx,zz,w,d in ((x,-.5,.2,1),(x+.8,-.5,.2,1),(x+.2,0,.6,.5)):
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

s=Sheet('01 单格附着物｜青苔的四种形态','宿主砖 X=[0,1]、Y=[−1,0]、Z=[−0.5,+0.5]；镜头从 Z 负侧看。绿色附着层不替代砖体。')
for idx,kind in enumerate(('top','front','wrap','hang')):
    x=35+(idx%2)*1190;y=190+(idx//2)*930
    titles=('顶面片状青苔','前立面斑块青苔','前上沿包边青苔','前上沿垂挂青苔')
    s.card(x,y,1150,890,titles[idx]);faces=box(0,-1,-.5,1,1,1,'#B7A48B')
    if kind in ('top','wrap'):
        for xx,ww,zz,dd in ((.08,.35,-.48,.7),(.35,.35,-.48,.88),(.65,.27,-.48,.6)):
            faces+=patch(xx,0,zz,ww,.03,dd,'#7E9C61')
    if kind in ('front','wrap'):
        for xx,ww,yy,hh in ((.08,.3,-.65,.53),(.3,.4,-.85,.7),(.64,.28,-.62,.5)):
            if kind=='wrap':hh=-yy+.03
            faces+=patch(xx,yy,-.53,ww,hh,.03,'#73965D',front=True)
        if kind=='wrap':faces+=box(.08,0,-.53,.84,.03,.05,'#7E9C61')
    if kind=='hang':
        faces+=box(.1,0,-.53,.8,.03,.05,'#779B60')
        for i in range(7):
            xx=.14+i*.10;low=-.25-(i%3)*.10
            faces.append(([(xx-.03,.02,-.5),(xx+.045,.02,-.5),(xx+.025,low,-.65),(xx-.025,low+.06,-.63)],'#7F9D60'))
    p=s.camera(x+350,y+390,280,(.5,-.4,0));s.mesh(faces[:6],p);s.mesh(faces[6:],p)
    s.wire((0,-1,-1,1,1,.5),p,GREEN)
    s.dim((0,-1.18,-.5),(1,-1.18,-.5),'宽1',p,dy=20)
    s.dim((1.16,-1,-.5),(1.16,0,-.5),'砖高1',p,dx=8)
    # Equal-unit YZ section; moss thickness exaggerated nowhere.
    ox=x+780;oy=y+570;u=230
    q=lambda z,yy:(ox+(z+.5)*u,oy-yy*u)
    s.text(x+755,y+160,'YZ 侧剖 · 等比例',24)
    s.d.rectangle((*q(-.5,0),*q(.5,-1)),fill='#D0BEA2',outline=INK,width=2)
    s.d.rectangle((*q(-1,0),*q(-.5,-1)),outline=GREEN,width=2)
    if kind in ('top','wrap'):s.d.rectangle((*q(-.5 if kind=='wrap' else -.48,.03),*q(.4,0)),fill=GREEN)
    if kind in ('front','wrap'):s.d.rectangle((*q(-.53,.03 if kind=='wrap' else -.12),*q(-.5,-.85)),fill=GREEN)
    if kind=='hang':s.d.polygon([q(-.5,.03),q(-.65,-.45),q(-.58,-.4),q(-.5,0)],fill=GREEN)
    s.text(x+635,y+610,'前延0.5',22,GREEN);s.text(x+810,y+610,'砖深1',22,BLUE)
    notes=[('高0.03；Z=[−0.48,+0.4]','顶面生长，不把整块砖涂成草砖。'),('凸出0.03；Z=[−0.53,−0.5]','沿前立面贴附，Y=[−0.85,−0.12]。'),('顶片 + 前片连续包住前上棱','贴面厚0.03；接角不留悬空缝。'),('前伸0.15；最低垂到Y=−0.45','根挂Z=−0.5的砖沿，叶须伸入前延区。')][idx]
    s.text(x+25,y+735,notes[0],27,GREEN);s.text(x+25,y+790,notes[1],25)
s.text(45,2100,'附着层依附宿主面：宿主挖除则附着物移除；坡砖按实际坡面贴附，半砖按实际顶面落点。',27)
s.text(45,2150,'厚度及形态为本轮制作方案；不新增可站立青苔层、不把前延半格填成实体砖。',26,BLUE)
s.save('natural-attachments-space.png')

s=Sheet('02 整格草地｜顶面全覆盖 + 前缘伸叶','每格顶面1×1都铺草；成熟叶高0.5，草叶总深1.4。根在真实砖面上，前叶再伸入预留半格。',2100)
s.card(35,180,1500,980,'A 三格连续草地透视 · 前、中、后都有草')
faces=[]
for x in range(3):faces+=box(x,-1,-.5,1,1,1,'#B9A98C')
p=s.camera(760,675,260,(1.5,-.2,-.1));s.mesh(faces,p)
for x in range(3):s.mesh(grass_tile(x),p)
s.wire((0,0,-.9,3,.5,1.4),p,GREEN)
s.dim((0,-1.2,-.5),(3,-1.2,-.5),'3个宿主格连续铺草',p,dx=-150,dy=30)
s.dim((3.1,.65,-.9),(3.1,.65,.5),'总深1.4',p,dx=15,dy=-45)
s.text(75,280,'低草底覆盖整个顶面，草簇在X、Z两个方向分布。',27,GREEN)
s.text(75,1040,'相邻格不留裸土缝；格界线只用于量尺寸，不切出一条条草带。',26)
s.card(1560,180,805,980,'B 俯视 XZ · 一格完整覆盖')
ox=1710;oy=430;u=400;q=lambda xx,z:(ox+xx*u,oy+(z+.9)*u)
s.d.rectangle((*q(0,-.9),*q(1,.5)),fill='#AAC393',outline=GREEN,width=3)
s.d.rectangle((*q(0,-.5),*q(1,.5)),fill='#789B59',outline=INK,width=3)
for i in range(8):
    for j in range(8):
        px,py=q(.055+i*.125,-.46+j*.125);s.line((px-4,py+5),(px+5,py-5),'#B7CD9A',2)
s.text(1660,300,'镜头侧 / Z负',25,BLUE)
s.text(1650,1015,'深1顶面全铺 + 前伸0.4',27,GREEN)
s.text(1650,1070,'前延半格还余0.1；不增加土台。',23)
for z,t in ((-.9,'−0.9'),(-.5,'−0.5'),(.5,'+0.5')):s.text(2130,q(0,z)[1]-10,t,23,BLUE)
s.card(35,1190,1500,770,'C 侧向透视 · 深度与高度从格子直接读')
faces=box(0,-1,-.5,1,1,1,'#B9A98C');p=s.camera(555,1545,245,(.5,-.1,0));s.mesh(faces,p);s.mesh(grass_tile(0),p)
s.wire((0,0,-.9,1,.5,1.4),p,GREEN)
s.dim((1.4,0,-.9),(1.4,.5,-.9),'高0.5',p,dx=12)
s.dim((0,-1.1,-.9),(0,-1.1,-.5),'前伸0.4',p,dx=-140,dy=10)
s.text(970,1370,'后排：到砖后沿 +0.5',25)
s.text(970,1430,'中排：覆盖砖顶面',25)
s.text(970,1490,'前排：根在前棱 −0.5',25)
s.text(970,1550,'叶尖：最前到 −0.9',25,GREEN)
s.text(80,1880,'薄草底厚0.012；高叶之间留空，整格覆盖不等于半格高的绿色实心块。',25)
s.card(1560,1190,805,770,'D 花长在草地里 · 草仍铺满')
faces=box(0,-.5,-.5,1,.5,1,'#B9A98C');p=s.camera(1950,1580,240,(.5,.3,0));s.mesh(faces,p);s.mesh(grass_tile(0)+flora('flower',0),p)
s.text(1600,1850,'花沿前缘长，花后与两侧继续铺草。',24)
s.text(45,2015,'生长和割短改变草高与密度；整格覆盖范围保持。树根处只避让实际根口，见树木组合图。',27,BLUE)
s.save('natural-flora-space.png')

s=Sheet('03 树木｜五格高度、三格树冠、一格根部宿主','完整支撑砖置于 Y=[−1,0]；树高从地面Y=0量起。树干、树冠、预留格与碰撞分别定义。',2250)
s.card(35,180,1370,1920,'A 实体透视 + 逐格高度标尺')
faces=[]
for x in range(3):faces+=box(x,-1,-.5,1,1,1,'#B6A183' if x!=1 else '#C8A570')
for x in range(3):faces+=grass_tile(x,root_gap=x==1)
for verts,col in make_model('tree',{'id':'mature','w':3,'h':5,'d':1.4}):faces.append(([(xx+1.5,yy,zz-.3) for xx,yy,zz in verts],col))
p=s.camera(660,1190,220,(1.5,2,-.1));s.mesh(faces,p)
s.wire((0,0,-1,3,5,1.4),p,GREEN)
for yy in range(6):
    s.dash(p((0,yy,.4)),p((3,yy,.4)),BLUE)
    px,py=p((3.17,yy,-1));s.text(px+10,py-10,str(yy),25,BLUE)
for xx in range(4):s.dash(p((xx,0,.4)),p((xx,5,.4)),BLUE)
s.dim((-.2,0,-1),(-.2,5,-1),'株高5',p,dx=-120)
s.dim((0,5.2,-1),(3,5.2,-1),'冠宽3',p,dy=-40)
s.text(75,1900,'中间格承托树根；周围整格铺草，树干周围留0.6×0.5根口。',26)
s.text(75,1970,'干高3.3 / 冠Y=[2.2,5]，二者相交，不相加为8.3。',26,GREEN)
s.card(1440,180,925,880,'B XY 正视：成熟净空 3列×5行')
u=125;ox=1685;oy=920
for xx in range(4):s.line((ox+xx*u,oy),(ox+xx*u,oy-5*u),GRAY,2)
for yy in range(6):s.line((ox,oy-yy*u),(ox+3*u,oy-yy*u),GRAY,2)
s.d.ellipse((ox,oy-5*u,ox+3*u,oy-2.2*u),fill='#ABC19C',outline=GREEN,width=3)
s.d.rectangle((ox+1.3*u,oy-3.3*u,ox+1.7*u,oy),fill='#997450')
s.d.rectangle((ox+u,oy,ox+2*u,oy+u*.5),fill='#C9AC79',outline=INK,width=2)
for xx in range(4):s.dash((ox+xx*u,oy),(ox+xx*u,oy-5*u),BLUE)
for yy in range(6):s.dash((ox,oy-yy*u),(ox+3*u,oy-yy*u),BLUE)
s.text(1500,995,'底部仅截示支撑砖；成熟预留15格不等于实体。',24)
s.card(1440,1095,925,1005,'C XZ 俯视：冠深1.4，干深0.4')
u=205;ox=1510;oy=1365;q=lambda x,z:(ox+x*u,oy+(z+1)*u)
s.d.rectangle((*q(0,-1),*q(3,-.5)),fill='#E5EFDF')
s.d.rectangle((*q(0,-.5),*q(3,.5)),fill='#E2D6C3')
s.d.ellipse((*q(0,-1),*q(3,.4)),fill='#ABC09C',outline=GREEN,width=3)
s.d.rectangle((*q(1.3,-.5),*q(1.7,-.1)),fill='#9A7652',outline=INK,width=3)
for xx in range(4):s.dash(q(xx,-1),q(xx,.5),BLUE)
s.line(q(0,0),q(3,0),BLUE,2)
s.text(1500,1265,'冠层跨前延与中央；根不前移到悬空位置。',24)
s.text(1500,1750,'根中心：(1.5,0,−0.3)',27)
s.text(1500,1810,'干 X=[1.3,1.7] / Z=[−0.5,−0.1]',24)
s.text(1500,1870,'冠 X=[0,3] / Z=[−1,+0.4]',25,GREEN)
s.text(1500,1940,'冠叶不是可站立砖；枝干平台需另外定义。',24)
s.text(45,2160,'每个生长阶段沿用同一宿主格与根锚点；幼苗就预留成熟净空。砍后只保留高0.3树桩。',27,BLUE)
s.save('natural-tree-space.png')

s=Sheet('04 矿脉｜嵌在岩层中的矿格，不是独立漂浮方块','岩层剖块 5×4×1，共20格；五个宿主石格含矿。矿种只改这些石格的材质/储量，不叠加另一套实体。',2250)
vein={(1,1),(2,1),(3,1),(1,2),(2,2)}
for idx,state in enumerate(('intact','partial','depleted')):
    x=35+(idx%2)*1190;y=185+(idx//2)*970;s.card(x,y,1150,930,('A 开采前：20石格 / 5含矿格','B 部分开采：18石格 / 3含矿格','C 耗尽：15围岩格 / 0含矿格')[idx])
    deleted=set() if state=='intact' else ({(3,1),(2,2)} if state=='partial' else vein)
    faces=[];remaining=[]
    for xx in range(5):
        for yy in range(4):
            if (xx,yy) in deleted:continue
            remaining.append((xx,yy));faces+=box(xx,yy,-.5,1,1,1,'#A6A79F')
            if (xx,yy) in vein:
                partial=state=='partial' and (xx,yy)==(2,1)
                for j in range(1 if partial else 3):
                    px=xx+.18+j*.27;py=yy+.22+j*.22
                    faces.append(([(px-.12,py,-.505),(px+.06,py+.15,-.505),(px+.18,py+.07,-.505),(px,py-.08,-.505)],'#629A9B'))
    # The exposed band branches across retained hosts; removed cells break it.
    for a,b in (((1,1),(1,2)),((1,2),(2,2)),((1,1),(2,1)),((2,1),(3,1))):
        if a not in vein-deleted or b not in vein-deleted:continue
        ax,ay=a[0]+.35,a[1]+.32;bx,by=b[0]+.58,b[1]+.64
        mx,my=(ax+bx)/2+.10,(ay+by)/2-.08
        faces.append(([(ax-.05,ay,-.506),(mx-.06,my,-.506),(bx-.04,by,-.506),(bx+.04,by+.06,-.506),(mx+.06,my+.04,-.506),(ax+.05,ay+.03,-.506)],'#629A9B'))
    assert len(remaining)==20-len(deleted)
    p=s.camera(x+520,y+450,115,(2.5,2,0));s.mesh([f for f in faces if f[1]!='#629A9B'],p);s.mesh([f for f in faces if f[1]=='#629A9B'],p)
    for xx,yy in deleted:s.wire((xx,yy,-.5,1,1,1),p,'#BE9D75')
    if state=='partial':
        px,py=p((2.1,1.4,-.52));s.text(px,py,'50%',21,'#8D522F')
    s.dim((0,-.22,-.5),(5,-.22,-.5),'岩层宽5',p,dy=25)
    s.dim((5.2,0,-.5),(5.2,4,-.5),'高4',p,dx=10)
    s.text(x+30,y+778,('矿区左下(1,1)，原包围3×2；右上角不是矿格。','挖掉(3,1)、(2,2)；(2,1)采到50%但仍是整格。','仅原五矿格成为洞；其他围岩保留，矿不自然再生。')[idx],24)
    s.text(x+30,y+839,'青色只标可见矿物；橙虚线是已挖空位置，不保留碰撞。',24,GREEN)
x=1225;y=1155;s.card(x,y,1140,930,'D 单格含矿石：外形与内含物')
faces=box(0,0,-.5,1,1,1,'#ADADA5')
for xx,yy,w,h in ((.12,.18,.22,.15),(.4,.4,.3,.18),(.65,.66,.22,.15)):
    faces+=box(xx,yy,-.52,w,h,.03,'#629A9B')
p=s.camera(x+330,y+420,280,(.5,.5,0));s.mesh(faces[:6],p);s.mesh(faces[6:],p)
s.dim((0,-.2,-.5),(1,-.2,-.5),'宽1',p,dy=20);s.dim((1.2,0,-.5),(1.2,1,-.5),'高1',p,dx=5)
s.text(x+665,y+210,'宿主石格',27,BLUE);s.text(x+665,y+260,'宽1×高1×深1',25)
s.text(x+665,y+340,'矿丝 / 矿物嵌体',26,GREEN)
s.text(x+665,y+390,'穿入岩体并露出表面',24)
s.text(x+665,y+440,'露头凸出≤0.03',24)
s.text(x+665,y+520,'仅暴露面显示露头',24)
s.text(x+665,y+570,'深处矿带剖切才可见',24)
s.text(x+665,y+620,'XZ剖切示意 · 深1',22,BLUE)
s.d.rectangle((x+665,y+660,x+955,y+752),fill='#ADADA5',outline=INK,width=2)
s.d.polygon([(x+690,y+752),(x+750,y+706),(x+790,y+660),(x+830,y+660),(x+786,y+714),(x+718,y+752)],fill='#629A9B')
s.line((x+795,y+705),(x+900,y+675),GREEN,5)
s.text(x+965,y+704,'前',21,BLUE)
s.text(x+30,y+778,'不是背景薄墙上的贴花资源，也不是前延区长出的植物。',24)
s.text(x+30,y+837,'示例矿带坐标和露头厚度为本轮方案；未规定产量数值。',24,GREEN)
s.text(45,2160,'矿格逻辑深1；露头仅表面细节，不扩大地形碰撞。五矿格都采完仍有15格围岩，不能整块岩层消失。',26,BLUE)
s.save('natural-ore-space.png')
print('Four placement diagrams saved; tile counts and drawing bounds checked.')

s=Sheet('05 树木与整格草地｜落根、树冠、相邻树和采后','同一株树始终落在同一个宿主格；整格草地铺到树下，只在实际根口避让。所有尺寸单位为格。',2400)
s.card(35,180,1135,1100,'A 成熟组合透视 · 树高5 / 冠宽3 / 冠深1.4')
faces=[]
for x in range(3):faces+=box(x,-1,-.5,1,1,1,'#B9A98C')+grass_tile(x,root_gap=x==1)
faces += [([(xx+1.5,yy,zz-.3) for xx,yy,zz in vs],c) for vs,c in make_model('tree',{'id':'mature','w':3,'h':5,'d':1.4})]
p=s.camera(580,760,120,(1.5,2,-.1));s.mesh(faces,p);s.wire((0,0,-1,3,5,1.4),p,GREEN)
for yy in range(6):s.dash(p((0,yy,.4)),p((3,yy,.4)),BLUE)
s.dim((-.2,0,-1),(-.2,5,-1),'高5',p,dx=-75)
s.text(75,1150,'冠在空中展开，草在砖顶铺满；侧面能读到两者深度。',25)
s.text(75,1210,'前冠到Z=−1；后冠到+0.4；树干Z=[−0.5,−0.1]。',25,GREEN)
s.card(1200,180,1165,1100,'B 根部放大 · 保留周围草，不让草穿树干')
faces=box(0,-.5,-.5,1,.5,1,'#B9A98C')+grass_tile(0,root_gap=True)+box(.3,0,-.5,.4,1,.4,'#9B7855')
p=s.camera(1510,750,280,(.5,.2,0));s.mesh(faces,p)
s.text(1240,320,'低处透视：树干下段截示',25)
s.text(1890,320,'XZ俯视：根口0.6×0.5',25,BLUE)
u=330;ox=1930;oy=500;q=lambda x,z:(ox+x*u,oy+(z+.5)*u)
s.d.rectangle((*q(0,-.5),*q(1,.5)),fill='#88A86B',outline=INK,width=3)
s.d.rectangle((*q(.2,-.5),*q(.8,0)),fill='#B9A98C',outline=ORANGE,width=2)
s.d.rectangle((*q(.3,-.5),*q(.7,-.1)),fill='#9B7855',outline=INK,width=3)
s.text(1890,880,'棕色：干0.4×0.4',25)
s.text(1890,935,'浅土：留出根口',25)
s.text(1890,990,'绿色：余下顶面全铺草',24,GREEN)
s.text(1240,1150,'幼苗、成树、树桩沿用这个根口；砍树只去掉高干和冠。',25)
s.text(1240,1210,'草不随砍树消失；树桩高0.3，原位再萌仍使用原根口。',25,GREEN)
s.card(35,1310,1135,920,'C 相邻树透视 · 用冠宽检查间距')
faces=[]
for x in range(7):faces+=box(x,-.4,-.5,1,.4,1,'#B9A98C')+grass_tile(x,root_gap=x in (1,5))
for cx in (1.5,5.5):
    faces += [([(xx+cx,yy,zz-.3) for xx,yy,zz in vs],c) for vs,c in make_model('tree',{'id':'mature','w':3,'h':5,'d':1.4})]
p=s.camera(575,1780,103,(3.5,2,-.1));s.mesh(faces,p)
s.dim((1.5,0,-1.15),(5.5,0,-1.15),'示例树心距4格 / 成熟冠间留1格',p,dx=-225,dy=30)
s.text(75,2120,'图示选用4格树心距；幼树也按未来3格冠宽看空间。',25)
s.text(75,2180,'树冠不能穿进建筑；前后相邻冠叶按真实深度遮挡。',25,GREEN)
s.card(1200,1310,1165,920,'D YZ侧剖 · 冠、树干、人物平面与后墙')
u=120;ox=1550;oy=2080;q=lambda z,y:(ox+z*u,oy-y*u)
s.d.rectangle((*q(-.5,0),*q(.5,-.5)),fill='#B9A98C',outline=INK,width=2)
s.d.rectangle((*q(.5,5),*q(.7,0)),fill='#C8D3D8',outline=BLUE,width=2)
s.d.ellipse((*q(-1,5),*q(.4,2.2)),fill='#ACC79B',outline=GREEN,width=3)
s.d.rectangle((*q(-.5,3.3),*q(-.1,0)),fill='#9B7855',outline=INK,width=2)
s.line(q(0,0),q(0,5.1),BLUE,3)
for z,label in ((-1,'−1'),(0,'0'),(.5,'+0.5')):s.text(q(z,0)[0]-12,2160,label,22,BLUE)
s.text(1790,1450,'冠后沿 +0.4',27,GREEN)
s.text(1790,1510,'到后墙 +0.5 余0.1',25)
s.text(1790,1590,'蓝线：人物逻辑平面Z=0',24,BLUE)
s.text(1790,1670,'前叶能遮住靠后的角色；',24)
s.text(1790,1720,'角色重叠处仅淡化前叶，',24)
s.text(1790,1770,'保留树干、后叶与冠轮廓。',24)
s.text(1790,1870,'根仍在砖上；不前移整株',24)
s.text(1790,1920,'来躲避遮挡或墙体。',24)
s.text(1790,2030,'侧剖省略草，便于看清根。',23,GREEN)
s.text(45,2290,'坡面：草贴实际表面，树干仍竖直；根口需足够的土壤承托。宿主挖空后不保留悬空树与草。',27,BLUE)
s.text(45,2340,'本图确定空间和遮挡表现方案；实际模型、动画和交互仍未接入。',26)
s.save('natural-tree-ground-space.png')
print('Tree and full-tile grass perspective sheet saved.')

# Front and back are rendered from the same host and attached surface geometry.
def surface_vine(side, stage='mature'):
    faces=[];full=stage=='mature';length={'sprout':.2,'growing':.6,'mature':1,'cut':.25}[stage]
    sign=-1 if side=='front' else 1;z=sign*.515
    for branch,x in enumerate((.16,.39,.62,.84)):
        segments=10
        for j in range(segments):
            t=j/segments;end=(j+1)/segments
            if end>length+.001:continue
            ax=x+.035*math.sin(j*1.6+branch);bx=x+.035*math.sin((j+1)*1.6+branch)
            ay=-1+t;by=-1+end
            faces.append(([(ax-.009,ay,z),(ax+.009,ay,z),(bx+.009,by,z),(bx-.009,by,z)],'#557347'))
            for d in (-1,1):
                lx=bx+d*.06;ly=by+.018;zz=sign*.555
                vertices=[(bx,by,z),(lx-d*.055,ly+.06,zz),(lx-d*.02,ly+.13,zz),(lx+d*.035,ly+.10,zz),(lx+d*.07,ly+.13,zz),(lx+d*.08,ly+.03,zz),(lx+d*.025,ly-.04,zz)]
                # Leaves remain inside their own host face and its 0.08 outward envelope.
                vertices=[(min(.99,max(.01,a)),min(.01,b),c) for a,b,c in vertices]
                faces.append((vertices,('#719557','#4D7E50','#86A55D')[(j+branch)%3]))
    return faces

def surface_moss(side):
    sign=-1 if side=='front' else 1
    return sum((patch(x,-.94,z,w,.94,.03,col,front=True) for x,w,z,col in ((.02,.37,-.53 if sign<0 else .5,'#79955D'),(.30,.4,-.53 if sign<0 else .5,'#8BA46A'),(.65,.33,-.53 if sign<0 else .5,'#6F8D55'))),[])

def draw_surface(s,x,y,kind,back=False,stage='mature',scale=270):
    p=s.camera(x,y,scale,(.5,-.25,0))
    def show(faces):
        if back:faces=[([(1-a,b,-c) for a,b,c in vertices],color) for vertices,color in faces]
        s.mesh(faces,p)
    show(box(0,-1,-.5,1,1,1,'#B8A488'))
    if kind=='moss':
        show(grass_tile(0,.25));show(surface_moss('back' if back else 'front'))
        # The rim connects the top turf to the front and back attached layer.
        show(box(0,-.035,-.53,1,.05,.03,'#769757')+box(0,-.035,.5,1,.05,.03,'#769757'))
    else:
        show(surface_vine('back' if back else 'front',stage))
        if stage=='mature':
            for xx in (.18,.42,.66,.84):
                show(box(xx-.009,.008,-.515,.018,.018,1.03,'#557347'))
                for zz in (-.4,-.15,.1,.35):
                    show([([(xx-.07,.035,zz),(xx,.065,zz-.10),(xx+.09,.035,zz),(xx,.04,zz+.12)],'#739853')])
    return p

s=Sheet('06 贴面植物｜顶面、正面、背面都覆盖','同一宿主格，左列从Z负侧看正面，右列绕到Z正侧看背面；覆盖层沿外表面绕过棱边。',2400)
for idx,(kind,back) in enumerate((('moss',False),('moss',True),('vine',False),('vine',True))):
    x=35+(idx%2)*1190;y=185+(idx//2)*1035
    s.card(x,y,1150,995,('A 草顶 + 苔被：正面透视','B 同一草苔格：背面透视','C 藤蔓 / 爬山虎：正面透视','D 同一藤蔓格：背面透视')[idx])
    p=draw_surface(s,x+545,y+425,kind,back)
    s.dim((0,-1.16,-.5),(1,-1.16,-.5),'格宽1',p,dy=25)
    s.dim((1.12,-1,-.5),(1.12,0,-.5),'格高1',p,dx=15)
    s.text(x+35,y+800,('顶面整格草底；正面薄苔连续包边，向下覆盖砖面。','背面同样有薄苔；顶面草与后上棱相接，不留裸背。','藤茎贴面分枝，叶片层向外最多0.08；翻过顶部。','背面藤叶从同一顶边接续；不是把正面图贴到背面。')[idx],25)
    s.text(x+35,y+865,('正面 Z=[−0.53,−0.5]；顶草根仍在整个顶面。','背面 Z=[+0.5,+0.53]；背面朝Z正方向凸出。','正面叶层 Z=[−0.58,−0.5]；沿棱进入顶面。','背面叶层 Z=[+0.5,+0.58]；后墙占面处需避让。')[idx],25,GREEN)
s.text(45,2280,'只覆盖实际外露面：相邻格内部接触面不长重复叶层；有后墙贴住的背面也不画穿墙藤叶。',27,BLUE)
s.text(45,2340,'图示是贴面植物的正背面方案；草叶、低苔和藤叶分别画出高度与厚度，砖体本身仍深1。',26)
s.save('natural-surface-vines.png')

s=Sheet('07 藤蔓｜萌芽、攀附生长、绕顶成熟、修剪后','同一格、同一镜头、同一根部；藤茎从下方支点向上爬，成熟后越过顶边连接背面。',2250)
for idx,stage in enumerate(('sprout','growing','mature','cut')):
    x=35+(idx%2)*1190;y=185+(idx//2)*960
    s.card(x,y,1150,920,('A 萌芽：贴面短枝','B 生长：沿面分枝','C 成熟：正面 → 顶面 → 背面','D 修剪后：保留根与低枝')[idx])
    p=draw_surface(s,x+520,y+415,'vine',stage=stage,scale=270)
    s.text(x+35,y+740,('支点位于底沿Y=−1；正面攀升0.2，叶尖约到Y=−0.67。','正面攀升0.6，叶尖约到Y=−0.27；持续贴住宿主面。','正面攀升1到顶边；顶面跨深1，连接段另计。','长枝与上部叶层去掉；低枝高0.2，原支点不移动。')[idx],25)
    s.text(x+35,y+810,'宿主格不缩放、不随叶量消失；整株拔除时仅移除藤与根。',25,GREEN)
s.text(45,2130,'下垂变体从上棱扎附、向下挂；换成跨两格高的墙时，藤沿连续外露面续接，不跨空格悬浮。',26,BLUE)
s.text(45,2190,'本页是形态与空间参考；藤是否可攀爬、长速及采集产物另属玩法，不由叶层包络推导。',26)
s.save('natural-vine-states.png')
for face in ('front','back'):
    for vs,c in surface_vine(face):
        for xx,yy,zz in vs:assert 0<=xx<=1 and -1<=yy<=.02 and .5<=abs(zz)<=.58
print('Front/back surface plants and four vine states saved; leaf envelopes checked.')

s=Sheet('08 垂挂藤｜上沿扎附，正面与背面向下垂','宿主仍为深1、高1；最长藤从顶沿向下1.5，越过砖底0.5。侧向散开最多0.15。',1300)
for idx,back in enumerate((False,True)):
    x=35+1190*idx;y=180;s.card(x,y,1150,990,('A 前上沿垂挂 · 镜头从Z负侧看','B 后上沿垂挂 · 镜头绕到Z正侧')[idx])
    p=s.camera(x+545,y+450,275,(.5,-.6,0))
    def show(faces):
        if back:faces=[([(1-a,b,-c) for a,b,c in vs],col) for vs,col in faces]
        s.mesh(faces,p)
    show(box(0,-1,-.5,1,1,1,'#B8A488'))
    sign=1 if back else -1;faces=[]
    for vs,col in surface_vine('back' if back else 'front'):
        avg=sum(v[0] for v in vs)/len(vs);length=1.5 if avg<.28 else 1.1 if avg<.51 else .75 if avg<.74 else 1.3
        faces.append(([(a,-length*(min(0,b)+1),c+sign*.065*(min(0,b)+1)) for a,b,c in vs],col))
    show(faces)
    show(box(.08,0,.49 if back else -.53,.84,.03,.04,'#6C8C50'))
    s.dim((1.22,0,-.55),(1.22,-1.5,-.55),'最长1.5',p,dx=15)
    s.text(x+35,y+810,'上棱有连续支点，藤沿面下垂后越过砖底；长短错落。',25)
    s.text(x+35,y+870,'剪短只去掉末端；根部宿主挖除后，对应悬垂藤移除。',25,GREEN)
s.text(45,1220,'背面藤向Z正侧散开，前面藤向Z负侧散开；不让前后叶层穿进砖体，也不长进贴合的后墙。',27,BLUE)
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
        faces+=vine_path([(x,0,-.5),(x+.025,-.1,-.54),(x+.04,-.4,-.57),(x-.03,end*.75,-.60),(x,end,-.63)],.08,3,seed=j)
    return trim_vine(faces,-length)

def atlas_form(index):
    ground=box(-.18,-.14,-.67,1.36,.14,1.3,'#C4B397')
    wall=box(0,0,-.5,1,1,1,'#B3A28A');plants=[];center=(.5,.5,0);scale=255
    if index==0:
        for xx,yy,ww,hh in ((.05,.1,.28,.28),(.4,.52,.32,.43),(.72,.12,.22,.45),(.18,.7,.2,.2)):
            plants+=patch(xx,yy,-.53,ww,hh,.03,'#7B9861',front=True)
        plants+=patch(.12,1,-.35,.7,.03,.65,'#7B9861')
    elif index==1:
        plants=[([(xx,yy+1,zz) for xx,yy,zz in vs],c) for vs,c in grass_tile(0,.18)]
        for i in range(15):
            xx=.03+i*.066;bottom=.58+.13*math.sin(i*1.7)
            plants.append(([(xx-.025,1,-.515),(xx+.025,1,-.515),(xx+.015,bottom,-.57)],'#769453'))
    elif index==2:
        points=[(.12,.02,-.53),(.28,.28,-.53),(.23,.5,-.53),(.58,.7,-.53),(.72,.97,-.53)]
        plants=vine_path(points,stride=3)
        plants+=vine_path([points[2],(.1,.65,-.53),(.09,.87,-.53)],.06,3,seed=1)
    elif index==3:
        root=(.5,.02,-.53)
        for j,end in enumerate((.09,.28,.5,.73,.92)):
            plants+=vine_path([root,(.5,.25,-.53),((end+.5)/2,.55,-.53),(end,.94,-.53)],.1,2,seed=j)
    elif index==4:
        for j in range(7):
            xx=.07+j*.14
            plants+=vine_path([(xx,.02,-.53),(xx+.04,.28,-.54),(xx-.02,.58,-.53),(xx+.02,.94,-.54)],.15,1,seed=j)
        plants+=vine_path([(.5,.98,-.53),(.5,1.03,-.4),(.5,1.03,.42)],.14,2,'top')
    elif index==5:
        ground=[];center=(.5,.25,0);wall=box(0,.5,-.5,1,.5,1,'#B3A28A')
        plants=vine_path([(.38,1,-.53),(.48,.8,-.57),(.4,.48,-.6),(.57,.17,-.61),(.49,-.12,-.62),(.65,-.42,-.61)],.12,3)
    elif index==6:
        ground=[];center=(.5,.25,0);wall=box(0,.6,-.5,1,.4,1,'#B3A28A')
        for j in range(6):
            xx=.07+j*.17;bottom=-.42+.23*((j*3)%5)/4
            plants+=vine_path([(xx,1,-.53),(xx+.05,.6,-.56),(xx-.04,.2,-.6),(xx+.02,bottom,-.63)],.14,2,seed=j)
    elif index==7:
        for j in range(4):
            yy=.2+j*.21
            plants+=vine_path([(.15,yy-.1,-.53),(.55,yy,-.53),(1.025,yy+.03,-.53)],.12,2,seed=j)
            plants+=vine_path([(1.025,yy+.03,-.53),(1.025,yy+.05,0),(1.025,yy+.1,.4)],.12,2,'side',j)
    elif index==8:
        ground=box(-.1,-.15,-.45,2.2,.15,.8,'#C4B397');wall=[];center=(1,.8,0);scale=205
        for xx,yy,ww,hh in ((0,0,.4,1.6),(1.6,0,.4,1.6),(.4,0,1.2,.3),(.4,1.3,1.2,.3)):
            wall+=box(xx,yy,-.3,ww,hh,.6,'#B3A28A')
        for shift in (0,.13):
            plants+=vine_path([(.16+shift,.02,-.33),(.16+shift,.9,-.33),(.25+shift,1.46,-.33),(.8,1.46,-.33),(1.5,1.46,-.33),(1.82-shift,1.35,-.33),(1.84-shift,.3,-.33)],.12,2,seed=int(shift*10))
        # The open window is physically absent; foliage stays on its rim.
    elif index==9:
        wall=[];ground=[];center=(.7,.35,0);scale=235
        a=(0,0,-.5);b=(1.4,0,-.5);c=(1.4,1,-.5);d=(0,0,.5);e=(1.4,0,.5);f=(1.4,1,.5)
        wall=[([a,b,c],'#B3A28A'),([d,f,e],'#A9977F'),([a,c,f,d],'#C5B499'),([b,e,f,c],'#AF9D84')]
        for j in range(4):
            z=-.4+j*.27
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
        ground=box(-.15,-.14,-.67,2.3,.14,1.3,'#C4B397');wall=box(0,0,-.5,1,1,1,'#B3A28A')+box(1,0,-.5,1,1,1,'#B6A58E');center=(1,.45,0);scale=240
        for j in range(4):
            yy=.16+j*.21
            plants+=vine_path([(.03,yy,-.53),(.6,yy+.1,-.53),(1,yy+.03,-.53),(1.4,yy-.04,-.53),(1.94,yy+.08,-.53)],.14,2,seed=j)
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

s=Sheet('10 灌木与盆景｜冠幅、落脚和真实承托','单位：格；左列实体透视，右列等比例XZ俯视。外观包络与实际落脚分开，前方均为Z负。',2180)
for row,kind in enumerate(('shrub','bonsai')):
    y=190+row*930
    shrub=kind=='shrub';w,h,d=(2,1.5,.8) if shrub else (1,2,1)
    zc=-.3 if shrub else 0
    s.card(35,y,1150,900,'A 灌木：冠宽2，根在中间宿主格' if shrub else 'C 盆景：固定盆体，整株总高2')
    faces=[]
    for x in (-1.5,-.5,.5) if shrub else (-.5,):faces+=box(x,-.2,-.5,1,.2,1,'#C6B394')
    faces += [([(x,yy,z+zc) for x,yy,z in vertices],color) for vertices,color in make_model(kind,{'id':'fruiting' if shrub else 'mature','w':w,'h':h,'d':d})]
    p=s.camera(560,y+420,240,(0,h*.45,0))
    s.mesh(faces,p);s.wire((-w/2,0,zc-d/2,w,h,d),p)
    s.dim((-w/2,h+.16,zc),(w/2,h+.16,zc),f'冠宽{w:g}',p,dx=-45,dy=-35)
    s.dim((w/2+.16,0,zc-d/2),(w/2+.16,h,zc-d/2),f'总高{h:g}',p,dx=12)
    s.text(65,y+720,'根颈Y=0；枝叶Z=[−0.7,+0.1]，前伸0.2。' if shrub else '盆底Y=0；土面Y=0.45；土面以上株高1.55。',27)
    s.text(65,y+770,'挂果贴在冠层外表面；采果后枝叶与根部保留。' if shrub else '盆沿高0.5；盆沿深0.76；成熟枝叶深1。',27)
    s.text(65,y+820,'一格根部宿主，不把冠幅2当成两格实心占位。' if shrub else '成熟冠层、固定盆沿、盆底落脚是三个不同范围。',25,BLUE)
    s.card(1225,y,1140,900,'B 灌木：XZ俯视与根部宿主' if shrub else 'D 盆景：XZ俯视与盆底承托')
    scale=260;ox=1775;oy=y+430
    def q(x,z):return ox+x*scale,oy-z*scale
    def rect(x,z,bw,bd,fill,outline):
        s.d.rectangle((*q(x,z+bd),*q(x+bw,z)),fill=fill,outline=outline,width=3)
    for x in (-1.5,-.5,.5) if shrub else (-.5,):rect(x,-.5,1,1,'#EEE5D3','#B3AB9A')
    rect(-.5,-.5,1,1,None,ORANGE)
    rect(-w/2,zc-d/2,w,d,None,GREEN)
    if shrub:
        for x in (-.44,0,.44):rect(x-.015,zc-.015,.03,.03,'#98734F','#98734F')
        s.text(1270,y+90,'绿框：冠层2×0.8；橙框：根部宿主1×1。',25)
        s.text(1270,y+700,'三根枝干均落在中间一格内；图外另留成熟净空。',25)
        s.text(1270,y+753,'冠层跨左右格，根在Z=−0.3的真实砖顶。',26)
    else:
        rect(-.38,-.38,.76,.76,'#D2B294',ORANGE)
        rect(-.35,-.35,.7,.7,None,BLUE)
        s.text(1270,y+90,'绿框：成熟冠层1×1，与图示1×1承托面重合。',25)
        s.text(1270,y+700,'橙框盆沿0.76×0.76；蓝框盆底0.7×0.7。',26)
        s.text(1270,y+753,'仅深0.5的前延区不能完整承托深0.7的盆底。',25)
    s.text(ox-40,oy+220,'前方 −Z',25,BLUE)
    s.line((ox-130,y+820),(ox+130,y+820),BLUE,3);s.text(ox-40,y+838,'1格标尺',23,BLUE)
s.text(45,2100,'叶片不填满包络；落脚必须接触真实承托面。此图定义资料尺寸，不将冠层或预留框变成实体碰撞。',26,BLUE)
s.save('natural-shrub-bonsai-space.png')
print('Shrub and bonsai placement perspectives saved.')

# Drooping forms use a fixed attachment and an explicit downward path in the same perspective.
s=Sheet('11 下垂植物｜草裙、苔须、藤帘、垂花、悬崖盆景、垂枝树','下垂是独立形态，不能把直立株整体倒转。蓝线标量下垂起点到最低点；宿主与盆体保留真实厚度。',3200)
drooping=[
 ('A 整格草顶 + 边缘草裙',0,-.6,'草根仍在顶面；草裙向下0.6，不向空中加土台。','顶草高0.5，前叶到Z=−0.9；草裙前伸0.15。'),
 ('B 棱边苔须 / 悬垂苔帘',0,-.8,'苔层厚0.03；上棱附着，苔须最下到Y=−0.8。','贴面低苔与悬垂苔须分开；须层前伸最多0.15。'),
 ('C 长垂藤 / 藤帘',0,-1.5,'支点在上棱Y=0；藤帘长短错落，最长下垂1.5。','高1砖底以下再垂0.5；背面按对应外法线摆放。'),
 ('D 沿边垂花 / 开花藤',0,-1.25,'根与枝基贴砖前上棱；花枝向下，花冠最低Y=−1.25。','成熟最大前伸0.28；采花去花冠，保留悬垂枝叶。'),
 ('E 悬崖式盆景',.9,-.8,'从最高弯枝Y=0.9垂到−0.8，下垂落差1.7。','盆底Y=0；盆土Y=0.45；枝叶最低低于盆底0.8。'),
 ('F 垂枝树 / 柳枝形',3.3,1.2,'树总高5；垂枝从冠缘Y=3.3下垂，最低Y=1.2。','树根、干与冠保持原位；砍树移除冠和垂枝。')]
for index,(title,start,low,note,detail) in enumerate(drooping):
    x=35+1190*(index%2);y=185+980*(index//2)
    s.card(x,y,1150,950,title)
    host=box(0,-1,-.5,1,1,1,'#B7A48B');plants=[]
    center=(.5,-.35,0);scale=270;dim_x=1.2;dim_z=-.5
    if index==0:
        plants=grass_tile(0)
        for j in range(12):
            xx=.05+j*.081;bottom=-.6+.20*(j%3)/2
            plants.append(([(xx-.018,0,-.5),(xx+.018,0,-.5),(xx+.014,bottom,-.65)],'#729655'))
    elif index==1:
        plants=patch(.06,-.15,-.53,.88,.18,.03,'#6E935B',front=True)
        for j in range(10):
            xx=.07+j*.095;bottom=-.8+.3*(j%4)/3
            plants.append(([(xx-.025,0,-.51),(xx+.025,0,-.51),(xx+.02,bottom+.13,-.62),(xx,bottom,-.65)],'#789B60'))
    elif index==2:
        center=(.5,-.5,0)
        plants=hanging_vine(1.5)
    elif index==3:
        center=(.5,-.5,0)
        for j,length in enumerate((.98,.73,1.12)):
            xx=.18+j*.30
            plants+=vine_path([(xx,0,-.5),(xx+.05,-.32,-.56),(xx,-length,-.69)],.10,3,seed=j)
            # Terminal bells point down and remain attached to their own flower stalk.
            tip=(xx,-length,-.69)
            for k in range(8):
                a=k*math.tau/8;b=(k+1)*math.tau/8
                plants.append(([tip,(xx+.09*math.cos(a),-length-.13,-.69+.09*math.sin(a)),(xx+.09*math.cos(b),-length-.13,-.69+.09*math.sin(b))],'#CF9D9F'))
    elif index==4:
        host=box(-.35,-1,-.35,.7,1,.7,'#C3AE8E')+make_model('bonsai',{'id':'empty','w':.76,'h':.5,'d':.76})
        center=(.1,.03,0);scale=240;dim_x=.75;dim_z=-.5
        for j in range(3):
            zz=-.15+j*.14
            plants+=vine_path([(0,.45,zz),(.08,.80,zz),(.30,.9,zz-.08),(.38,.52,-.42+j*.01),(.38,-.18,-.45+j*.01),(.35,-.8+j*.13,-.46+j*.01)],.10,3,plane='droop',seed=j)
        plants=trim_vine(plants,-.8)
    else:
        host=[]
        for xx in (-1.5,-.5,.5):host+=box(xx,-.25,-.5,1,.25,1,'#C3AE8E')
        plants=[([(a,b,c-.3) for a,b,c in vs],color) for vs,color in make_model('tree',{'id':'mature','w':3,'h':5,'d':1.4})]
        for j in range(9):
            xx=-1.22+j*.305;zz=max(-.965,-.3-.7*math.sqrt(1-(xx/1.5)**2-((3.3-3.6)/1.4)**2))
            length=2.1-.5*(j%3)/2
            branch=vine_path([(xx,3.3,zz),(xx+.05,2.8,max(-.975,zz-.02)),(xx-.03,3.3-length,max(-.975,zz-.02))],.12,3,plane='droop',seed=j)
            plants+=trim_vine(branch,low)
            plants.append(([(-.012,3.3,-.3),(.012,3.3,-.3),(xx+.012,3.3,zz),(xx-.012,3.3,zz)],'#94704F'))
        center=(0,2.35,0);scale=110;dim_x=1.7;dim_z=-.5
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
    host=box(0,-1,-.5,1,1,1,'#B7A48B');plants=[]
    plants=hanging_vine(length)
    p=s.camera(x+540,y+350,290,(.5,-.55,0))
    s.mesh(host+plants,p);s.wire((.04,-1.5,-.65,.91,1.6,.15),p)
    s.dim((1.15,0,-.5),(1.15,-length,-.5),f'下垂{length:g}',p,dx=12)
    s.text(x+35,y+727,f'上棱支点Y=0；当前最低Y=−{length:g}；宿主砖高1。',26)
    s.text(x+35,y+785,'灰框为成熟下垂范围；前伸最多0.15，叶片不填满包络。',24,BLUE)
    s.dim((-1.2,-.8,-.5),(-.2,-.8,-.5),'X向1格',p,dy=18)
    assert math.isclose(min(v[1] for vs,_ in plants for v in vs),-length)
s.text(45,2150,'剪短保留上沿根与短枝；整株拔除才清除藤体。宿主被挖除则移除失去支点的藤段。',26,BLUE)
s.save('natural-drooping-vine-states.png')
print('Four downward vine states saved; fixed supports and lowest tips checked.')

from draw_drooping_states import render_drooping_states
flower_stems=[face for face in flower_geometry if face[1]!='#CF9D9F']
flower_buds=[([tuple(vs[0][k]+(v[k]-vs[0][k])*.45 for k in range(3)) for v in vs],'#C0A183') for vs,color in flower_geometry if color=='#CF9D9F']
tree_spec=(('幼苗','seedling',.45,.6,.25),('幼树','young',1.2,2,.6),('生长中 · 初生短垂枝','growing',2.2,3.5,1),('成熟长垂枝','mature',3,5,1.4),('砍后树桩','stump',.4,.3,.4),('树桩再萌','sprout',.6,.8,.4))
tree_states=[]
for label,sid,w,h,d in tree_spec:
    geometry=[([(x,y,z-.3) for x,y,z in vs],color) for vs,color in make_model('tree',{'id':sid,'w':w,'h':h,'d':d})]
    if sid=='mature':geometry=willow_geometry
    elif sid=='growing':geometry += [([(x*w/3,y*h/5,(z+.3)*d/1.4-.3) for x,y,z in vs],color) for vs,color in trim_vine(willow_branches,2.7)]
    note='根在同一土面；树冠展开后才长出下垂枝。' if sid not in ('stump','sprout') else '砍伐移除树冠与垂枝；原树桩保留，再萌从桩上发生。'
    tree_states.append((label,geometry,note))
render_drooping_states(Sheet,[
 {'kind':'flower','title':'13 垂花｜短叶枝、延长、含苞、开花、采后、移除','host':box(0,-1,-.5,1,1,1,'#B7A48B'),'states':[
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
 {'kind':'tree','title':'15 垂枝树｜幼苗到成熟、砍伐与树桩再萌','host':sum((box(x,-.25,-.5,1,.25,1,'#C3AE8E') for x in (-1.5,-.5,.5)),[]),'states':tree_states}
])
# A cut may remove geometry, but must never reposition a surviving leaf.
full=hanging_vine(1.5);cut=hanging_vine(.3)
assert all(face in full for face in cut if face[1]!='#536B38'),'pruning moved a surviving leaf'
assert all(min(v[1] for v in vs)>=-.3-1e-10 for vs,_ in cut),'pruning left a segment below the cut'
print('Three complete drooping state sheets saved; surviving-leaf positions checked.')
