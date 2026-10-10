"""Assembled wall modules on a one-cell-deep plinth, viewed from the inner side."""
from pathlib import Path
import math
import runpy
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
parts=runpy.run_path(str(Path(__file__).with_name('draw_wall_window_variants.py')))
im=Image.new('RGB',(2600,2250),'#F5F3EE');d=ImageDraw.Draw(im)
INK,BLUE,GREEN,ORANGE='#263C49','#326BB0','#528269','#B66C2F'
def text(x,y,s,size=28,color=INK):
    f=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',size)
    box=d.textbbox((x,y),s,font=f)
    assert box[0]>=0 and box[2]<2585 and box[3]<2240,(s,box)
    d.text((x,y),s,font=f,fill=color)
def line(a,b,color=BLUE,width=3):d.line((a,b),fill=color,width=width)
def panel(x,y,w,h):d.rounded_rectangle((x,y,x+w,y+h),16,fill='white',outline='#D7E0E4',width=2)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def unit(a):return tuple(x/math.sqrt(dot(a,a)) for x in a)
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
eye=(12,9,-14);forward=unit(sub((4,2,0),eye));right=unit((forward[2],0,-forward[0]));up=cross(forward,right)
def project(v):
    v=sub(v,eye);depth=dot(v,forward)
    assert depth>0
    return (1000+2000*dot(v,right)/depth,920-2000*dot(v,up)/depth)
assert math.isclose(dot(right,up),0,abs_tol=1e-12)
faces=[]
def face(vertices,color,edge='#617B75'):
    faces.append((sum(dot(sub(v,eye),forward) for v in vertices)/len(vertices),vertices,color,edge))
def prism(poly,z0,z1,front='#DCE8DB',side='#A5BCAF',edge='#617B75'):
    face([(x,y,z1) for x,y in poly],side,edge)
    for a,b in zip(poly,poly[1:]+poly[:1]):
        face([(*a,z0),(*b,z0),(*b,z1),(*a,z1)],side,edge)
    face([(x,y,z0) for x,y in poly],front,edge)
def shifted(poly,x,y):return [(a+x,b+y) for a,b in poly]
def label(point,x,y,s,color=BLUE):
    line(project(point),(x-15,y+18),color,2);text(x,y,s,29,color)
def dimension(a,b,s,x,y):
    a=project(a);b=project(b);line(a,b,ORANGE,3)
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    for p,q in ((a,angle),(b,angle+math.pi)):
        for t in (-.5,.5):line(p,(p[0]+12*math.cos(q+t),p[1]+12*math.sin(q+t)),ORANGE,2)
    text(x,y,s,26,ORANGE)

text(60,35,'图1 · 装配演示｜完整墙面、深度校对与同镜头透视线框',44)
text(60,110,'观察方向：从内沿一侧看向外延墙面。墙体、窗框深0.2；地台实体深1；内沿与外延各额外预留0.5。',28,BLUE)
text(60,160,'装配已加入：上下左右半墙（紫色）、整格镂空、单格窗、四块矩形窗、四块斜角窗及四向斜墙。',28)
panel(45,220,2510,1310)

# Reserve space stays empty; only reference outlines are drawn below.
corner_profiles={(0,0):parts['triangles'][3][1],(7,0):parts['triangles'][2][1],
                 (0,4):parts['triangles'][1][1],(7,4):parts['triangles'][0][1]}
half_profiles={(3,3):parts['rect'](0,.5,1,1),(3,1):parts['rect'](0,0,1,.5),
               (4,3):parts['rect'](0,0,.5,1),(4,1):parts['rect'](.5,0,1,1)}
count=0
for y in range(5):
    for x in range(8):
        if y in (2,3) and x in (1,2,5,6):continue
        if (x,y) in ((0,2),(7,2)):continue
        poly=half_profiles.get((x,y),corner_profiles.get((x,y),parts['rect'](0,0,1,1)))
        color='#C9B4D9' if (x,y) in half_profiles else '#C8DED1' if (x,y) in corner_profiles else '#E2E9DF'
        prism(shifted(poly,x,y),.5,.7,front=color)
        count+=1
for poly in [parts['rect'](0,0,1,.1),parts['rect'](0,.9,1,1),
             parts['rect'](0,.1,.1,.9),parts['rect'](.9,.1,1,.9)]:
    prism(shifted(poly,7,2),.5,.7,'#DCB17C','#AB835D',ORANGE)
for poly in parts['assembled']:prism(shifted(poly,1,2),.5,.7,'#DCB17C','#AB835D',ORANGE)
for i,poly in enumerate(parts['solid']):
    prism(shifted(poly,5,2),.5,.7,'#C8DED1' if i<4 else '#DCB17C','#AB9980',GREEN if i<4 else ORANGE)
# Illustrative glass stays inside the wall envelope; no full wall remains behind it.
face([(1.1,2.1,.6),(2.9,2.1,.6),(2.9,3.9,.6),(1.1,3.9,.6)],'#D7EEF6','#7BAAB9')
for poly in [parts['rect'](1.96,2.1,2.04,3.9),parts['rect'](1.1,2.96,2.9,3.04)]:
    prism(poly,.5,.65,'#527D8D','#456775','#456775')
for x in range(8):prism(parts['rect'](x,-1,x+1,0),-.5,.5,'#A0B7C8','#BCCDD7','#617C90')
for _,vertices,color,edge in sorted(faces,key=lambda item:item[0],reverse=True):
    pts=[project(v) for v in vertices]
    d.polygon(pts,fill=color);d.line(pts+pts[:1],fill=edge,width=2)
for name,point in [('W3',(3.4,3.8,.5)),('W4',(3.4,1.35,.5)),('W5',(4.15,3.5,.5)),('W6',(4.6,1.5,.5))]:
    x,y=project(point);text(x-10,y-10,name,21,'#673A7E')

text(125,295,'矩形窗：四个 L 形窗角',29,BLUE)
line(project((2,4,.5)),(525,405),BLUE,2)
text(125,345,'整体2×2；可选玻璃 + 十字窗棂',26)
label((6,4,.5),1410,300,'斜角窗：四个斜角模块')
text(1410,350,'整体2×2；c=0.5、b=0.1为草案',26)
label((.5,4.5,.5),120,520,'左上斜墙',GREEN)
label((7.5,4.5,.5),1920,525,'右上斜墙',GREEN)
label((.5,.5,.5),125,1040,'左下斜墙',GREEN)
label((7.5,.5,.5),1920,970,'右下斜墙',GREEN)
label((8,2.3,.6),1920,750,'墙厚 0.2',ORANGE)
text(1920,805,'墙与窗框前后齐平',26)
text(1920,850,'紫色W3～W6：四向半墙',26,'#673A7E')
dimension((8.35,-1,-.5),(8.35,-1,.5),'实体深 1',1630,1370)
label((4,-.5,-.5),780,1400,'实体地台：深1，不包含两侧预留')
text(100,1460,'左边缘中部是整格镂空，右边缘中部是单格窗；半墙刻意留空半格。逐项查阅请看图2“全形态集合”。',27)

panel(45,1570,2510,590)
text(85,1600,'深度校对｜同一单位方格，墙在外延内，不增加到2.2',34,BLUE)
# True YZ equal-scale reference: one unit is exactly 300 px on both axes.
x0,y0,u=260,2045,300
def grid(z,y):return (x0+(z+1)*u,y0-y*u)
for a,b,color in [(-1,-.5,'#E4EFE2'),(-.5,.5,'#D6E6F4'),(.5,1,'#F5E7D1')]:
    d.rectangle((*grid(a,1),*grid(b,0)),fill=color)
for i in range(21):line(grid(-1+i*.1,0),grid(-1+i*.1,1),'#C7D3DA',1)
for i in range(11):line(grid(-1,i*.1),grid(1,i*.1),'#C7D3DA',1)
d.rectangle((*grid(.5,1),*grid(.7,0)),fill='#AFCDBC',outline=GREEN,width=4)
for z in (-1,-.5,0,.5,1):text(grid(z,0)[0]-15,1700,str(z),23)
text(255,2070,'内沿0.5',25,GREEN);text(480,2070,'中间实体1',25,BLUE);text(745,2070,'外延0.5',25,ORANGE)
text(990,1760,'墙：宽高标准1×1，厚0.2',31,GREEN)
text(990,1825,'Z=[+0.5,+0.7]是本图示例位置，固定偏移仍未定。',28)
text(990,1890,'预留区用于花草、特殊物品，不默认生成实体地台。',28)
text(990,1955,'所有窗都贯穿墙深；四向半墙只改变XY，深度仍为0.2。',28)
text(990,2020,'下图小格0.1仅为标尺；整格墙从底到顶完整高1。',28)
text(60,2190,'资料装配图，尚未实现运行时建造；外角斜切是展示四向形态的造型方案，不是所有房屋必须采用的结构。',27)
assert count==30 and len(half_profiles)==4
assert all(math.isclose(parts['area'](poly),.5) for poly in half_profiles.values())
assert math.isclose(abs(grid(.5,0)[0]-grid(-.5,0)[0]),abs(grid(0,1)[1]-grid(0,0)[1]))
assert math.isclose(.7-.5,.2)
assembly_image=im.copy()
im=Image.new('RGB',(2600,1570),'#F5F3EE');d=ImageDraw.Draw(im)
text(60,35,'同一装配 · 透视线框｜镜头、形态和深度完全相同',44)
text(60,105,'浅灰为穿透显示的面边；绿色为墙前沿与窗框，蓝色为实体地台。此图用于核对前后关系，不做遮挡消隐。',28,BLUE)
text(60,160,'墙前后 Z=+0.5 / +0.7；实体前后 Z=−0.5 / +0.5；下方预留轮廓只是空间标尺，不是新增地板。',28)
for _,vertices,_,_ in faces:
    pts=[project(v) for v in vertices]
    d.line(pts+pts[:1],fill='#C0C9C9',width=2)
for _,vertices,_,_ in faces:
    if all(v[2]==.5 and v[1]>=0 for v in vertices):
        pts=[project(v) for v in vertices];d.line(pts+pts[:1],fill=GREEN,width=3)
    if all(v[1]<=0 for v in vertices):
        pts=[project(v) for v in vertices];d.line(pts+pts[:1],fill=BLUE,width=2)
for z0,z1,color in [(-1,-.5,GREEN),(.5,1,ORANGE)]:
    pts=[project(v) for v in [(0,0,z0),(8,0,z0),(8,0,z1),(0,0,z1)]]
    d.line(pts+pts[:1],fill=color,width=3)
label((1,3,.5),150,360,'四块 L 形窗角',GREEN)
label((6,4,.5),1550,350,'四块斜角窗',GREEN)
label((8,2.3,.6),1950,775,'墙与窗框深 0.2',ORANGE)
dimension((8.35,-1,-.5),(8.35,-1,.5),'实体深 1',1620,1360)
text(80,1490,'所有对象由同一三维相机投影；未对薄墙深度单独放大。格子拼接处的线是模块边界，不代表要生成重复内部面。',27)
im.save(ROOT/'public/concepts/wall-window-assembly-wireframe.png')
runpy.run_path(str(Path(__file__).with_name('draw_wall_complete_catalog.py')))
complete=Image.new('RGB',(2600,assembly_image.height+im.height),'#F5F3EE')
complete.paste(assembly_image,(0,0));complete.paste(im,(0,assembly_image.height))
complete.save(ROOT/'public/concepts/wall-window-assembly.png')
print('Created wall-window-assembly.png; common-camera, module-count and depth-scale checks passed.')
