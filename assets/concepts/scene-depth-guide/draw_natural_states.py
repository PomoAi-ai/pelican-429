"""Render independently defined resource states; same camera and scale within each sheet."""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'public/concepts'
INK, BLUE, GREEN, MUTED = '#28424B', '#376EA0', '#638965', '#A8B7BD'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
a, e = map(math.radians, (25, 18))
R = (math.cos(a), 0, math.sin(a))
U = (-math.sin(a)*math.sin(e), math.cos(e), math.cos(a)*math.sin(e))
F = (-math.sin(a)*math.cos(e), -math.sin(e), math.cos(a)*math.cos(e))
EDGES = ((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7))
FACES = ((0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2))
def dot(v,b): return sum(x*y for x,y in zip(v,b))
def cube(x,y,z,w,h,d):
    return [(x+dx*w,y+dy*h,z+dz*d) for dx,dy,dz in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]

def make_model(kind, state):
    w,h,d = (state[key] for key in ('w','h','d'))
    sid = state['id']; faces=[]
    def box(x,y,z,bw,bh,bd,color):
        vertices=cube(x,y,z,bw,bh,bd)
        faces.extend(([vertices[i] for i in ids],color) for ids in FACES)
    def ball(x,y,z,rx,ry,rz,color):
        def p(i,j):
            lat=-math.pi/2+i*math.pi/6; lon=j*math.pi/4
            return x+rx*math.cos(lat)*math.cos(lon),y+ry*math.sin(lat),z+rz*math.cos(lat)*math.sin(lon)
        for i in range(6):
            for j in range(8):faces.append(([p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)],color))
    def trunk(width,height,y=0):
        box(-width/2,y,-width/2,width,height,width,'#9B7855')
    if sid in ('removed','depleted'): return faces
    if kind=='grass':
        # The base covers the actual tile top; only the front leaves enter the reserve.
        faces.append(([(-.5,.012,-.3),(.5,.012,-.3),(.5,.012,.7),(-.5,.012,.7)],'#769757'))
        for row in range(8):
            for col in range(9):
                x=-.45+col*.1125;z=-.3+row/7*.96
                high=h*(1 if (row,col)==(3,4) else .55+((row*7+col*3)%8)*.06)
                tx=max(-.5,min(.5,x+(.045 if (row+col)%2 else -.045)))
                tz=-.7 if row==0 else max(-.3,min(.7,z+(.06 if col%2 else -.06)))
                color=('#698E51','#88A963','#789B59')[(row+col)%3]
                faces.append(([(x-.032,.012,z),(x+.032,.012,z),(tx,high,tz)],color))
                faces.append(([(x,.012,z-.018),(x,.012,min(.7,z+.018)),(tx,high,tz)],color))
    elif kind=='flower':
        for i,x in enumerate((-.25*w,0,.25*w)):
            high=h*(.86 if sid in ('mature','bud') else 1)*(.8 if i!=1 else 1)
            box(x-.01,0,-.01,.02,high,.02,GREEN)
            ball(x-w*.08,high*.44,0,w*.16,h*.055,d*.32,'#719666')
            if sid=='mature':
                for j in range(5):
                    angle=j*math.pi*2/5
                    ball(x+w*.08*math.cos(angle),high+h*.07*math.sin(angle),0,w*.065,h*.07,d*.20,'#DAA387')
                ball(x,high,-d*.12,w*.04,h*.035,d*.07,'#D8BA62')
            elif sid=='bud':ball(x,high,0,w*.06,h*.12,d*.14,'#B59197')
    elif kind=='shrub':
        for i in (-1,0,1):
            x=i*(w/2-.015) if sid=='cut' else i*w*.22
            z=i*(d/2-.015) if sid=='cut' else 0
            box(x-.015,0,z-.015,.03,h if sid=='cut' else h*.6,.03,'#917654')
        if sid!='cut':
            ball(0,h*.65,0,w/2,h*.35,d/2,'#7C9A68')
            if sid=='fruiting':
                for x,y in ((-.28*w,.69*h),(-.05*w,.85*h),(.21*w,.6*h),(.32*w,.78*h)):
                    surface=-d/2*math.sqrt(1-(x/(w/2))**2-((y-h*.65)/(h*.35))**2)
                    ball(x,y,max(-d*.44,surface-d*.01),w*.025,h*.033,d*.06,'#B96467')
    elif kind=='bonsai':
        box(-.35,0,-.35,.7,.45,.7,'#B58C6A')
        for z in (-.38,.32):box(-.38,.4,z,.76,.1,.06,'#C59D7F')
        for x in (-.38,.32):box(x,.4,-.32,.06,.1,.64,'#C59D7F')
        box(-.32,.44,-.32,.64,.01,.64,'#62533F')
        if sid!='empty':
            ph=h-.45
            trunk(.045,ph*.8,.45)
            foliage_w=min(w,.38 if sid=='seedling' else w)
            for x,y,rx,ry in ((-.18,.43,.31,.19),(.18,.66,.30,.17),(-.02,.84,.28,.16)):
                ball((x+.005)*foliage_w/.97,.45+y*ph,0,rx*foliage_w/.97,ry*ph,d*(.33 if sid=='seedling' else .5),'#73965F')
    elif kind=='tree':
        widths={'seedling':.06,'young':.12,'growing':.25,'mature':.4,'stump':.4,'sprout':.4}
        heights={'seedling':.35,'young':1.2,'growing':2.2,'mature':3.3,'stump':.3,'sprout':.3}
        trunk(widths[sid],heights[sid])
        if sid=='sprout':
            trunk(.055,.32,.3);ball(0,.64,0,w/2,.16,d/2,'#8EA669')
        elif sid!='stump':ball(0,h*.72,0,w/2,h*.28,d/2,'#79986A')
        if sid in ('stump','sprout'):
            box(-.17,.299,-.17,.34,.001,.34,'#D2B38A')
    elif kind=='ore':
        cells=[(0,0),(1,0),(2,0),(0,1),(1,1)] if sid=='intact' else [(0,0),(1,0),(0,1)]
        for x,y in cells:
            box(x-1.5,y,-.5,1,1,1,'#A0A39E')
            partial=sid=='partial' and (x,y)==(1,0)
            for j in range(1 if partial else 3):
                px=x-1.5+.2+j*.26;py=y+.25+((j+x)%3)*.18
                faces.append(([(px-.08,py,-.501),(px,py+.12,-.501),(px+.08,py,-.501),(px,py-.07,-.501)],'#68ADAD'))
            if partial:
                for px,py in ((-.25,.3),(-.05,.5),(.25,.6)):
                    faces.append(([(px,py,-.502),(px+.04,py+.18,-.502),(px+.02,py+.17,-.502)],'#6A625A'))
    if kind=='flower' and faces:
        faces=[([(x,y,(d/2)*(1-y/h)-abs(z)*(y/h)) for x,y,z in vertices],color) for vertices,color in faces]
        vertices=[v for points,_ in faces for v in points]
        lo=[min(v[i] for v in vertices) for i in range(3)]
        hi=[max(v[i] for v in vertices) for i in range(3)]
        faces=[([((x-lo[0])*w/(hi[0]-lo[0])-w/2,y*h/hi[1],(z-lo[2])*d/(hi[2]-lo[2])-d/2) for x,y,z in points],color) for points,color in faces]
    return faces


def render_sheet(item):
    kind=item['kind']; states=item['states']; rw,rh,rd=item['reserve']
    rows=math.ceil(len(states)/2); height=210+rows*790+115
    image=Image.new('RGB',(2400,height),'#F5F3EC'); draw=ImageDraw.Draw(image)
    def text(x,y,value,size=26,color=INK):
        font=ImageFont.truetype(FONT,size)
        b=draw.textbbox((x,y),value,font=font)
        assert b[2]<2385 and b[3]<height-6,(kind,value,b)
        draw.text((x,y),value,font=font,fill=color)
    def paragraph(x,y,value,width=1050,size=25):
        font=ImageFont.truetype(FONT,size);line=''
        for char in value:
            if draw.textlength(line+char,font=font)>width:
                text(x,y,line,size);y+=38;line=char
            else:line+=char
        if line:text(x,y,line,size)
    def line(a,b,color=MUTED,width=2):draw.line((a,b),fill=color,width=width)
    def dash(a,b,color=MUTED):
        n=max(1,math.ceil(math.dist(a,b)/10))
        for i in range(0,n,2):
            line(tuple(a[j]+(b[j]-a[j])*i/n for j in (0,1)),tuple(a[j]+(b[j]-a[j])*min(i+1,n)/n for j in (0,1)),color,1)
    def box_lines(vertices,p,color,dashed=False):
        for j,k in EDGES:
            if dashed:dash(p(vertices[j]),p(vertices[k]),color)
            else:line(p(vertices[j]),p(vertices[k]),color,2)
    scale=min(340/rh,350/rw,350/max(rd,1))
    text(40,28,item['title']+'｜逐状态透视与尺寸定义',44)
    text(40,98,'同页镜头、比例、基线完全相同 · 单位：格 · 橙线为当前高度 · 灰虚线为成熟/初始区域',27,BLUE)
    text(40,145,'新增尺寸与状态均为绘图草案；彩色为实体，蓝色为同镜头线框。空框不产生实体或碰撞。',26)
    for index,state in enumerate(states):
        cx=30+(index%2)*1190;cy=210+(index//2)*790
        draw.rounded_rectangle((cx,cy,cx+1150,cy+765),18,fill='white',outline='#D3DFDF',width=2)
        text(cx+25,cy+20,f'{index+1:02d}  '+state['label'],34,BLUE)
        w,h,d=(state[key] for key in ('w','h','d'))
        text(cx+25,cy+75,f'当前包络：宽 {w:g} × 高 {h:g} × 深 {d:g}',27)
        text(cx+25,cy+118,('盆底Y=0；土面上株高 '+f'{max(h-.45,0):g}'+'；盆高0.5') if kind=='bonsai' and state['id']!='empty' else (f'顶部Y={h:g}；整格顶面1×1；含前叶深1.4' if kind=='grass' and h else f'顶部Y={h:g}；Z后沿−0.5；前沿={-.5-d:g}' if kind=='flower' and h else (f'顶部Y={h:g}；Z中心{item["zc"]:+g}；成熟/原区域 {rw:g}×{rh:g}×{rd:g}' if h else f'无实体；灰框仅作原区域对照 {rw:g}×{rh:g}×{rd:g}')),24)
        zc=item['mount_z']-d/2 if 'mount_z' in item else item['zc']
        zshift=zc-item['zc']
        faces=make_model(kind,state)
        if kind=='ore' and faces:
            rock=[v for vertices,color in faces if color=='#A0A39E' for v in vertices]
            extents=[max(v[i] for v in rock)-min(v[i] for v in rock) for i in range(3)]
            assert all(math.isclose(actual,expected) for actual,expected in zip(extents,(w,h,d))),(state['id'],extents)
        if kind!='ore' and faces:
            points=[v for vertices,_ in faces for v in vertices]
            assert math.isclose(max(v[1] for v in points),h),(kind,state['id'],'top height')
            for axis,expected in ((0,w),(2,d)):
                assert math.isclose(max(v[axis] for v in points)-min(v[axis] for v in points),expected),(kind,state['id'],'extent',axis)
            for vertices,_ in faces:
                for x,y,z in vertices:
                    assert abs(x)<=w/2+.003 and -.001<=y<=h+.003 and abs(z)<=d/2+.003,(kind,state['id'],x,y,z)
        faces=[([(x,y,z+zshift) for x,y,z in vertices],color) for vertices,color in faces]
        for wire,ox in ((False,cx+290),(True,cx+840)):
            def p(v):
                v=(v[0],v[1]-rh/2,v[2]); factor=scale*20/(20+dot(v,F))
                return ox+factor*dot(v,R),cy+405-factor*dot(v,U)
            support=cube(-rw/2,-.12,-.5-item['zc'],rw,.12,1)
            if not wire:
                for ids in FACES:
                    xy=[p(support[j]) for j in ids];draw.polygon(xy,fill='#E4DED0');draw.line(xy+[xy[0]],fill='#C4BCAA',width=1)
            else:box_lines(support,p,'#C9C1B1')
            for i in range(1,math.ceil(rw)):
                x=-rw/2+i
                line(p((x,0,-.5-item['zc'])),p((x,0,.5-item['zc'])),'#C3CDC4',1)
            box_lines(cube(-rw/2,0,-rd/2,rw,rh,rd),p,'#D6DEDF',True)
            if kind=='ore':
                for x,y in ((0,0),(1,0),(2,0),(0,1),(1,1)):
                    box_lines(cube(x-1.5,y,-.5,1,1,1),p,'#D0D9DB',True)
            for vertices,color in sorted(faces,key=lambda f:sum(dot(v,F) for v in f[0])/len(f[0]),reverse=True):
                xy=[p(v) for v in vertices]
                if not wire:
                    draw.polygon(xy,fill=color);draw.line(xy+[xy[0]],fill='#617663',width=1)
                else:draw.line(xy+[xy[0]],fill=BLUE,width=1)
            if kind=='ore' and state['id']=='partial':
                px,py=p((0,.35,-.505));text(px-24,py,'50%',18,'#9C5D32')
            if kind!='ore' and h>0:box_lines(cube(-w/2,0,-d/2+zshift,w,h,d),p,'#80A2B7',True)
            if h>0:
                xx=rw/2+.18
                line(p((xx,0,-rd/2)),p((xx,h,-rd/2)),'#B27B4A',3)
                for yy in (0,h):line(p((xx-.05,yy,-rd/2)),p((xx+.05,yy,-rd/2)),'#B27B4A',2)
            if not faces:text(ox-80,cy+390,'无剩余实体',25,'#8D989C')
            text(ox-75,cy+174,'实体透视' if not wire else '同镜头线框',22,BLUE)
            unit=.5 if rw<=1 else 1
            line((ox-scale*unit/2,cy+623),(ox+scale*unit/2,cy+623),BLUE,3)
            text(ox-42,cy+638,f'{unit:g}格标尺',20,BLUE)
        paragraph(cx+25,cy+690,state['detail'],1080,23)
    if len(states)%2:
        cx=1220;cy=210+(rows-1)*790
        draw.rounded_rectangle((cx,cy,cx+1150,cy+765),18,fill='#EAF0EA',outline='#CBD8CF',width=2)
        text(cx+35,cy+35,'独立定义与读图规则',35,GREEN)
        yy=cy+115
        for note in item['notes']:
            paragraph(cx+35,yy,note,1050,26);yy+=135
    text(40,height-88,'锚点：'+item['anchor'],25)
    text(40,height-44,'定义文档：natural-'+kind+'-definitions.md  ·  包络、支撑、碰撞、采集范围分开定义，未接入游戏。',24,BLUE)
    image.save(OUT/f'natural-{kind}-states.png')
    return height

if __name__=='__main__':
    for b in (R,U,F):assert math.isclose(dot(b,b),1)
    assert abs(dot(R,U))<1e-10 and abs(dot(R,F))<1e-10
    data=json.loads((HERE/'natural-resource-states.json').read_text())
    for item in data:
        height=render_sheet(item)
        print(f'{item["kind"]}: {len(item["states"])} states, 2400×{height}; geometry checks passed')
