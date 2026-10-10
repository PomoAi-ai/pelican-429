"""Background wall and rectangular window design, with grid and perspective views."""
from pathlib import Path
import math
import runpy
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'public/concepts'
BG='#F5F3EE'; BLUE='#326BB0'; GREEN='#54866B'; INK='#23394A'; ORANGE='#B76D32'; GRAY='#B6C6CE'
im=Image.new('RGB',(2400,2500),BG);d=ImageDraw.Draw(im)
def text(x,y,t,size=27,c=INK):
 f=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',size);b=d.textbbox((x,y),t,font=f)
 assert b[2]<2380 and b[3]<2490,(t,b)
 d.text((x,y),t,font=f,fill=c)
def panel(x,y,w,h):d.rounded_rectangle((x,y,x+w,y+h),16,fill='white',outline='#D5DFE5',width=2)
def line(a,b,c=BLUE,w=3):d.line((a,b),fill=c,width=w)
def loop(pts,c=BLUE):d.line(pts+pts[:1],fill=c,width=3)
def dash(a,b):
 n=math.dist(a,b)
 for i in range(0,math.ceil(n),14):line(tuple(a[k]+(b[k]-a[k])*i/n for k in (0,1)),tuple(a[k]+(b[k]-a[k])*min(i+7,n)/n for k in (0,1)),GRAY,2)
def rect(w=1,h=1,b=0):return [(b,b),(w-b,b),(w-b,h-b),(b,h-b)]
def dim(a,b,t,x,y):
 line(a,b,ORANGE,2);ang=math.atan2(b[1]-a[1],b[0]-a[0])
 for p,q in ((a,ang),(b,ang+math.pi)):
  for r in (-.45,.45):line(p,(p[0]+11*math.cos(q+r),p[1]+11*math.sin(q+r)),ORANGE,2)
 text(x,y,t,24,ORANGE)
def front(x,y,u,poly=None,w=1,h=1,hole=None):
 p=lambda a,b:(x+a*u,y-b*u)
 for i in range(w+1):dash(p(i,0),p(i,h))
 for i in range(h+1):dash(p(0,i),p(w,i))
 if poly:
  pts=[p(*v) for v in poly];d.polygon(pts,fill='#D7E5D8');loop(pts,GREEN)
 if hole:
  pts=[p(*v) for v in hole];d.polygon(pts,fill='white');loop(pts,GREEN)
  # Grid lines across the aperture are construction guides only, not window bars.
  for i in range(1,w):dash(p(i,hole[0][1]),p(i,hole[2][1]))
  for i in range(1,h):dash(p(hole[0][0],i),p(hole[2][0],i))
def perspective(x,y,u,poly,hole=None):
 # The same perspective camera projects both outer and inner boundaries.
 p=lambda a,b,z:(x+u*5*(a-1.7)/(5-z),y-u*5*(b-1.5)/(5-z))
 for shape in [poly]+([hole] if hole else []):
  for z in (.5,.7):loop([p(a,b,z) for a,b in shape],GREEN)
  for a,b in shape:line(p(a,b,.5),p(a,b,.7),GREEN,2)
 a,b=poly[1];dim(p(a+.16,b,.5),p(a+.16,b,.7),'厚 0.2',x-40,y+u*1.9)
 for z in (.5,.7):assert math.isclose(math.dist(p(0,0,z),p(1,0,z)),math.dist(p(0,0,z),p(0,1,z)))
 return p
BORDER=.1
assert 0<BORDER<.5 and math.isclose((1-2*BORDER)**2,.64)
text(55,30,'背景墙形态与窗口｜格子为基础，窗口按区域组合',44)
text(58,103,'固定规则：标准模块 1×1；墙厚 0.2，位于外延预留区。开窗是有意切除墙面，不是把整块墙缩小。',27,BLUE)
text(58,151,'本轮设计方案，尚未实现。窗框正面边宽 b=0.1 为可调草案；与 Z 厚度 0.2 分开。',27,ORANGE)
for idx,(code,name,note) in enumerate([
 ('W0','完整墙格','完整覆盖 1×1；不缩边。'),
 ('W1','镂空墙格','该格没有墙面，不是一块透明实心墙。'),
 ('W2','矩形窗区域','保留外框，内部贯穿挖空。')]):
 x,y=50+idx*785,225;panel(x,y,760,605)
 text(x+25,y+20,code+'  '+name,32,BLUE);text(x+25,y+69,'1 必须做 · 设计方案',24,ORANGE)
 text(x+35,y+120,'XY 方格正视',23);text(x+400,y+120,'线框透视',23)
 front(x+55,y+380,210,None if code=='W1' else rect(),hole=rect(b=BORDER) if code=='W2' else None)
 if code=='W1':
  text(x+420,y+225,'无墙体几何',27,GREEN);text(x+410,y+280,'保留 1×1 格位',25)
 else:perspective(x+705,y+85,150,rect(),rect(b=BORDER) if code=='W2' else None)
 dim((x+55,y+408),(x+265,y+408),'宽 1',x+115,y+425)
 dim((x+30,y+380),(x+30,y+170),'高 1',x+290,y+268)
 text(x+25,y+495,note,25)
 text(x+25,y+547,'净洞 0.8×0.8（随 b 调整）' if code=='W2' else '占格边界保持 1×1；深度规则不变。',25,GREEN)
panel(50,870,2300,780);text(80,895,'跨格窗口｜3×2 示例：只在整个窗口外周生成窗框',34,BLUE)
text(85,950,'3×2 是摆放示例，不要求所有窗口都这么大。虚线是格线，不是实体窗棂。',27)
front(190,1390,170,rect(3,2),3,2,rect(3,2,BORDER))
dim((190,1430),(700,1430),'宽 3 格',360,1450);dim((140,1390),(140,1050),'高 2 格',75,1170)
# This wider camera keeps the whole 3×2 example inside the right panel.
p=perspective(1380,1210,150,rect(3,2),rect(3,2,BORDER))
text(1680,1080,'外框 b=0.1（草案）',27,ORANGE)
text(1680,1150,'净洞：2.8×1.8',28,GREEN)
text(1680,1220,'共占 6 个墙格',28)
text(1680,1290,'内部相邻边不生成框',26)
text(1680,1360,'厚度仍为 0.2',28,GREEN)
text(85,1520,'单格窗和跨格窗使用同一条规则：外边界留框，内部连通。不能把六个带框小窗当作一个大窗。',27)
text(85,1580,'四边、四角由窗口区域自动推导；不要求玩家分别制作八种窗框砖。',27,BLUE)
text(60,1690,'2 选做｜四向半墙：仍占一个逻辑格，只填指定半边；厚度都为 0.2',31,BLUE)
halves=[('W3 上半墙',[(0,.5),(1,.5),(1,1),(0,1)]),('W4 下半墙',[(0,0),(1,0),(1,.5),(0,.5)]),('W5 左半墙',[(0,0),(.5,0),(.5,1),(0,1)]),('W6 右半墙',[(.5,0),(1,0),(1,1),(.5,1)])]
for i,(name,poly) in enumerate(halves):
 x,y=50+i*590,1750;panel(x,y,565,450);text(x+20,y+20,name,30,BLUE);text(x+20,y+68,'2 选做 · 非基础必做',24,ORANGE)
 front(x+35,y+300,130,poly)
 perspective(x+505,y+100,100,poly)
 text(x+25,y+350,'虚线 1×1；实体只占半格。',24)
 text(x+25,y+396,'正视轮廓 / 同比例透视',23,GREEN)
panel(50,2250,2300,175)
text(80,2272,'3 不重要：圆窗、拱窗、不规则破损。先保留方向，不扩充旋转图谱、不进入当前实现。',28)
text(80,2330,'玻璃与窗棂属于选做表现层；窗口是背景开口，不自动成为门、通道或角色碰撞缺口。',27,ORANGE)
text(60,2450,'窗口按完整区域定义；玻璃、窗框不能重复叠在未挖空的墙面上。墙在外延区的固定偏移仍沿用深度文档的未定项。',24)
# The ring is four disjoint bands, leaving a genuinely empty inner opening.
for w,h in [(1,1),(3,2)]:
 band_area=2*w*BORDER+2*(h-2*BORDER)*BORDER
 assert math.isclose(band_area+(w-2*BORDER)*(h-2*BORDER),w*h)
runpy.run_path(str(Path(__file__).with_name('draw_wall_window_variants.py')))
with Image.open(OUT/'wall-window-variants.png') as variants:
 combined=Image.new('RGB',(2400,im.height+variants.height),BG)
 combined.paste(im,(0,0));combined.paste(variants,(0,im.height))
 combined.save(OUT/'wall-window-shapes.png')
print('Created wall-window-shapes.png (2400×5800); window-area and perspective assertions passed.')
