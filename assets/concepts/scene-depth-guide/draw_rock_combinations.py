"""Draw rock/soil combinations directly from the perspective scene's tile definitions."""
from pathlib import Path
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
source = """
import { ROCK_TERRAIN_SCENES } from './src/config/rock-terrain.ts';
import { TILE_SHAPE_DEFINITIONS } from './src/config/definition-kit.ts';
console.log(JSON.stringify({scenes:ROCK_TERRAIN_SCENES,shapes:TILE_SHAPE_DEFINITIONS}));
"""
data = json.loads(subprocess.run(['node', '--input-type=module', '-e', source], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
shapes = {s['id']: s['points'] for s in data['shapes']}
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

text(45,35,'泥土、岩层与矿物｜三种组合的透视与占格',46)
text(45,105,'同一层地形：每格只保留一份实体；深1，Z=[−0.5,+0.5]。图与透视演示共用格子数据。',27,BLUE)
notes=[
    ['上部与两侧泥土包住岩层；正面按地形剖面读图。','岩格替代对应土格，不是在同一格内再塞一块石头。'],
    ['岛顶Y=7；最低岩尖Y=2.5，向下延伸4.5；下方保留空气。','倒坡与倒尖顶保持上沿相接；这些岩块仍属于岛体，不是掉落物。'],
    ['20个宿主岩格中5格含矿、15格围岩；其上另铺5格泥土。','金色只标矿物属性；正面薄露头最多0.03，不新增第二份实体。'],
]
for index,scene in enumerate(data['scenes']):
    y=180+index*750
    draw.rounded_rectangle((35,y,2365,y+715),16,fill='white',outline='#d4dddf',width=2)
    text(65,y+22,f"{index+1:02d}  {scene['title']}",35,BLUE)
    text(1510,y+28,'XY正视占格 · 空处不填实',27,BLUE)
    cells=scene['cells'];coords={(c['x'],c['y']) for c in cells}
    assert len(coords)==len(cells),'two materials cannot occupy one tile'
    verts=[(c['x']+px,c['y']+py) for c in cells for px,py in shapes[c['shape']]]
    x0=min(v[0] for v in verts);x1=max(v[0] for v in verts);y0=min(v[1] for v in verts);y1=max(v[1] for v in verts)
    p=camera(700,y+315,min(92,900/(x1-x0),340/(y1-y0)),((x0+x1)/2,(y0+y1)/2,0))
    for c in sorted(cells,key=lambda c:c['x']):
        poly=[(c['x']+px,c['y']+py) for px,py in shapes[c['shape']]]
        back=[(x,yy,.5) for x,yy in poly];front=[(x,yy,-.5) for x,yy in poly]
        col=SOIL if c['material']=='dirt' else ROCK
        outline(p,back,GRAY,1,True)
        for aa,bb in zip(front,back):line(p(aa),p(bb),GRAY,1)
        outline(p,front,col,3)
        if c['ore']:
            assert c['material']=='stone'
            x,yy=c['x'],c['y']
            ore=[(x+.15,yy+.26,-.53),(x+.8,yy+.65,-.53),(x+.87,yy+.52,-.53),(x+.25,yy+.17,-.53)]
            outline(p,ore,ORE,4)
    ore_cells={(c['x'],c['y']) for c in cells if c['ore']}
    for x,yy in ore_cells:
        for dx,dy in ((1,0),(0,1)):
            if (x+dx,yy+dy) in ore_cells:
                line(p((x+.5,yy+.42,-.53)),p((x+dx+.5,yy+dy+.42,-.53)),ORE,3)
    # Equal XY units preserve half-tiles and inverted slopes, independent of perspective scaling.
    u=min(68,720/(x1-x0));gx=1510;gy=y+520
    q=lambda x,yy:(gx+(x-x0)*u,gy-(yy-math.floor(y0))*u)
    for yy in range(math.floor(y0),math.ceil(y1)+1):
        line(q(x0,yy),q(x1,yy),GRAY,1,True)
        text(gx-50,q(x0,yy)[1]-10,str(yy),20,BLUE)
    for x in range(int(x0),int(x1)+1):
        line(q(x,math.floor(y0)),q(x,math.ceil(y1)),GRAY,1,True)
        text(q(x,math.floor(y0))[0]-7,gy+12,str(x),20,BLUE)
    for c in cells:
        col=SOIL if c['material']=='dirt' else ROCK
        poly=[q(c['x']+px,c['y']+py) for px,py in shapes[c['shape']]]
        draw.polygon(poly,fill='#f3e8d8' if c['material']=='dirt' else '#e7eef1')
        draw.line(poly+[poly[0]],fill=col,width=2)
        if c['shape']=='A':text(*q(c['x']+.22,c['y']+.68),'矿' if c['ore'] else '土' if c['material']=='dirt' else '岩',22,ORE if c['ore'] else col)
    counts={m:sum(c['material']==m for c in cells) for m in ('dirt','stone')}
    text(85,y+585,notes[index][0],27)
    text(85,y+635,notes[index][1],26)
    text(1500,y+595,f"土 {counts['dirt']} 格 / 岩 {counts['stone']} 格 / 含矿 {sum(c['ore'] for c in cells)} 格",25,BLUE)
    text(1500,y+640,f'实际包络 {x1-x0:g} × {y1-y0:g} × 1 格',25,BLUE)
    assert all(0<=v<=1 for c in cells for point in shapes[c['shape']] for v in point)
    print(scene['id'],len(cells),'cells',counts,'bounds',(x0,y0,x1,y1))
text(45,2455,'棕线=泥土，蓝灰线=岩石，金线=矿物示意。连接关系不等于已实现采矿、坍塌或资源掉落。',27,BLUE)
out=ROOT/'public/concepts/natural-rock-combinations-wireframe.png'
im.save(out)
print(out)
