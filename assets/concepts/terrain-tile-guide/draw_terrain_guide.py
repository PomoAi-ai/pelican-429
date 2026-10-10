"""Draw concept diagrams from exported game cells; no generated art or model renders."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / 'public/concepts'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
INK = '#193D4B'
MUTED = '#59717A'
LINE = '#CFDEE1'
GREEN = '#62B395'
DIRT = '#C6B795'
STONE = '#8EA1A8'
BLUE = '#66BCDF'
PURPLE = '#8A71BD'

def font(size):
    return ImageFont.truetype(FONT, size)

def txt(d, xy, text, size=30, fill=INK):
    d.text(xy, text, font=font(size), fill=fill)

def box(d, rect, fill='#F6FAFA', outline=LINE):
    d.rounded_rectangle(rect, radius=18, fill=fill, outline=outline, width=2)

def arrow(d, a, b, fill=INK, width=3):
    import math
    d.line([a, b], fill=fill, width=width)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    d.polygon([b, (b[0]-13*math.cos(angle-.45), b[1]-13*math.sin(angle-.45)),
               (b[0]-13*math.cos(angle+.45), b[1]-13*math.sin(angle+.45))], fill=fill)

def cell(d, x, y, s, shape=0, fill=GREEN, outline=INK):
    if shape == 0:
        pts = [(x,y),(x+s,y),(x+s,y+s),(x,y+s)]
    elif shape == 1:
        pts = [(x,y+s),(x+s,y),(x+s,y+s)]
    elif shape == 2:
        pts = [(x,y),(x+s,y+s),(x,y+s)]
    else:
        pts = [(x,y+s/2),(x+s,y+s/2),(x+s,y+s),(x,y+s)]
    d.polygon(pts, fill=fill)
    d.line(pts+[pts[0]], fill=outline, width=2)

def grid(d, x, y, cols, rows, s):
    for i in range(cols+1):
        d.line((x+i*s,y,x+i*s,y+rows*s),fill=LINE,width=1)
    for i in range(rows+1):
        d.line((x,y+i*s,x+cols*s,y+i*s),fill=LINE,width=1)

def title(d, name, subtitle):
    txt(d,(65,45),name,56)
    txt(d,(68,120),subtitle,29,MUTED)

def basics():
    im = Image.new('RGB',(2200,1920),'white')
    d = ImageDraw.Draw(im)
    title(d,'地形瓦片｜基础形状与拼接','逻辑说明图 · 世界坐标 x 向右、y 向上 · 同一行内所有方格等大 · 不代表游戏材质')
    txt(d,(70,190),'01  实心地形：4 种形状，统一占用一个 1 × 1 格',36)
    defs = [('整砖 FULL',0,'实心尺寸 1 × 1 格','顶面高度 = 1'),
            ('左低右高 R',1,'左低右高，45°','顶面高度 = 格内 x'),
            ('左高右低 L',2,'左高右低，45°','顶面高度 = 1 − 格内 x'),
            ('下半砖 HALF',3,'实心尺寸 1 × 0.5 格','上半格为空；没有上半砖形状')]
    for i,(name,shape,note,detail) in enumerate(defs):
        x=70+i*530
        box(d,(x,250,x+500,670))
        txt(d,(x+24,271),name,34)
        bx,by,s=x+120,342,180
        grid(d,bx,by,1,1,s)
        cell(d,bx,by,s,shape)
        arrow(d,(bx,by+210),(bx+s,by+210))
        txt(d,(bx+48,by+223),'1 格',27)
        txt(d,(x+24,591),note,29)
        txt(d,(x+24,632),detail,23,MUTED)
    txt(d,(70,702),'02  独立类别：平台与背景墙，不是新增实心形状',36)
    box(d,(70,765,1090,1000))
    box(d,(1120,765,2140,1000))
    txt(d,(95,787),'单向平台 / 树冠平台',34)
    grid(d,115,854,3,1,75)
    d.line((115,854,340,854),fill=PURPLE,width=9)
    arrow(d,(228,920),(228,834),PURPLE)
    txt(d,(383,850),'从下方可穿过，上表面可站立',29)
    txt(d,(383,897),'厚度仅为标识；不等于实心半砖',27,MUTED)
    txt(d,(1145,787),'背景墙',34)
    grid(d,1165,854,3,1,75)
    for j in range(3):
        d.rectangle((1165+j*75+5,859,1165+(j+1)*75-5,924),fill='#E3EDEF')
    arrow(d,(1175,892),(1376,892),BLUE)
    txt(d,(1433,850),'位于角色后方，不阻挡运动',29)
    txt(d,(1433,897),'与可踩、可碰撞的地形层分开',27,MUTED)
    txt(d,(70,1040),'03  组合检查：高低衔接、半格步进、轮廓闭合',36)
    for i in range(3):
        box(d,(70+i*700,1103,740+i*700,1615))
    txt(d,(95,1128),'A  坡接平地',33)
    txt(d,(795,1128),'B  半格台阶',33)
    txt(d,(1495,1128),'C  外露边与洞口',33)
    s=74
    x,y=116,1210
    grid(d,x,y,7,3,s)
    for col in range(7):
        cell(d,x+col*s,y+2*s,s,0,DIRT)
    for col,shape,row in [(0,0,1),(1,1,1),(2,0,1),(3,0,1),(4,2,1),(5,0,1),(6,0,1)]:
        if col in (0,5,6):
            continue
        cell(d,x+col*s,y+row*s,s,shape)
        if row==0: cell(d,x+col*s,y+s,s,0,DIRT)
    txt(d,(95,1469),'上坡低端接低地，高端接高地；',27)
    txt(d,(95,1511),'下坡同理。左右坡不能互换。',27)
    txt(d,(95,1555),'每个坡格横向 1 格、纵向升降 1 格。',25,MUTED)
    x,y=816,1210
    grid(d,x,y,7,3,s)
    for col,h in enumerate([1,1.5,2,2.5,2,1.5,1]):
        for row in range(int(h)):
            cell(d,x+col*s,y+(2-row)*s,s,0,GREEN if row==int(h)-1 and h%1==0 else DIRT)
        if h%1: cell(d,x+col*s,y+(2-int(h))*s,s,3)
    txt(d,(795,1469),'整砖 + 下半砖，顶面每次变化 0.5 格。',27)
    txt(d,(795,1511),'台阶保留竖直高差；不要画成缓坡。',27)
    txt(d,(795,1555),'整格主体承托，半砖只负责顶部半格。',25,MUTED)
    x,y=1516,1210
    grid(d,x,y,7,3,s)
    for col in range(7): cell(d,x+col*s,y+2*s,s,0,DIRT)
    for col in range(2,7): cell(d,x+col*s,y,s,0,GREEN)
    cell(d,x+6*s,y+s,s,0,DIRT)
    d.line((x+2*s,y,x+2*s,y+s,x+6*s,y+s,x+6*s,y+2*s),fill='#D47651',width=6)
    txt(d,(1495,1469),'崖边、洞顶、洞底保留连续实体边界。',27)
    txt(d,(1495,1511),'橙线标出外露侧边与底面。',27)
    txt(d,(1495,1555),'洞顶用整砖承托；当前没有倒置坡砖。',25,MUTED)
    box(d,(70,1660,2140,1860),'#EDF6F4')
    txt(d,(98,1687),'资源制作清单',34)
    txt(d,(98,1738),'形状：整砖 / 下半砖 / 左右坡　　轮廓：顶面 / 外露左右侧 / 底面 / 转角 / 同材质连续衔接',29)
    txt(d,(98,1787),'材质与形状分开：草、土、石、沙等决定表面；FULL / HALF / R / L 决定碰撞轮廓。',29)
    txt(d,(70,1880),'依据 tile-shapes.ts、tile-types.ts；图中拼接为规则示意，下一张展示实际组合关卡数据。',23,MUTED)
    im.save(OUT/'terrain-tile-basics.png')

def compositions():
    data=json.loads((HERE/'terrain-composition-cells.json').read_text())
    assert len(data['compositions'])==8
    im=Image.new('RGB',(2200,3530),'white')
    d=ImageDraw.Draw(im)
    title(d,'地形瓦片｜8 类现有组合','真实关卡格子导出 · seed 429 · 草地材质 / 地表环境 · 组合说明图，不是材质效果图')
    txt(d,(70,170),'统一窗口：横向 24 格 × 纵向 20 格；每格 32 px。x = 0 为组合起点，y = 0 为基准地面。',29,MUTED)
    notes={
        'meadow':'连续平地；用于观察铺装与植被跨格衔接。',
        'mound':'左右坡连接高出 3 格的宽丘顶。',
        'gully':'两侧缓坡下探，沟底低于基准 3 格。',
        'terraces':'整砖与下半砖交替；顶面逐级相差 0.5 格。',
        'cleft':'两侧崖台高 +2 格，裂口底部低至 −3 格。',
        'cave':'左侧下坡入洞；顶部厚土与右侧土壁保留。',
        'roots':'树根落于 +2 格坡顶；紫色线为真实树平台。',
        'pond':'盆底低至 −2 格；蓝色区域为实际液体格。',
    }
    stats=[]
    for i,comp in enumerate(data['compositions']):
        cx=70+(i%2)*1070
        cy=240+(i//2)*790
        box(d,(cx,cy,cx+1030,cy+780),'#FAFCFC')
        txt(d,(cx+28,cy+20),f'{i+1:02d}  {comp["label"]}  /  {comp["id"]}',34)
        txt(d,(cx+28,cy+69),notes[comp['id']],27,MUTED)
        ox,oy,s=cx+135,cy+112,32
        def p(wx,wy): return (ox+(wx+2)*s,oy+(14-wy)*s)
        grid(d,ox,oy,24,20,s)
        # Tree outline provides context only; platform cells below are exported collision data.
        for tree in comp['trees']:
            tx=tree['x']-comp['left']+.5
            by=tree['baseY']-comp['groundY']
            ty=by+tree['trunkHeight']
            x1,y1=p(tx-tree['trunkRadius'],by)
            x2,y2=p(tx+tree['trunkRadius'],ty)
            d.rectangle((x1,y2,x2,y1),fill='#E5D6BC')
            x1,y1=p(tx-tree['canopyHalfWidth'],ty)
            x2,y2=p(tx+tree['canopyHalfWidth'],ty+tree['canopyHeight'])
            d.ellipse((x1,y2,x2,y1),fill='#E4F2DF',outline='#B7D6AF',width=2)
        for c in comp['cells']:
            x,y=p(c['x'],c['y']+1)
            if c['fluid']:
                assert c['id']==0
                d.rectangle((x,y,x+s,y+s),fill=BLUE,outline='#268EB9',width=1)
            if c['id']==6:
                d.line((x,y,x+s,y),fill=PURPLE,width=5)
            elif c['id']:
                fill={1:DIRT,2:STONE,4:GREEN}[c['id']]
                cell(d,x,y,s,c['shape'],fill,'#547567')
        # Dashed common elevation reference.
        yy=p(0,0)[1]
        for xx in range(int(ox),int(ox+24*s),15):
            d.line((xx,yy,min(xx+8,ox+24*s),yy),fill='#D87F48',width=2)
        for x in range(-2,23,2):
            px,_=p(x,0)
            txt(d,(px-12,oy+20*s+5),str(x),20,MUTED)
        for y in range(-6,15,2):
            _,py=p(0,y)
            txt(d,(ox-47,py-10),str(y),20,MUTED)
        txt(d,(cx+935,oy+20*s+4),'x',22,MUTED)
        txt(d,(ox-77,oy+16),'y',22,MUTED)
        stats.append({'id':comp['id'],'cells':len(comp['cells']),
                      'solid_cells':sum(c['id'] not in (0,6) for c in comp['cells']),
                      'platform_cells':sum(c['id']==6 for c in comp['cells']),
                      'fluid_cells':sum(c['fluid']>0 for c in comp['cells'])})
    yy=3435
    for x,color,label in [(70,GREEN,'草表层'),(340,DIRT,'土层'),(610,STONE,'石层'),(880,BLUE,'液体'),(1150,PURPLE,'单向平台')]:
        d.rectangle((x,yy,x+34,yy+28),fill=color)
        txt(d,(x+48,yy-2),label,28)
    txt(d,(1510,yy-2),'橙虚线 = 基准地面 y 0',27,MUTED)
    txt(d,(70,3490),'格子取自 createTerrainCompositionLevel；树干 / 树冠浅色轮廓仅辅助识别，不是额外实心瓦片。',24,MUTED)
    im.save(OUT/'terrain-combinations.png')
    (HERE/'drawing-checks.json').write_text(json.dumps({'canvas_basics':[2200,1920],'canvas_combinations':[2200,3530],
        'composition_cell_size_px':32,'bounds':data['bounds'],'source':'createTerrainCompositionLevel, seed 429, grass, surface',
        'compositions':stats},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    basics()
    compositions()
