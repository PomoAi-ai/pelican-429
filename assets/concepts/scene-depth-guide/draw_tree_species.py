"""Nine game tree shapes with their crown-pad platforms, plus the game-camera view of standing on a crown."""
from pathlib import Path
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'public/concepts'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#263F48'; BLUE='#376E9B'; GREEN='#538E68'; ORANGE='#AE7342'; GRAY='#C9D3D5'; PURPLE='#8A5BB8'
# Read the shapes straight from the game config so the sheet cannot drift from worldgen.
GAME=json.loads(subprocess.run(['node','--input-type=module','-e','''
import { TREE_SHAPES, PLATFORM_CLEARANCE, TRUNK_RADIUS_MAX, SIDE_PAD_MIN_ROW } from './src/config/worldgen-rules.ts';
import { CROWN_PAD_LIFT, CROWN_PAD_OVERHANG } from './src/world/trees.ts';
import { TUNING } from './src/config/tuning.ts';
console.log(JSON.stringify({ shapes: TREE_SHAPES, clearance: PLATFORM_CLEARANCE, trunkMax: TRUNK_RADIUS_MAX, sideMin: SIDE_PAD_MIN_ROW,
  lift: CROWN_PAD_LIFT, overhang: CROWN_PAD_OVERHANG, minGap: TUNING.worldgen.treeMinGap }));
'''],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
NAMES={'oak':'橡树','broad':'阔冠树','pine':'松树','bush':'矮冠树','palm':'椰子树','sakura':'樱花','willow':'柳树','birch':'白桦','dead':'枯树'}
LIFT=GAME['lift'];OVER=GAME['overhang']
# Design depth (+Z toward the camera): crown Z=[−1,−0.3], trunk Z depth ≤ 0.6 centred at −0.65.
TREE_Z=-.65;CROWN_D=.7;TRUNK_D=.5

def row_of(p,T,C):return T+C-1+p['dy'] if p['anchor']=='crown' else T+p['dy']

class Sheet:
    def __init__(self,w,h):
        self.im=Image.new('RGB',(w,h),'#F5F3EC');self.d=ImageDraw.Draw(self.im)
    def text(self,x,y,s,n=26,c=INK):
        f=ImageFont.truetype(FONT,n);b=self.d.textbbox((x,y),s,font=f)
        assert b[2]<self.im.width-8 and b[3]<self.im.height-6,(s,b)
        self.d.text((x,y),s,font=f,fill=c)
    def card(self,x,y,w,h,title):
        self.d.rounded_rectangle((x,y,x+w,y+h),18,fill='white',outline='#D0DDDE',width=2);self.text(x+25,y+20,title,33,BLUE)
    def dash_rect(self,a,b,c):
        (x0,y0),(x1,y1)=a,b
        for (p,q) in (((x0,y0),(x1,y0)),((x1,y0),(x1,y1)),((x1,y1),(x0,y1)),((x0,y1),(x0,y0))):
            n=max(1,int(math.dist(p,q)/9))
            for i in range(0,n,2):
                self.d.line((p[0]+(q[0]-p[0])*i/n,p[1]+(q[1]-p[1])*i/n,p[0]+(q[0]-p[0])*min(i+1,n)/n,p[1]+(q[1]-p[1])*min(i+1,n)/n),fill=c,width=2)

def species_elevation(s,kind,ox,oy,u):
    """XY front view at the maximum T and C; ox is the trunk column's left edge, oy the ground line."""
    sh=GAME['shapes'][kind];T=sh['trunkHeight']['max'];C=sh['canopyHeight']['max']
    hw=sh['canopyHalfWidth']['max'];r=sh['trunkRadius']['max'];lean=sh['crownLean']
    X=lambda x:ox+x*u;Y=lambda y:oy-y*u
    for gx in range(-4,6):s.d.line((X(gx),Y(0),X(gx),Y(15.4)),fill='#EEF1F1',width=1)
    for gy in range(16):s.d.line((X(-4),Y(gy),X(5),Y(gy)),fill='#EEF1F1',width=1)
    s.d.rectangle((X(-4),Y(0),X(5),Y(-.35)),fill='#C9AC79')
    top=T+C+(LIFT if any(p['anchor']=='crown' for p in sh['platforms']) else 0)
    cx=.5+lean
    if kind!='dead':s.dash_rect((X(cx-hw),Y(top)),(X(cx+hw),Y(T)),GREEN)
    # Trunk: palm bends toward the leaning crown, the rest stand straight.
    if lean:s.d.line((X(.5),Y(0),X(.5+lean*.35),Y(T*.6),X(cx),Y(T+C*.5)),fill='#8C6A4B',width=max(3,int(2*r*u)),joint='curve')
    else:s.d.rectangle((X(.5-r),Y(T+C*.5 if kind in ('pine','birch') else T),X(.5+r),Y(0)),fill='#8C6A4B')
    if kind=='pine':
        for p in sh['platforms']:
            ty=row_of(p,T,C);s.d.polygon([(X(p['dx0']-OVER),Y(ty+1)),(X(p['dx1']+1+OVER),Y(ty+1)),(X(.5),Y(min(ty+4.2,top)))],fill='#9DBB90',outline=GREEN)
    for p in sh['platforms']:
        ty=row_of(p,T,C);x0=p['dx0']+lean;x1=p['dx1']+lean+1
        optional='chance' in p
        if kind=='dead' or p['role']=='branch':
            s.d.line((X(.5),Y(ty+.55),X(x0 if x0<0 else x1),Y(ty+.75)),fill='#8C6A4B',width=max(4,int(u*.28)))
            s.d.rectangle((X(x0-OVER*.3),Y(ty+1),X(x1+OVER*.3),Y(ty+.72)),fill='#9C7B59')
        elif kind!='pine':
            s.d.rounded_rectangle((X(x0-OVER),Y(ty+1+LIFT),X(x1+OVER),Y(ty+.05)),int(u*.45),fill='#B5CBA6' if optional else '#9DBB90',outline=GREEN)
        for col in range(p['dx0'],p['dx1']+1):
            a=(X(col+lean),Y(ty+1));b=(X(col+lean+1),Y(ty))
            if optional:s.dash_rect(a,b,PURPLE)
            else:s.d.rectangle((*a,*b),outline=PURPLE,width=3)
        if optional and x0>0:s.text(X(x1+OVER)+4,Y(ty+.9),f"p={p['chance']:g}",17,PURPLE)
    s.text(X(-3.6),Y(15.9),f'{NAMES[kind]} {kind}',27,INK)
    def rng(v):return f"{v['min']:g}–{v['max']:g}" if v['min']!=v['max'] else f"{v['min']:g}"
    s.text(X(-3.6),oy+18,f"T {rng(sh['trunkHeight'])} · C {rng(sh['canopyHeight'])} · 高≤{T+C}",20)
    s.text(X(-3.6),oy+46,f"冠宽 {2*sh['canopyHalfWidth']['min']:g}–{2*hw:g} · 干径 {2*sh['trunkRadius']['min']:g}–{2*r:g}",20,GREEN)
    s.text(X(-3.6),oy+74,f"平台 {len([p for p in sh['platforms'] if 'chance' not in p])} 必有 + {len([p for p in sh['platforms'] if 'chance' in p])} 可选",20,PURPLE)

# --- game camera ---------------------------------------------------------------------------
D=30;FOV=30;HH=D*math.tan(math.radians(FOV/2));HW=HH*16/9;PX=1080/(2*HH)
def boxf(x0,x1,y0,y1,z0,z1,color):
    v=[(x,y,z) for x in (x0,x1) for y in (y0,y1) for z in (z0,z1)]
    ids=((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3))
    return [([v[i] for i in f],color) for f in ids]
def ellipsoid(cx,cy,cz,rx,ry,rz,color,n=10,m=14):
    def p(i,j):
        la=-math.pi/2+i*math.pi/n;lo=j*2*math.pi/m
        return (cx+rx*math.cos(la)*math.cos(lo),cy+ry*math.sin(la),cz+rz*math.cos(la)*math.sin(lo))
    return [([p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)],color) for i in range(n) for j in range(m)]
def tree_faces(col,kind,T,C):
    sh=GAME['shapes'][kind];r=sh['trunkRadius']['max'];hw=sh['canopyHalfWidth']['max'];cx=col+.5
    top=T+C+LIFT;bottom=T-.6
    faces=boxf(cx-r,cx+r,0,T+.3,TREE_Z-TRUNK_D/2,TREE_Z+TRUNK_D/2,'#8C6A4B')
    faces+=ellipsoid(cx,(top+bottom)/2,TREE_Z,hw,(top-bottom)/2,CROWN_D/2,'#8FB27E')
    return faces
def shade(face):
    (a,b,c)=face[0][:3]
    u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
    n=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);l=math.sqrt(sum(x*x for x in n)) or 1
    k=.72+.28*abs(n[0]*.3+n[1]*.8+n[2]*.52)/l
    col=face[1].lstrip('#');rgb=[int(col[i:i+2],16) for i in (0,2,4)]
    return tuple(min(255,int(x*k)) for x in rgb)
def project(cam,v):
    f=D/(D-v[2]);return ((v[0]-cam[0])*f,(v[1]-cam[1])*f)
def render(s,faces,cam,rect,view):
    """rect: canvas box; view: (sx0,sy0,sx1,sy1) in screen tile units at zoom 1."""
    x0,y0,x1,y1=rect;vx0,vy0,vx1,vy1=view;k=(x1-x0)/(vx1-vx0)
    to=lambda q:(x0+(q[0]-vx0)*k,y0+(vy1-q[1])*k)
    layer=Image.new('RGB',(x1-x0,y1-y0),'#DCEAF2');dd=ImageDraw.Draw(layer)
    for f in sorted(faces,key=lambda f:-sum(math.dist((cam[0],cam[1],D),v) for v in f[0])/len(f[0])):
        xy=[tuple(c-o for c,o in zip(to(project(cam,v)),(x0,y0))) for v in f[0]]
        dd.polygon(xy,fill=shade(f),outline=tuple(max(0,c-40) for c in shade(f)))
    s.im.paste(layer,(x0,y0));s.d.rectangle(rect,outline=INK,width=2)
    return to

if __name__=='__main__':
    s=Sheet(2400,2900)
    s.text(45,32,'树木物种｜九种树形、冠团平台与游戏镜头',46)
    s.text(45,103,'数据直接读取游戏 TREE_SHAPES（取 T、C 上限）。紫框为平台格，虚紫为可选侧冠团（数字为出现概率）；绿团为平台的叶团外观，绿虚框为树冠包络。',25,BLUE)
    s.card(35,170,2330,1560,'A 九种树形 · XY 正视同比例（1格=40像素）')
    kinds=list(GAME['shapes'])
    assert kinds==list(NAMES),kinds
    for i,kind in enumerate(kinds):
        r,c=divmod(i,5);species_elevation(s,kind,ox=200+c*450,oy=890+r*740,u=40)
    # Player for scale: collision 0.8×2.8, visual 3.1.
    px=200+4*450+40*0;oy=890+740
    s.d.rounded_rectangle((px+40*1.1,oy-40*3.1,px+40*1.9,oy),10,fill='#F3D7B8',outline=INK,width=2)
    s.text(px+40*2.2,oy-40*2.2,'玩家角色',24);s.text(px+40*2.2,oy-40*1.5,'外观高3.1',22)
    s.text(1990,1080,f"平台上方净空 ≥ {GAME['clearance']} 行",22,PURPLE)
    s.text(1990,1120,f"侧冠团行偏移 ≥ {GAME['sideMin']}",22,PURPLE)
    s.text(1990,1160,f"叶团 = 平台列 ±{OVER:g}，顶 +{LIFT:g}",22,GREEN)
    s.text(1990,1200,f"树干列间距 ≥ {GAME['minGap']}",22)
    # Game camera at zoom 1: player on the bush crown, camera = feet + (1.5, 1.2).
    feet=(.5,5.0);cam=(feet[0]+1.5,feet[1]+1.2)
    scene=boxf(-22,24,-4,0,-1,1,'#B9A98C')
    scene+=tree_faces(0,'bush',3,2)+tree_faces(-10,'sakura',5,4)+tree_faces(13,'oak',9,6)
    player=boxf(feet[0]-.4,feet[0]+.4,feet[1],feet[1]+3.1,-.3,.3,'#F3D7B8')
    s.card(35,1760,1560,1050,'B 游戏镜头（fov 30°、距离30、+Z平视，16:9 缩放1）')
    rect=(70,1840,70+1490,1840+int(1490*9/16))
    to=render(s,scene+player,cam,rect,(-HW,-HH,HW,HH))
    s.text(80,rect[3]+15,'玩家角色站在矮冠树冠顶（画面中心）；左缘樱花、右缘橡树、下缘地面。镜头跟随角色，站树时脚下总在画面中部。',22)
    s.text(80,rect[3]+50,'近处细节：画面边缘才露出侧面与顶面；树体全部在角色之后，角色总是画在树前。',22,GREEN)
    s.card(1625,1760,740,1050,'C 局部放大与可见像素（1080p）')
    def crop(y,title,center,half):
        s.text(1650,y,title,24,BLUE)
        r=(1650,y+36,1650+330,y+36+250)
        sc=project(cam,center)
        render(s,scene+player,cam,r,(sc[0]-half*1.32,sc[1]-half,sc[0]+half*1.32,sc[1]+half))
        return r
    crop(1830,'① 脚与叶团（中心）',(feet[0],feet[1],0),1.4)
    crop(2150,'② 右上缘橡树冠底',(13.5,9.3,TREE_Z),2.2)
    crop(2470,'③ 下缘地面顶面',(.5,0,0),1.2)
    # Measured margins in the same projection.
    crown=[v for f in tree_faces(0,'bush',3,2)[-140:] for v in f[0]]
    sf=project(cam,(feet[0],feet[1],0))
    lip=max(project(cam,v)[1] for v in crown if abs(project(cam,v)[0]-sf[0])<.4)-sf[1]
    ground=abs(project(cam,(.5,0,1))[1]-project(cam,(.5,0,-1))[1])*PX
    side=(project(cam,(13.5+2.6,9,-.3))[0]-project(cam,(13.5+2.6,9,-1))[0])*PX
    assert lip>0,'feet would float above the crown pad'
    for j,line in enumerate((f'① 叶团顶高出脚底 {lip:.2f} 格（{lip*PX:.0f}px）',f'② 冠深0.7侧面宽 {side:.0f}px',f'③ 地面顶面深2 → {ground:.0f}px')):
        s.text(2000,1880+j*320,line,21,INK)
    s.text(2000,1920,'脚陷入叶团，不悬空',20,GREEN);s.text(2000,2240,'边缘才看得到冠底与侧面',20,GREEN);s.text(2000,2560,'只在画面下缘露出细条',20,GREEN)
    s.text(45,2840,'数值来源：src/config/worldgen-rules.ts、src/world/trees.ts、TUNING.worldgen；深度按本页后置设计（冠Z=[−1,−0.3]），现行渲染为中心−0.7、前沿−0.1。',23,BLUE)
    s.im.save(OUT/'natural-tree-species.png')
    print(f'natural-tree-species.png saved; feet lip {lip:.3f}, ground {ground:.1f}px, side {side:.1f}px')
