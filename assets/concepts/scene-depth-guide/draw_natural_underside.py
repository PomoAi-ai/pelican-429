"""Tile-underside plants, seen from below so interior attachment points remain visible."""
import math
from PIL import Image, ImageDraw, ImageFont
from draw_natural_states import OUT, FONT, INK, BLUE, EDGES, FACES, cube, dot
from natural_depth_raster import render_faces

ROOTS = [(x, -1., z) for z in (-.23, .23) for x in (.22, .5, .78)]
STEM = '#71854E'
a, e = map(math.radians, (25, -22))
R = (math.cos(a), 0, math.sin(a))
U = (-math.sin(a)*math.sin(e), math.cos(e), math.cos(a)*math.sin(e))
F = (-math.sin(a)*math.cos(e), -math.sin(e), math.cos(a)*math.cos(e))


def box(x, y, z, w, h, d, color):
    vertices = cube(x, y, z, w, h, d)
    return [([vertices[i] for i in ids], color) for ids in FACES]


def branch(points, color=STEM, width=.012):
    faces = []
    for p, q in zip(points, points[1:]):
        faces.append(([(p[0]-width,p[1],p[2]), (p[0]+width,p[1],p[2]),
                       (q[0]+width,q[1],q[2]), (q[0]-width,q[1],q[2])], color))
    return faces


def model(kind):
    faces = []
    length = {'roots': .9, 'vine': 1.5, 'flower': 1.13}[kind]
    for i, (x, y, z) in enumerate(ROOTS):
        faces += box(x-.025, -1.012, z-.025, .05, .012, .05, '#72906A')
        actual = length * (1, .72, .88, .62, .82, .95)[i]
        points = [(x+.024*math.sin(j*.7+i)*j/12, y-actual*j/12,
                   z+.035*math.sin(j*.45)*j/12) for j in range(13)]
        faces += branch(points)
        for j in range(2, 12, 2):
            px, py, pz = points[j]
            sign = 1 if (i+j//2)%2 else -1
            if kind == 'roots':
                faces += branch([(px,py,pz),(px+sign*.06,py-.09,pz-.02)], '#71854E', .006)
            else:
                tip = (px+sign*.095,py-.10,pz-.045)
                faces.append(([(px,py,pz),(px+sign*.085,py-.022,pz+.026),tip,
                               (px+sign*.025,py-.095,pz-.047)], '#7B9C64'))
        if kind == 'flower':
            px, py, pz = points[-1]
            ring = [(px+.065*math.cos(k*math.pi/3),py-.12,pz+.065*math.sin(k*math.pi/3)) for k in range(6)]
            for k in range(6):
                faces.append(([(px,py,pz),ring[k],ring[(k+1)%6]], '#D99FA0' if k%2 else '#C48C91'))
            faces.append((ring, '#DAAF83'))
    return faces


def trimmed(faces, length):
    low = -1-length
    result = []
    for vertices, color in faces:
        if color != STEM:
            if min(v[1] for v in vertices) >= low:
                result.append((vertices, color))
            continue
        clipped = []
        for p, q in zip(vertices, vertices[1:]+vertices[:1]):
            if p[1] >= low:
                clipped.append(p)
            if (p[1]>=low) != (q[1]>=low):
                t=(low-p[1])/(q[1]-p[1])
                clipped.append(tuple(p[i]+t*(q[i]-p[i]) for i in range(3)))
        if len(clipped)>=3:
            result.append((clipped,color))
    return result


def render(name, title, entries, layout=False):
    im = Image.new('RGB', (2400, 2280), '#F5F3EC')
    draw = ImageDraw.Draw(im)
    def text(x,y,value,size=28,color=INK):
        font=ImageFont.truetype(FONT,size)
        assert draw.textbbox((x,y),value,font=font)[2] < 2385, value
        draw.text((x,y),value,font=font,fill=color)
    text(42,30,title,44)
    text(42,102,'仰视透视 · 宿主完整1×1×2格 · 根在底面内部Y=−1 · 前棱Z=+1 / 后棱Z=−1',29,BLUE)
    text(42,155,'与砖沿下垂分开定义：六个根点分布在底面内部两排，枝叶直接从底面向下长。',28)
    for index,(label,faces,note) in enumerate(entries):
        cx=30+(index%2)*1190;cy=220+(index//2)*950
        draw.rounded_rectangle((cx,cy,cx+1150,cy+920),18,fill='white',outline='#D3DFDF',width=2)
        text(cx+28,cy+26,label,35,BLUE)
        is_layout = layout and index==3
        center=(.5,-1.15,0);scale=195 if not is_layout else 275
        def p(v):
            d=tuple(v[i]-center[i] for i in range(3)); factor=scale*18/(18+dot(d,F))
            return cx+548+factor*dot(d,R),cy+443-factor*dot(d,U)
        p.depth=lambda v:18+dot(tuple(v[i]-center[i] for i in range(3)),F)
        host=box(0,-1,-1,1,1,2,'#DBD4C3')
        render_faces(im,host+faces,p)
        # The same full-height reserve in all growth stages makes missing lower growth readable.
        if not is_layout:
            vertices=cube(.06,-2.5,-.38,.88,1.5,.76)
            for j,k in EDGES:
                pa,pb=p(vertices[j]),p(vertices[k]);count=max(1,int(math.dist(pa,pb)/10))
                for m in range(0,count,2):
                    draw.line([tuple(pa[d]+(pb[d]-pa[d])*m/count for d in (0,1)),
                               tuple(pa[d]+(pb[d]-pa[d])*min(m+1,count)/count for d in (0,1))],fill='#C6D4D9',width=1)
        for root in ROOTS:
            px,py=p(root);draw.ellipse((px-4,py-4,px+4,py+4),fill='#D98D45')
        pa,pb=p((1.2,-1,-1)),p((1.2,0,-1))
        draw.line((pa,pb),fill=BLUE,width=3)
        text(pb[0]+10,(pa[1]+pb[1])/2,'宿主高1',22,BLUE)
        front=p((.5,-1,-1));back=p((.5,-1,1))
        text(front[0]-95,front[1]-44,'前棱 Z+1',21,BLUE)
        text(back[0]+12,back[1]-20,'后棱 Z−1',21,BLUE)
        if faces:
            vertices=[v for points,_ in faces for v in points]
            lo=[min(v[i] for v in vertices) for i in range(3)]
            hi=[max(v[i] for v in vertices) for i in range(3)]
            text(cx+28,cy+740,f'植株宽×高×深：{hi[0]-lo[0]:.3f} × {hi[1]-lo[1]:.3f} × {hi[2]-lo[2]:.3f}',27)
            text(cx+28,cy+782,f'底面Y=−1；最低Y={lo[1]:.3f}；Z=[{-hi[2]:+.3f}, {-lo[2]:+.3f}]',26)
        else:
            text(cx+28,cy+700,'橙点=根点；全部位于底面内部，不靠棱边',27)
            text(cx+28,cy+744,'X=0.22 / 0.50 / 0.78；Z=−0.23 / +0.23',26)
            text(cx+28,cy+785,'与左右棱至少0.22格、前后棱至少0.77格',26)
        text(cx+28,cy+842,note,26)
    text(42,2160,'适用：真实外露的砖底/悬岩底/洞顶；相邻砖内部接触面不可生长。支撑砖移除时附着物同时移除。',26)
    text(42,2210,'下方需留净空；不能与人物通道、下层实心块重叠。图为资料尺寸，不是游戏碰撞或攀爬定义。',26,BLUE)
    im.save(OUT/name)


if __name__=='__main__':
    mature=model('vine')
    states=[('01 底面萌芽',trimmed(mature,.15),'根点固定；短芽从底面直接朝下'),
            ('02 向下生长',trimmed(mature,.7),'在原上段基础上延长，不移动根点'),
            ('03 长垂成熟',mature,'最长下垂1.50格；前后两排错落展开'),
            ('04 修剪后',trimmed(mature,.45),'切口Y=−1.45；保留上段枝叶原位置')]
    for kind in ('roots','vine','flower'):
        faces=model(kind)
        for points,_ in faces:
            for x,y,z in points:
                assert 0 < x < 1 and -.5 < z < .5 and y <= -1+1e-9
        for root in ROOTS:
            assert any(color==STEM and all(math.isclose((points[0][axis]+points[1][axis])/2,root[axis]) for axis in range(3))
                       for points,color in faces), (kind,'disconnected root',root)
    for _,faces,_ in states:
        assert all((points,color) in mature for points,color in faces if color!='#71854E')
    assert math.isclose(min(v[1] for points,_ in states[-1][1] for v in points),-1.45)
    render('natural-underside-forms.png','格子底面向下生长｜三种形态与内部附着点',[
        ('A 底面苔须 / 根须',model('roots'),'多点短须从内部底面散落；最长0.90格'),
        ('B 底面悬垂藤叶',mature,'两排六支叶藤；叶片由枝条直接承接'),
        ('C 底面朝下垂花',model('flower'),'花冠朝下开；总下垂1.25格'),
        ('D 底面内部根点定位',[],'俯看边缘看不清根点，因此本页统一仰视')],layout=True)
    render('natural-underside-states.png','底面悬垂藤叶｜固定根点的四阶段透视',states)
    print('Underside forms and four states rendered; interior roots, contact, bounds and pruning checks passed.')
