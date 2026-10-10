"""Local diagram definitions. Unanswered dimensions stay symbolic or show both options."""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/concepts'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#23394A'; BLUE='#326BB0'; ORANGE='#B96F36'; MUTED='#657684'; LINE='#CBD9DF'; FILL='#DCE8EF'
def page(title,sub,height=1500):
    im=Image.new('RGB',(2400,height),'#F5F3EE');d=ImageDraw.Draw(im)
    txt(d,60,35,title,48);txt(d,62,105,sub,27,MUTED)
    return im,d
def txt(d,x,y,t,size=28,c=INK):
    f=ImageFont.truetype(FONT,size);b=d.textbbox((x,y),t,font=f)
    assert b[2]<2380 and b[3]<d._image.height-8,(t,b)
    d.text((x,y),t,font=f,fill=c)
def panel(d,b):d.rounded_rectangle(b,18,fill='white',outline=LINE,width=2)
def arrow(d,a,b,c=BLUE):
    d.line([a,b],fill=c,width=3);ang=math.atan2(b[1]-a[1],b[0]-a[0])
    d.polygon([b,(b[0]-13*math.cos(ang-.4),b[1]-13*math.sin(ang-.4)),(b[0]-13*math.cos(ang+.4),b[1]-13*math.sin(ang+.4))],fill=c)
def dim(d,a,b,t,xy,c=BLUE):arrow(d,a,b,c);arrow(d,b,a,c);txt(d,*xy,t,27,c)
def dash(d,a,b,c=MUTED):
    n=math.dist(a,b)
    for v in range(0,round(n),16):d.line([tuple(a[i]+(b[i]-a[i])*v/n for i in range(2)),tuple(a[i]+(b[i]-a[i])*min(v+8,n)/n for i in range(2))],fill=c,width=2)
def grid(d,x,y,w,h,s):
    for i in range(w+1):d.line((x+i*s,y,x+i*s,y+h*s),fill=LINE,width=1)
    for j in range(h+1):d.line((x,y+j*s,x+w*s,y+j*s),fill=LINE,width=1)
def save(im,name):im.save(OUT/name)
# The depth reference has its own perspective drawing and ruler.
import runpy
runpy.run_path(str(Path(__file__).with_name('draw_depth_reference.py')))
# 04: room boundary diagram, no guess about furniture or final door clearance.
im,d=page('04 房子｜单间的结构、背景与入口','延续当前房间外轮廓总高7格：底板1 + 室内5 + 顶板1；室内宽6为示例，不作为统一房型。')
panel(d,(50,175,1510,1320));panel(d,(1540,175,2350,1320))
s=130;ox=250;oy=300
for x in range(8):
    for r in range(7):
        solid=r in (0,6) or x==7 or (x==0 and r<2)
        b=(ox+x*s,oy+r*s,ox+(x+1)*s,oy+(r+1)*s)
        d.rectangle(b,fill='#BACBD7' if solid else '#F1F6F5',outline=LINE,width=2)
# The entrance reserve is a dashed column; rim and threshold details are deferred to diagram 05.
dash(d,(ox+s/2,oy+3*s),(ox+s/2,oy+6*s),ORANGE)
d.line((ox+7,oy+3*s,ox+7,oy+6*s),fill=BLUE,width=10)
txt(d,ox+10,oy+4*s,'入口',24,ORANGE)
d.rectangle((ox,oy+2*s,ox+s,oy+3*s),outline=ORANGE,width=2)
d.rectangle((ox,oy+3*s-15,ox+s/2,oy+3*s),fill=BLUE)
txt(d,ox+8,oy+2*s+30,'门沿区',23,ORANGE)
# Room walls are independent of solid front cells.
for x in range(1,7):
    for r in range(1,6):d.rectangle((ox+x*s+7,oy+r*s+7,ox+(x+1)*s-7,oy+(r+1)*s-7),outline='#A9C7BA',width=2)
# Original art remains unmodified except crop and scaling.
art=Image.open(ROOT/'assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/right-v1.png').convert('RGB').crop((224,34,758,1408))
h=round(3.1*s);art=art.resize((round(h*art.width/art.height),h),Image.Resampling.LANCZOS);im.paste(art,(80,oy+6*s-h))
# Furniture placement regions; their collision policy remains separate.
for bx,bw,bh,label,col in ((1,3,1,'床 3×1','#CEDFEA'),(4,3,2,'桌 3×2','#E8D7BD')):
    b=(ox+bx*s+5,oy+(6-bh)*s+5,ox+(bx+bw)*s-5,oy+6*s-5)
    d.rectangle(b,fill=col,outline=ORANGE,width=2)
    for k in range(1,bw):d.line((ox+(bx+k)*s,b[1],ox+(bx+k)*s,b[3]),fill=LINE,width=1)
    if bh==2:d.line((b[0],oy+5*s,b[2],oy+5*s),fill=LINE,width=1)
    txt(d,b[0]+28,b[1]+25,label+' 草案',27)
dim(d,(ox+8*s+45,oy),(ox+8*s+45,oy+7*s),'总高7',(1305,715))
txt(d,90,1250,'一格宽高相等；前面敞开观察，墙体深度位置以最新深度图为准。',27)
txt(d,1580,220,'四类东西分开',34,BLUE)
for yy,title,desc in ((320,'实体边界','地板、屋顶、封闭侧墙会阻挡。'),(440,'背景墙','在外延预留区，厚0.2。'),(560,'门与门沿','门占左半格或右半格；上方是门沿。'),(680,'家具 / 设施','按宽×高占格，另外定义支撑与碰撞。')):
    txt(d,1580,yy,title,29,BLUE);txt(d,1580,yy+50,desc,25)
txt(d,1580,840,'门洞净高3格，薄门沿放在其上方。',26,ORANGE)
txt(d,1580,886,'门沿区仅表示安装范围，不填成整块砖。',24,ORANGE)
txt(d,1580,966,'房体实体深度统一1格。',27)
txt(d,1580,1014,'床3×1、桌3×2为草案；通行碰撞另定。',24)
txt(d,1580,1090,'主角：3.3头身，外观高3.1格。',25)
txt(d,1580,1135,'碰撞高2.8格；门口还需核对发梢净空。',24)
txt(d,60,1400,'本图定义房间组成与格子边界；不把示意门、家具、背景墙自动视为游戏已实现的建造规则。',26,MUTED)
save(im,'building-house.png')
# 05: the upper cell belongs to the door assembly; the inner X half stays empty.
im,d=page('05 门｜门上沿高1格，与门框一体','门洞净高3 + 上沿高1 = 组件总高4；左、右半格镜像安装，内侧半格留空。')
for i,left in enumerate((True,False)):
    xx=60+i*790;panel(d,(xx,180,xx+755,1250));txt(d,xx+30,220,'左半格安装' if left else '右半格安装',34,BLUE)
    a,bottom,sc=xx+100,1000,170
    grid(d,a,bottom-4*sc,1,4,sc)
    dash(d,(a+sc/2,bottom-3*sc),(a+sc/2,bottom),ORANGE)
    edge=a if left else a+sc
    # Upper lintel occupies exactly one grid row.
    stem=edge if left else edge-25
    d.rectangle((stem,bottom-3*sc,stem+25,bottom),fill=BLUE)
    rim0=a if left else a+sc/2
    d.rectangle((rim0,bottom-4*sc,rim0+sc/2,bottom-3*sc),fill=BLUE)
    dim(d,(a,bottom+45),(a+sc/2,bottom+45),'0.5',(a+25,bottom+65),ORANGE)
    dim(d,(a+sc/2,bottom+45),(a+sc,bottom+45),'0.5',(a+sc/2+25,bottom+65),ORANGE)
    txt(d,xx+415,405,'上沿高1格',25,BLUE)
    txt(d,xx+415,453,'与框一体',25)
    txt(d,xx+415,535,'组件总高4',25,ORANGE)
    txt(d,xx+35,1100,'内侧半格留空；半格不是一块实心门板。',25)
    txt(d,xx+35,1150,'门沿和门柱的实体尺寸不等于安装区尺寸。',24,MUTED)
panel(d,(1665,180,2350,1250));txt(d,1705,220,'净高固定，门沿在上方',30,BLUE)
txt(d,1705,325,'净洞高3，上方门沿高1格。',25)
txt(d,1705,370,'整体高度 = 3 + 1 = 4',27,BLUE)
txt(d,1705,450,'门沿不能向下侵占这3格净空。',25)
txt(d,1705,495,'门槛不能再压缩通行净高。',25,ORANGE)
txt(d,1705,595,'人物碰撞高2.8，外观高3.1。',25)
txt(d,1705,640,'发梢外观超出0.1，需单独协调。',25)
txt(d,1705,755,'安装在X左半格或右半格。',25)
txt(d,1705,800,'门洞横跨Z，角色沿X穿过。',25)
txt(d,1705,900,'上沿和门框作为同一个组件，',25,MUTED)
txt(d,1705,944,'再往上才补普通墙格。',25,MUTED)
txt(d,60,1350,'门上沿占上方一格高度，沿X占外侧半格，沿Z深1；普通墙格从Y=4开始。背景墙厚0.2另行定义。',25,MUTED)
save(im,'building-door.png')
# 06: approved dimensions are a draft, not an implemented collision contract.
im,d=page('06 建筑物与家具｜床3×1，桌3×2（草案）','已确认按宽×高表达：床占3格、桌占6格；深度、支撑、碰撞和交互另列，不混成一个“大小”。')
panel(d,(60,180,1160,1050));txt(d,90,220,'尺寸定义 · 先作为草案',32,BLUE)
for row,(name,w,h) in enumerate((('床',3,1),('桌',3,2))):
    yy=340+row*315;sc=120
    txt(d,95,yy-35,f'{name}：宽{w} × 高{h} = {w*h}格',29)
    grid(d,105,yy+20,w,h,sc)
    for x in range(w):
        for y in range(h):d.rectangle((109+x*sc,yy+24+y*sc,101+(x+1)*sc,yy+16+(y+1)*sc),fill=FILL)
    txt(d,525,yy+55,'沿X计算宽度',25)
    txt(d,525,yy+105,'沿Y计算高度',25)
    txt(d,525,yy+155,'不是沿Z的深度',25,ORANGE)
panel(d,(1190,180,2330,1050));txt(d,1220,220,'放进房间核对 · 示例内宽6、净高5',32,BLUE)
gx,gy,ss=1330,340,110
grid(d,gx,gy,6,5,ss)
for x,w,h,label,c in ((0,3,1,'床3×1','#CEDFEA'),(3,3,2,'桌3×2','#E8D7BD')):
    d.rectangle((gx+x*ss,gy+(5-h)*ss,gx+(x+w)*ss,gy+5*ss),fill=c,outline=ORANGE,width=2)
    for k in range(1,w):d.line((gx+(x+k)*ss,gy+(5-h)*ss,gx+(x+k)*ss,gy+5*ss),fill=LINE,width=1)
    if h==2:d.line((gx+x*ss,gy+4*ss,gx+(x+w)*ss,gy+4*ss),fill=LINE,width=1)
    txt(d,gx+x*ss+25,gy+(5-h)*ss+25,label,27)
txt(d,1230,960,'能摆下不等于能通行；是否可穿过需另定碰撞规则。',26,ORANGE)
panel(d,(60,1080,2330,1420));txt(d,90,1110,'每种家具至少记录以下字段',32,BLUE)
for x,title,desc in ((95,'放置占格','宽W × 高H；锚点、允许朝向。'),(830,'支撑要求','落地 / 挂墙 / 吊顶；需要几格支撑。'),(1620,'碰撞与交互','阻挡 / 可穿过；交互范围另记。')):
    txt(d,x,1185,title,29,BLUE);txt(d,x,1235,desc,25)
txt(d,90,1330,'外观轮廓、放置占格、碰撞范围、交互范围分别定义；床桌不是把整个占格区域填满的实体砖。',26)
txt(d,60,1450,'床3×1、桌3×2作为尺寸草案；家具Z深度不自动继承实体砖深1。正式数值还需配合人物姿态检查。',25,MUTED)
save(im,'building-furniture.png')
print('created depth / house / door / furniture diagrams')
