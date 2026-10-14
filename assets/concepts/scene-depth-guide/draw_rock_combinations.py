"""Draw rock/soil combinations directly from the perspective scene's tile definitions."""
from pathlib import Path
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
source = """
import { ROCK_TERRAIN_SCENES } from './src/config/rock-terrain.ts';
import { DEFINITION_DEPTH, TILE_SHAPE_DEFINITIONS } from './src/config/definition-kit.ts';
console.log(JSON.stringify({scenes:ROCK_TERRAIN_SCENES,tile:DEFINITION_DEPTH.tile,shapes:TILE_SHAPE_DEFINITIONS}));
"""
data = json.loads(subprocess.run(['node', '--input-type=module', '-e', source], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
shapes = {s['id']: s['points'] for s in data['shapes']}
# Soil and rock both fill the tile depth; neither protrudes into the front or back edge.
depths = {'dirt': data['tile'], 'stone': data['tile']}
half_tile = data['tile'] / 2
ore_front = -half_tile - .03
W,H=2400,2530
im=Image.new('RGB',(W,H),'#f6f4ee');draw=ImageDraw.Draw(im)
INK,BLUE,GRAY,SOIL,ROCK,ORE='#29414b','#376e9b','#bac6cd','#a47849','#536f82','#998047'
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
def text(x,y,s,size=26,color=INK):
    f=ImageFont.truetype(FONT,size);bounds=draw.textbbox((x,y),s,font=f)
    assert bounds[2]<W-20 and bounds[3]<H-10,(s,bounds)
    draw.text((x,y),s,font=f,fill=color)
def line(a,b,color=INK,width=2,dashed=False):
    if not dashed:draw.line([a,b],fill=color,width=width);return
    n=max(1,math.ceil(math.dist(a,b)/10))
    for i in range(0,n,2):
        draw.line([tuple(a[j]+(b[j]-a[j])*k/n for j in (0,1)) for k in (i,min(i+1,n))],fill=color,width=width)
a,e=map(math.radians,(25,18))
R=(math.cos(a),0,math.sin(a));U=(-math.sin(a)*math.sin(e),math.cos(e),math.cos(a)*math.sin(e));F=(-math.sin(a)*math.cos(e),-math.sin(e),math.cos(a)*math.cos(e))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def camera(cx,cy,scale,target):
    def project(v):
        v=[v[i]-target[i] for i in range(3)];k=scale*30/(30+dot(v,F))
        return cx+k*dot(v,R),cy-k*dot(v,U)
    return project

def outline(p,points,color,width=2,dashed=False):
    for a,b in zip(points,points[1:]+points[:1]):line(p(a),p(b),color,width,dashed)


def area(poly):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])))/2

def inside(poly,x,y):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])
        if abs(cross)<1e-9 and min(a[0],b[0])-1e-9<=x<=max(a[0],b[0])+1e-9 and min(a[1],b[1])-1e-9<=y<=max(a[1],b[1])+1e-9:
            return True
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            hit=not hit
    return hit

def points(layer):
    return layer['points'] if 'points' in layer else shapes[layer['shape']]

def verify_layers(cell):
    outer=shapes[cell['shape']];parts=[points(layer) for layer in cell['layers']]
    material_area=sum(area(poly)-sum(area(h) for h in layer.get('holes',[])) for layer,poly in zip(cell['layers'],parts))
    assert parts and abs(material_area-area(outer))<1e-9,'material pieces must cover the collision contour once'
    for layer,poly in zip(cell['layers'],parts):
        assert not layer['ore'] or layer['material']=='stone'
        assert all(inside(outer,x,y) for x,y in poly),'layer extends outside collision contour'
    # Offset samples avoid shared half-tile edges while checking coverage and overlap.
    for i in range(20):
        for j in range(20):
            x,y=(i+.37)/20,(j+.61)/20
            assert sum(inside(poly,x,y) and not any(inside(h,x,y) for h in layer.get('holes',[])) for layer,poly in zip(cell['layers'],parts))==int(inside(outer,x,y)),'layer overlap or collision-filled hole'

text(45,35,'泥土、岩层与矿物｜三种组合的透视与占格',46)
text(45,105,'同一层地形：土与岩同为格子深2，前后面齐平，不再外露。图与透视演示共用格子和深度数据。',27,BLUE)
notes=[
    ['12格泥土内部嵌入不规则岩体；岩的上下左右都保留泥土。','泥土扣出岩形空间，岩体贯穿土深；前后面与土面齐平。'],
    ['6格岩脊嵌进岛土，最高Y=6.58；岛底岩尖到Y=2.5。','岩体连续穿出泥土底面Y=6；下方留空气，仍与岛体相连。'],
    ['20个宿主岩格中5格含矿、15格围岩；其上另铺5格泥土。','金色只标矿物属性；矿皮露出岩面0.03，最前Z=+1.03。'],
]
for index,scene in enumerate(data['scenes']):
    y=180+index*750
    draw.rounded_rectangle((35,y,2365,y+715),16,fill='white',outline='#d4dddf',width=2)
    text(65,y+22,f"{index+1:02d}  {scene['title']}",35,BLUE)
    text(1510,y+28,'XY正视占格 · 空处不填实',27,BLUE)
    cells=scene['cells'];coords={(c['x'],c['y']) for c in cells}
    assert len(coords)==len(cells),'logical cells must be unique; materials belong in layers'
    layers=[dict(layer,x=c['x'],y=c['y']) for c in cells for layer in c['layers']]
    for c in cells:
        verify_layers(c)
    verts=[(c['x']+px,c['y']+py) for c in cells for px,py in shapes[c['shape']]]
    x0=min(v[0] for v in verts);x1=max(v[0] for v in verts);y0=min(v[1] for v in verts);y1=max(v[1] for v in verts)
    p=camera(700,y+315,min(92,900/(x1-x0),340/(y1-y0)),((x0+x1)/2,(y0+y1)/2,0))
    for c in sorted(layers,key=lambda c:c['x']):
        poly=[(c['x']+px,c['y']+py) for px,py in points(c)]
        half=depths[c['material']]/2
        back=[(x,yy,half) for x,yy in poly];front=[(x,yy,-half) for x,yy in poly]
        col=SOIL if c['material']=='dirt' else ROCK
        outline(p,back,GRAY,1,True)
        for aa,bb in zip(front,back):line(p(aa),p(bb),GRAY,1)
        outline(p,front,col,3)
        for hole in c.get('holes',[]):
            for z in (-half,half):outline(p,[(c['x']+px,c['y']+py,z) for px,py in hole],col,2,z>0)
        if c['ore']:
            assert c['material']=='stone'
            x,yy=c['x'],c['y']
            ore=[(x+.15,yy+.26,ore_front),(x+.8,yy+.65,ore_front),(x+.87,yy+.52,ore_front),(x+.25,yy+.17,ore_front)]
            outline(p,ore,ORE,4)
    ore_cells={(c['x'],c['y']) for c in layers if c['ore']}
    for x,yy in ore_cells:
        for dx,dy in ((1,0),(0,1)):
            if (x+dx,yy+dy) in ore_cells:
                line(p((x+.5,yy+.42,ore_front)),p((x+dx+.5,yy+dy+.42,ore_front)),ORE,3)
    # Equal XY units preserve half-tiles and inverted slopes, independent of perspective scaling.
    u=min(68,720/(x1-x0));gx=1510;gy=y+520
    q=lambda x,yy:(gx+(x-x0)*u,gy-(yy-math.floor(y0))*u)
    for yy in range(math.floor(y0),math.ceil(y1)+1):
        line(q(x0,yy),q(x1,yy),GRAY,1,True)
        text(gx-50,q(x0,yy)[1]-10,str(yy),20,BLUE)
    for x in range(int(x0),int(x1)+1):
        line(q(x,math.floor(y0)),q(x,math.ceil(y1)),GRAY,1,True)
        text(q(x,math.floor(y0))[0]-7,gy+12,str(x),20,BLUE)
    for c in layers:
        col=SOIL if c['material']=='dirt' else ROCK
        poly=[q(c['x']+px,c['y']+py) for px,py in points(c)]
        draw.polygon(poly,fill='#f3e8d8' if c['material']=='dirt' else '#e7eef1')
        draw.line(poly+[poly[0]],fill=col,width=2)
        label_y={'B':.4,'C':.92}.get(c['shape'],.68)
        if c.get('points'):label_y=.94 if c['material']=='dirt' else (min(v[1] for v in points(c))+max(v[1] for v in points(c)))/2+.16
        if c['shape'] in ('A','B','C') and not c.get('holes'):text(*q(c['x']+.22,c['y']+label_y),'矿' if c['ore'] else '土' if c['material']=='dirt' else '岩',20,ORE if c['ore'] else col)
    counts={m:sum(c['material']==m for c in layers) for m in ('dirt','stone')}
    text(85,y+585,notes[index][0],27)
    text(85,y+635,notes[index][1],26)
    text(1500,y+595,f"{len(cells)}逻辑格 · 土{counts['dirt']}片 / 岩{counts['stone']}片",25,BLUE)
    text(1500,y+640,f"实际包络 {x1-x0:g} × {y1-y0:g} × {depths['stone']:g} 格",25,BLUE)
    assert all(0<=v<=1 for c in cells for point in shapes[c['shape']] for v in point)
    print(scene['id'],len(cells),'cells',counts,'bounds',(x0,y0,x1,y1))
text(45,2455,'棕线=泥土，蓝灰线=岩石，金线=矿物示意。连接关系不等于已实现采矿、坍塌或资源掉落。',27,BLUE)
out=ROOT/'public/concepts/natural-rock-combinations-wireframe.png'
im.save(out)
print(out)

# A separate scale drawing shows soil and rock sharing the full tile depth.
W,H=2400,1530
im=Image.new('RGB',(W,H),'#f6f4ee');draw=ImageDraw.Draw(im)
text(45,35,'岩层深度｜泥土与岩层同为格子深2',43)
text(45,105,'已确认（2026-10-11）：泥土、岩层都占满格子Z=[−1,+1]；旧“岩深1.5、前后各露0.25”废止。',29,BLUE)
draw.rounded_rectangle((35,180,2365,790),16,fill='white',outline='#d4dddf',width=2)
text(65,205,'A  同一XY行：泥土 / 岩层 / 泥土的线框透视',32,BLUE)
p=camera(660,485,215,(1.5,.5,0))
for x,material in enumerate(('dirt','stone','dirt')):
    half=depths[material]/2; col=SOIL if material=='dirt' else ROCK
    poly=[(x,0),(x+1,0),(x+1,1),(x,1)]
    for z in (-half,half):outline(p,[(xx,yy,z) for xx,yy in poly],col,3,z>0)
    for xx,yy in poly:line(p((xx,yy,-half)),p((xx,yy,half)),col,2)
text(1200,335,'泥土：Z=[−1,+1]，深2',31,SOIL)
text(1200,400,'岩层：Z=[−1,+1]，深2',31,ROCK)
text(1200,465,'前后面与泥土齐平，不向前沿、后沿露出。',28)
text(1200,530,'突出的岩石用前沿突出岩或后沿大岩表现。',29)
text(1200,595,'一格可组合土岩材料；碰撞只计算组合轮廓。',27)
text(75,725,'适用于土中岩层、空岛底岩、含矿岩层，以及这些岩层的半砖、坡面和倒置形态。',28)
draw.rounded_rectangle((35,820,2365,1445),16,fill='white',outline='#d4dddf',width=2)
text(65,845,'B  等比例XZ俯视 · 岩格与两侧泥土同深',32,BLUE)
unit=150;ox=120;oy=930
q=lambda x,z:(ox+x*unit,oy+(z+1.5)*unit)
for z0,z1,col in ((-1.5,-half_tile,'#e9f0e5'),(-half_tile,half_tile,'#ecf0f3'),(half_tile,1.5,'#f4e9dc')):
    draw.rectangle((*q(0,z0),*q(3,z1)),fill=col)
for x,material in enumerate(('dirt','stone','dirt')):
    half=depths[material]/2
    draw.rectangle((*q(x,-half),*q(x+1,half)),fill='#eadbc8' if material=='dirt' else '#b7ccd7',outline=SOIL if material=='dirt' else ROCK,width=4)
    text(*q(x+.32,-.1),'土' if material=='dirt' else '岩',32,INK)
# The background wall sits on the back edge, flush against the tile.
draw.rectangle((*q(0,1),*q(3,1.2)),fill='#dde8e5',outline='#59846a',width=2)
for z in (-1.5,-1,1,1.5):
    line(q(0,z),q(3.4,z),GRAY,1,True)
    # Geometry keeps the camera at −Z internally; labels use the +Z-toward-camera convention.
    text(q(3.5,z)[0],q(3.5,z)[1]-13,f'{-z:+g}',24,BLUE)
text(1080,955,'前沿：+1～+1.5，格子之外，放突出岩、花草',30,ROCK)
text(1080,1020,'格子：−1～+1，泥土与岩层同深2',30,BLUE)
text(1080,1085,'后沿：−1.5～−1，墙Z=[−1.2,−1]、灌木、大岩',30,ROCK)
text(1080,1180,'总空间带Z=[−1.5,+1.5]，深3。',28)
text(1080,1240,'墙紧贴格子背面，与岩层零交集。',28)
text(1080,1300,'2D碰撞与采空仍按XY宿主格处理。',28)
text(45,1480,'棕色=泥土；蓝灰=岩石；绿=背景墙。矿皮相对岩面最多再凸0.03；独立平底散石尺寸另列。',25,BLUE)
out=ROOT/'public/concepts/natural-rock-depth-wireframe.png'
im.save(out)
print(out)

# Draw the actual embedded rock and its soil opening from the scene configuration.
mixed=next(c for scene in data['scenes'] for c in scene['cells'] if any(layer.get('holes') for layer in c['layers']))
rock=next(layer for layer in mixed['layers'] if layer['material']=='stone')
rock_poly=points(rock)
W,H=2400,1700
im=Image.new('RGB',(W,H),'#f6f4ee');draw=ImageDraw.Draw(im)
text(45,35,'泥土里面长岩石｜土包住岩，前后面齐平',46)
text(45,110,'泥土是连续基体；内部嵌入不规则岩体。上下左右保留土，土岩同深2，前后面齐平。',28,BLUE)
draw.rounded_rectangle((35,180,1175,1030),16,fill='white',outline='#d4dddf',width=2)
draw.rounded_rectangle((1205,180,2365,1030),16,fill='white',outline='#d4dddf',width=2)
text(65,205,'A  同源混合格 · 嵌入关系线框透视',33,BLUE)
p=camera(550,550,330,(.5,.5,0))
for layer in mixed['layers']:
    half=depths[layer['material']]/2
    col=SOIL if layer['material']=='dirt' else ROCK
    for poly in [points(layer)]+layer.get('holes',[]):
        for z in (half,-half):outline(p,[(x,y,z) for x,y in poly],col,3,z>0)
        for x,y in poly:line(p((x,y,-half)),p((x,y,half)),col,2,layer['material']=='dirt')
text(75,885,'棕线：周围泥土；蓝灰线：土内部的岩体。',28)
text(75,946,'岩体贯穿整个格子深2，前后面与土面齐平。',25)
text(1235,205,'B  XY正面 · 岩体四周都有泥土',32,BLUE)
u=485;ox=1520;oy=810
q=lambda x,y:(ox+x*u,oy-y*u)
for layer in mixed['layers']:
    col=SOIL if layer['material']=='dirt' else ROCK
    poly=[q(x,y) for x,y in points(layer)]
    draw.polygon(poly,fill='#eadbc8' if layer['material']=='dirt' else '#b7ccd7')
    draw.line(poly+[poly[0]],fill=col,width=4)
text(*q(.4,.57),'岩',42)
text(*q(.03,.96),'土',29)
text(1280,885,'土域中扣出真实岩形空间，再嵌入同轮廓岩体。',26)
text(1280,946,'一格包含两种材料，接触处没有重叠或空隙。',26)
draw.rounded_rectangle((35,1060,2365,1605),16,fill='white',outline='#d4dddf',width=2)
text(65,1085,'C  Y=0.5的XZ剖面 · 土岩同深与内部包覆',32,BLUE)
# Intersect the real convex rock polygon with the middle-height plane.
cuts=[]
for a,b in zip(rock_poly,rock_poly[1:]+rock_poly[:1]):
    if (a[1] <= .5 < b[1]) or (b[1] <= .5 < a[1]):
        cuts.append(a[0]+(.5-a[1])*(b[0]-a[0])/(b[1]-a[1]))
assert len(cuts)==2
lo,hi=sorted(cuts)
u=200;ox=245;oy=1160
q=lambda x,z:(ox+x*u,oy+(z+1)*u)
draw.rectangle((*q(0,-half_tile),*q(1,half_tile)),fill='#eadbc8',outline=SOIL,width=4)
draw.rectangle((*q(lo,-half_tile),*q(hi,half_tile)),fill='#b7ccd7',outline=ROCK,width=4)
for z in (-half_tile,half_tile):
    line(q(0,z),q(1.7,z),GRAY,1,True)
    text(q(1.8,z)[0],q(1.8,z)[1]-12,f'Z={-z:+g}',23,BLUE)
text(1000,1190,'泥土与岩体同深2：Z=[−1,+1]。',28)
text(1000,1250,'岩体前后面与土面齐平，四周仍由土包覆。',27)
text(1000,1320,'1个逻辑格 = 土基体 + 内嵌岩体 = 1份XY碰撞。',27)
text(1000,1390,'示例29个逻辑格：17个纯土格、12个土内含岩格。',27)
text(1000,1460,'共41片材料：29片土、12片岩；没有生长或采掘动画。',26)
text(45,1640,f"图与场景读取同一混合格（{mixed['x']},{mixed['y']}）；土洞与岩体轮廓吻合，空隙不填实。",26,BLUE)
out=ROOT/'public/concepts/natural-rock-stack-wireframe.png'
im.save(out)
print(out)

# Island underside: the upper rock ridge is buried in soil and connects to the exposed body below.
island=next(scene for scene in data['scenes'] if scene['id']=='rock-island')
W,H=2400,1500
im=Image.new('RGB',(W,H),'#f6f4ee');draw=ImageDraw.Draw(im)
text(45,35,'空岛下面的岩石｜上缘埋在土里，下部露出岛底',45)
text(45,110,'与土内嵌岩属于同一地形组合：岩体连着岛体，空岛下面保留空气。',29,BLUE)
draw.rounded_rectangle((35,180,1345,1160),16,fill='white',outline='#d4dddf',width=2)
draw.rounded_rectangle((1375,180,2365,1160),16,fill='white',outline='#d4dddf',width=2)
text(65,205,'A  空岛完整线框 · 土、岩同深2',33,BLUE)
p=camera(680,635,103,(6,4.75,0))
for c in island['cells']:
    for layer in c['layers']:
        poly=[(c['x']+x,c['y']+y) for x,y in points(layer)]
        half=depths[layer['material']]/2;col=SOIL if layer['material']=='dirt' else ROCK
        for z in (half,-half):outline(p,[(x,y,z) for x,y in poly],col,3,z>0)
        for x,y in poly:line(p((x,y,-half)),p((x,y,half)),GRAY,1)
text(85,1005,'棕色泥土包住上缘岩脊；蓝灰岩体连续向下收尖。',27)
text(85,1065,'岛顶Y=7，土底基准Y=6，最低岩尖Y=2.5。',27)
text(1405,205,'B  土岩连接放大 · XY剖面',32,BLUE)
u=330;ox=1530;oy=965
q=lambda x,y:(ox+(x-4)*u,oy-(y-5)*u)
for c in island['cells']:
    if c['x'] in (4,5) and c['y'] in (5,6):
        for layer in c['layers']:
            poly=[q(c['x']+x,c['y']+y) for x,y in points(layer)]
            col=SOIL if layer['material']=='dirt' else ROCK
            draw.polygon(poly,fill='#eadbc8' if layer['material']=='dirt' else '#b7ccd7')
            draw.line(poly+[poly[0]],fill=col,width=3)
for y in (5,6,6.58,7):
    line(q(4,y),q(6,y),GRAY,1,True)
    text(1405,q(4,y)[1]-13,f'{y:g}',24,BLUE)
text(*q(4.72,6.91),'泥土',31,SOIL)
text(*q(4.68,5.55),'岛底岩体',31,ROCK)
text(1430,1015,'岩脊进入土内0.12～0.58格；上方仍有土。',25)
text(1430,1070,'Y=6上下岩面接合，露出部分没有脱离岛体。',25)
draw.rounded_rectangle((35,1190,2365,1410),16,fill='white',outline='#d4dddf',width=2)
text(65,1220,'30个逻辑格：4个纯土格 + 6个土岩交界格 + 20个纯岩格。',31)
text(65,1280,'共36片材料：土10片、岩26片；每格只用实际组合轮廓登记一次碰撞。',29)
text(65,1340,'土与岩同深2，前后面齐平；岛底空气与倒尖顶下半空区保持为空。',28)
text(45,1450,'直接读取空岛透视场景配置；这是与岛体相连的底岩，未定义自由坠落或开采行为。',26,BLUE)
out=ROOT/'public/concepts/natural-rock-island-wireframe.png'
im.save(out)
print(out)
