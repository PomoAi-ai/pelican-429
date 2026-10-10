"""One-way platform: grid, proportional perspective, behavior and room joins."""
from pathlib import Path
import math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
W,H=2400,2400
im=Image.new('RGB',(W,H),'#F5F3EE');d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#23394A';BLUE='#326BB0';ORANGE='#B96F36';GREEN='#59846A';GRAY='#A8BDC5'
def text(x,y,s,n=27,c=INK):
 f=ImageFont.truetype(FONT,n);b=d.textbbox((x,y),s,font=f)
 assert b[2]<W-20 and b[3]<H-15,(s,b)
 d.text((x,y),s,font=f,fill=c)
def line(a,b,c=BLUE,w=2):d.line((a,b),fill=c,width=w)
def arrow(a,b,c=ORANGE,w=4):
 line(a,b,c,w);t=math.atan2(a[1]-b[1],a[0]-b[0])
 for dt in (-.45,.45):line(b,(b[0]+15*math.cos(t+dt),b[1]+15*math.sin(t+dt)),c,w)
def dash(a,b,c=GRAY):
 n=max(1,math.ceil(math.dist(a,b)/12))
 for i in range(0,n,2):line(tuple(a[k]+(b[k]-a[k])*i/n for k in (0,1)),tuple(a[k]+(b[k]-a[k])*min(i+1,n)/n for k in (0,1)),c)
def dim(a,b,label,xy):arrow(a,b,BLUE,2);arrow(b,a,BLUE,2);text(*xy,label,25,BLUE)
def card(y,h,title):
 d.rounded_rectangle((45,y,2355,y+h),18,fill='white',outline='#D5E0E5',width=2);text(80,y+25,title,32,BLUE)
text(55,30,'平台定义｜从下跳穿 · 从上落脚',48)
text(58,105,'单向平台是独立碰撞类型：承托脚底，不用实心砖或半砖碰撞。二维玩法，三维薄板表现。',29)
card(175,620,'01  单格与线框透视｜顶面高度决定落脚，不由薄板底面决定')
u=280;ox=160;oy=660
for y in (0,1):line((ox,oy-y*u),(ox+u,oy-y*u),GRAY)
for x in (0,1):line((ox+x*u,oy),(ox+x*u,oy-u),GRAY)
d.rectangle((ox,oy-u,ox+u,oy-u+.08*u),fill='#DEB879',outline=ORANGE,width=2)
line((ox,oy-u),(ox+u,oy-u),GREEN,5)
dim((ox,oy+35),(ox+u,oy+35),'宽1格',(235,710))
text(135,285,'正视：逻辑格1×1',27)
text(485,367,'绿色顶面 Y=j+1',25,GREEN)
text(485,415,'薄板向下长 t',25,ORANGE)
text(485,470,'格内下方留空',25)
text(135,755,'视觉厚度t=0.08为草案，非碰撞体厚度。',24,ORANGE)
# Single perspective camera for both full-cell cage and thin slab.
def p(x,y,z):
 k=8/(8+z)
 return (1340+(x-1.5)*320*k,720-(y+.1)*320*k)
verts=[(x,y,z) for x in (0,1) for y in (0,1) for z in (-.5,.5)]
for a in verts:
 for b in verts:
  if a<b and sum(a[k]!=b[k] for k in range(3))==1:dash(p(*a),p(*b))
for z in (-.5,.5):
 v=[p(x,y,z) for x,y in ((0,.92),(1,.92),(1,1),(0,1))]
 d.line(v+[v[0]],fill=ORANGE,width=3)
for x in (0,1):
 for y in (.92,1):line(p(x,y,-.5),p(x,y,.5),ORANGE,3)
line(p(0,1,-.5),p(1,1,-.5),GREEN,5)
text(800,285,'灰虚线：1×1×1参照包围框',26)
text(1260,350,'平台外观：宽1 × 厚t × 深1',28)
text(1260,405,'顶面在逻辑格上边界；厚度向下',27)
text(1260,460,'Z=[−0.5,+0.5]，不吃内外预留区',27)
text(1260,515,'前后深1按真实比例投影，不夸大',27)
text(1260,590,'本图：t=0.08（沿用房屋示意）',27,ORANGE)
text(1260,640,'现行渲染：薄板高0.25，尚未同步',27,ORANGE)
text(1260,705,'背景墙可在外延区独立连续铺设',27,GREEN)
card(835,550,'02  三种行为｜看脚底从哪边跨过平台顶面')
# Collision rectangles are schematic poses, not distorted character art.
for idx,(title,note) in enumerate((('A 上升：从下穿过','身体和头部穿过平台，不顶头。'),('B 下降：脚底落在顶面','脚底从顶面上方跨过时才接住。'),('C 主动下穿','按下方向键，下穿期间忽略平台。'))):
 x=100+idx*750; top=1090
 text(x,930,title,29)
 line((x+20,top),(x+610,top),GREEN,5)
 d.rectangle((x+20,top,x+610,top+12),fill='#DEB879')
 bx=x+275
 if idx==0:
  d.rectangle((bx,top-90,bx+55,top+105),outline=BLUE,width=3);arrow((bx+105,top+140),(bx+105,top-140))
 elif idx==1:
  d.rectangle((bx,top-130,bx+55,top),outline=BLUE,width=3);arrow((bx+105,top-140),(bx+105,top-15));line((bx,top),(bx+55,top),ORANGE,6)
 else:
  d.rectangle((bx,top-75,bx+55,top+120),outline=BLUE,width=3);arrow((bx+105,top-130),(bx+105,top+145))
 text(x,1280,note,25)
text(95,1335,'蓝框表示身体位置，非人物美术；平台底面和侧面不阻挡移动，周围实心砖仍然阻挡。',25)
card(1425,555,'03  连续拼接与两层通口｜两个1格平台可拼成2格宽落脚面')
ox,oy,u=120,1880,62
q=lambda x,y:(ox+x*u,oy-y*u)
for x in range(7):line(q(x,0),q(x,6),GRAY,1)
for y in range(7):line(q(0,y),q(6,y),GRAY,1)
for x in (0,1,4,5):d.rectangle((*q(x,6),*q(x+1,5)),fill='#8DA3B1',outline=INK)
for top in (2,4,6):
 for x in (2,3):d.rectangle((*q(x,top),*q(x+1,top-.08)),fill='#DE9F48',outline=ORANGE,width=2)
 arrow(q(3,top-1.8),q(3,top-.2),ORANGE,3)
dim(q(2,5.45),q(4,5.45),'2格宽',(515,1525))
# A 2.8-high body may overlap the next platform without head collision.
d.rectangle((*q(2.5,4.8),*q(3.3,2)),outline=BLUE,width=3)
text(590,1560,'同高拼接：顶面齐平；拼接缝不留落脚断点。',27)
text(590,1618,'两端接整砖：平台顶面与楼面齐平，通口内不叠实心砖。',27)
text(590,1676,'平台顶高2、4、6：每段升高2格；顶层平台齐二层地面。',27)
text(590,1734,'人物碰撞高2.8 > 平台间距2：头部穿过上层平台是预期行为。',27,BLUE)
text(590,1792,'绿色顶面只在脚底下落跨越时承托，不拿“头碰到平台”落脚。',27,GREEN)
text(590,1850,'主角外观仍高3.1、3.3头身；本图蓝框按0.8×2.8碰撞尺寸。',27)
text(590,1908,'平台间距2是此房屋方案；不是已验证的跳跃极限。',27,ORANGE)
card(2020,285,'04  支持分级｜先定义直平台，不扩成所有变体')
text(95,2100,'1 必须做：水平单格、同高连续拼接、上穿落脚、主动下穿、与楼板通口连接。',28)
text(95,2160,'2 选做：外露端帽、支架与材质变化（不改变碰撞）。安装支撑和材料成本待定。',28)
text(95,2220,'3 不重要：斜平台、移动平台、翻转平台、破碎平台；有明确玩法后再单独定义。',28)
text(55,2340,'资料定义 · 原型已有单向碰撞；新尺寸与两层布局未作为本次游戏功能实现。',26,'#687B88')
assert 0<.08<1 and 2.8>2 and 4-2==2
for z in (-.5,.5):assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
im.save(ROOT/'public/concepts/platform-definition.png')
print('Platform sheet generated; dimensional checks passed.')
