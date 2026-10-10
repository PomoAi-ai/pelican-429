"""All currently defined wall profiles in one finite, priority-marked catalog."""
from pathlib import Path
import math
import runpy
from PIL import Image,ImageDraw,ImageFont

parts=runpy.run_path(str(Path(__file__).with_name('draw_wall_window_variants.py')))
im=Image.new('RGB',(2600,2650),'#F5F3EE');d=ImageDraw.Draw(im)
BLUE,GREEN,ORANGE='#326BB0','#528269','#B66C2F'
def text(x,y,s,size=24,color='#263C49'):
    f=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',size)
    box=d.textbbox((x,y),s,font=f)
    assert box[0]>=0 and box[2]<2580 and box[3]<2640,(s,box)
    d.text((x,y),s,font=f,fill=color)
def loop(points,color,width=2):d.line(points+points[:1],fill=color,width=width)
def ring(w,h):
    r=parts['rect'];b=.1
    return [r(0,0,w,b),r(0,h-b,w,h),r(0,b,b,h-b),r(w-b,b,w,h-b)]
r=parts['rect']
entries=[
 ('W0 整墙',1,[r(0,0,1,1)],1,1,'完整1×1；不缩边'),
 ('W1 镂空',1,[],1,1,'无墙体；保留格位'),
 ('W2 单格窗',1,ring(1,1),1,1,'1×1占格；净洞0.8×0.8'),
 ('W2 四块大窗',1,parts['assembled'],2,2,'2×2；内部不封格界'),
 ('W2 跨格长窗',1,ring(3,2),3,2,'3×2示例；同一外框规则'),
]
for label,code,_,_ in parts['orientations']:
    entries.append(('W2-'+code+' '+label,1,[parts['local'][code]],1,1,'两边留框，两边敞开'))
entries.append(('四块斜角大窗',1,parts['solid'],2,2,'W8四块组成2×2'))
for label,code,cx,cy in parts['orientations']:
    polys=[[(x-cx,y-cy) for x,y in p] for p in parts['cell_parts'](parts['solid'],cx,cy)]
    entries.append(('W8-'+code+' '+label,1,polys,1,1,'三角墙片 + 斜窗框'))
entries.append(('玻璃 + 十字窗棂',2,ring(2,2)+[r(.96,.1,1.04,1.9),r(.1,.96,1.9,1.04)],2,2,'可选外观；不由格界强制生成'))
for i,(name,poly) in enumerate(parts['triangles']):
    entries.append(('W7-'+str(i+1)+' '+name,1,[poly],1,1,'45°；实心面积0.5'))
entries.append(('玻璃薄层',2,[r(.1,.1,.9,.9)],1,1,'在0.2包络内；厚度待定'))
for name,poly in [('W3 上半墙',r(0,.5,1,1)),('W4 下半墙',r(0,0,1,.5)),
                  ('W5 左半墙',r(0,0,.5,1)),('W6 右半墙',r(.5,0,1,1))]:
    entries.append((name,2,[poly],1,1,'只占半格；墙深仍0.2'))
entries.append(('十字窗棂',2,[r(.46,0,.54,1),r(0,.46,1,.54)],1,1,'宽0.08仅示意；与窗框分开'))
assert len(entries)==25

text(60,35,'图2 · 全形态集合｜全部已定义形态、方向与组合示例',40,BLUE)
text(60,100,'每卡左为方格正视、右为深度线框；浅灰线是格界。墙类均深0.2；玻璃/窗棂仅示意外观包络。',27)
text(60,150,'1 必须做：整墙、开口、矩形与斜角窗、四向斜墙。2 选做：四向半墙、玻璃、窗棂。3 参考见最下方。',26,ORANGE)
for i,(name,level,polys,w,h,note) in enumerate(entries):
    x=45+(i%5)*505;y=220+(i//5)*335
    d.rounded_rectangle((x,y,x+485,y+315),12,fill='white',outline='#D7E0E4',width=2)
    text(x+18,y+15,name,26,BLUE)
    text(x+18,y+54,'1 必须做' if level==1 else '2 选做',23,ORANGE)
    u=min(120,180/w,130/h)
    p=lambda a,b:(x+25+a*u,y+240-b*u)
    for a in range(w+1):d.line((p(a,0),p(a,h)),fill='#CED8DC',width=2)
    for b in range(h+1):d.line((p(0,b),p(w,b)),fill='#CED8DC',width=2)
    if name=='玻璃 + 十字窗棂':d.polygon([p(*v) for v in r(.1,.1,1.9,1.9)],fill='#D7EEF6')
    for poly in polys:
        pts=[p(*v) for v in poly]
        d.polygon(pts,fill='#C9B4D9' if name.startswith(('W3','W4','W5','W6')) else '#CCE3E7' if '玻璃' in name else '#D4DEC9')
        loop(pts,GREEN)
    u=min(90,160/w,120/h)
    q=lambda a,b,z:(x+280+u*6*((a-w-1)/(6-z)+(w+1)/5.3),y+240-u*6*((b-h-1)/(6-z)+(h+1)/5.3))
    for poly in polys:
        for z in (.5,.7):loop([q(a,b,z) for a,b in poly],GREEN)
        for a,b in poly:d.line((q(a,b,.5),q(a,b,.7)),fill=GREEN,width=2)
    if not polys:text(x+280,y+160,'没有几何',23,GREEN)
    text(x+18,y+270,note,22)

text(60,1940,'3 不重要｜仅保留轮廓方向；不自动成为必做，不穷举任意曲线与破损组合',33,BLUE)
# These are explicit reference silhouettes, not dimensioned new construction forms.
for i,name in enumerate(['圆窗','拱窗','不规则破损']):
    x=45+i*845;y=2020
    d.rounded_rectangle((x,y,x+820,y+420),14,fill='white',outline='#D7E0E4',width=2)
    text(x+25,y+20,name+' · 3 不重要',30,ORANGE)
    box=(x+35,y+90,x+305,y+360)
    d.rectangle(box,fill='#D8E5D8',outline=GREEN,width=3)
    if i==0:
        d.ellipse((x+75,y+130,x+265,y+320),fill='white',outline=GREEN,width=3)
    elif i==1:
        shape=[(x+75,y+320),(x+75,y+215)]
        shape += [(x+170+95*math.cos(t),y+215-95*math.sin(t)) for t in [math.pi-j*math.pi/32 for j in range(33)]]
        shape += [(x+265,y+320)]
        d.polygon(shape,fill='white');loop(shape,GREEN,3)
    else:
        shape=[(x+55,y+290),(x+110,y+255),(x+90,y+200),(x+170,y+145),(x+210,y+190),(x+270,y+225),(x+245,y+325),(x+160,y+300)]
        d.polygon(shape,fill='white');loop(shape,GREEN,3)
    text(x+350,y+150,'只有造型参考',28)
    text(x+350,y+205,'尺寸、分块与制作规则未定',25)
    text(x+350,y+265,'不列入当前实现验收',25)
text(60,2490,'“全部”指当前资料库已有的形态方向、已定义组合与低优先级参考，不意味着数学上无限的窗宽、窗高、曲线都能逐一穷举。',27)
text(60,2550,'矩形窗按W×H扩展；2×2、3×2是规则示例。半墙改变XY占用，绝不是把Z深度从0.2改成0.1。',27,ORANGE)
text(60,2610,'资料完成不等于游戏已实现。b=0.1、c=0.5及窗棂宽0.08仍是草案；玻璃厚度未定。',25)
im.save(Path(__file__).resolve().parents[3]/'public/concepts/wall-window-catalog.png')
print('Created wall-window-catalog.png (2600×2650).')
