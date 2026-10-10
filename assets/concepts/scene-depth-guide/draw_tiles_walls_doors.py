"""Measured front projection and orthographic component sections; Pillow only."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/concepts/tile-wall-door-depth.png'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
INK, MUTED, GRID = '#203B4E', '#627481', '#D9E2E5'
BLUE, GREEN, ORANGE = '#326BB0', '#559A7A', '#BE643D'
im = Image.new('RGB', (2400, 1900), '#F4F3EE')
d = ImageDraw.Draw(im)

def text(x, y, value, size=28, color=INK):
    font = ImageFont.truetype(FONT, size)
    bounds = d.textbbox((x, y), value, font=font)
    assert 20 <= bounds[0] and bounds[2] <= im.width-20 and bounds[3] < im.height, (value, bounds)
    d.text((x, y), value, font=font, fill=color)

def panel(rect):
    d.rounded_rectangle(rect, radius=18, fill='white', outline=GRID, width=2)

def arrow(a, b, color=BLUE, width=4):
    d.line((a, b), fill=color, width=width)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    d.polygon([b, (b[0]-14*math.cos(angle-.4), b[1]-14*math.sin(angle-.4)),
               (b[0]-14*math.cos(angle+.4), b[1]-14*math.sin(angle+.4))], fill=color)

def dash(a, b, color=ORANGE):
    length = math.dist(a, b)
    for start in range(0, round(length), 20):
        end = min(start+10, length)
        p = tuple(a[i]+(b[i]-a[i])*start/length for i in range(2))
        q = tuple(a[i]+(b[i]-a[i])*end/length for i in range(2))
        d.line((p, q), fill=color, width=3)

def dim(a, b, label, label_xy):
    d.line((a, b), fill=MUTED, width=2)
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = math.hypot(dx, dy)
    for p in (a, b):
        d.line((p[0]-dy/length*7, p[1]+dx/length*7,
                p[0]+dy/length*7, p[1]-dx/length*7), fill=MUTED, width=2)
    text(*label_xy, label, 25, MUTED)

# Pinhole projection matching the default camera orientation, cropped for annotation.
# The crop magnifies the entire image uniformly; it does not increase apparent Z depth.
UNIT, CAM_Y, DIST = 110, 2.8, 30
CX, CY = 1160, 356

def project(x, y, z):
    factor = DIST/(DIST-z)
    return (CX+UNIT*x*factor, CY-UNIT*(y-CAM_Y)*factor)

def face(points, color):
    pts = [project(*p) for p in points]
    d.polygon(pts, fill=color)
    d.line(pts+[pts[0]], fill=INK, width=2)

def box(x, y, w=1, h=1, back=-1, front=.5):
    if y+h < CAM_Y:
        face([(x,y+h,back),(x+w,y+h,back),(x+w,y+h,front),(x,y+h,front)], '#B3CC91')
    if x+w < 0:
        face([(x+w,y,back),(x+w,y+h,back),(x+w,y+h,front),(x+w,y,front)], '#AD9374')
    elif x > 0:
        face([(x,y,back),(x,y+h,back),(x,y+h,front),(x,y,front)], '#AD9374')
    face([(x,y,front),(x+w,y,front),(x+w,y+h,front),(x,y+h,front)], '#D5BD9B')

text(60, 32, '横版空间｜正面投影、构件厚度与门净空', 52)
text(62, 105, '当前实现核对图 · 主角 3.3 头身 · X 左右 / Y 上下 / Z 视觉纵深 · 未定位置不写成最终规范', 28, MUTED)
panel((60,170,2340,855))
text(90,195,'A  同一地块：侧视标深度，正视看效果',37)
text(90,250,'距离 30 格 / FOV 30°；下图为同投影局部放大，场景摆放与色块仅作尺度示意。',27,MUTED)

# A small cave-wall patch uses the actual world Z; no speculative building-wall placement.
for xx in (-4,-3):
    for yy in (0,1):
        face([(xx,yy,-1.01),(xx+1,yy,-1.01),(xx+1,yy+1,-1.01),(xx,yy+1,-1.01)], '#E9EFF1')
box(-5,-1,10)
for xx in range(-4,5):
    d.line((project(xx,-1,.5),project(xx,0,.5)),fill='#AC9679',width=2)
    d.line((project(xx,0,-1),project(xx,0,.5)),fill='#73946A',width=2)
box(-4,0)
box(3,0)
# Only the original whitespace is cropped; the character itself is unchanged.
art = Image.open(ROOT/'assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/right-v1.png').convert('RGB')
art = art.crop((224,34,758,1408))
height = round(3.1*UNIT)
art = art.resize((round(art.width*height/art.height),height),Image.Resampling.LANCZOS)
floor = round(project(0,0,0)[1])
im.paste(art,(1100,floor-height))
dim((1060,floor),(1060,floor-height),'3.1 格',(931,408))
for n in range(4):
    yy=floor-n*UNIT
    d.line((1028,yy,1048,yy),fill=MUTED,width=2)
    text(972,yy-14,str(n),23,MUTED)
text(1080,294,'主角侧面原图',24)
arrow((1250,620),(1380,620),ORANGE)
text(1270,570,'沿 X 移动',24,ORANGE)
# Equal-scale YZ side view makes physical depth explicit without exaggerating the frontal projection.
text(95,302,'侧视 YZ · 长高同一比例',28,BLUE)
side_back, side_front, side_top, side_bottom = 150,450,390,590
side_zero=350
d.rectangle((side_back,side_top,side_front,side_bottom),fill='#D5BD9B',outline=INK,width=3)
d.line((side_back,side_top,side_front,side_top),fill=GREEN,width=8)
dash((side_zero,374),(side_zero,side_bottom),ORANGE)
text(315,340,'Z = 0',25,ORANGE)
for x in (side_back,side_front):
    d.line((x,side_bottom+7,x,668),fill=MUTED,width=2)
text(123,608,'后沿 −1',24,MUTED)
text(401,608,'前沿 +0.5',24,MUTED)
arrow((side_back,657),(side_front,657),BLUE,3)
arrow((side_front,657),(side_back,657),BLUE,3)
text(184,674,'深 1.5 格',43,BLUE)
d.line((112,side_top,112,side_bottom),fill=MUTED,width=2)
for yy in (side_top,side_bottom):d.line((104,yy,140,yy),fill=MUTED,width=2)
text(73,451,'高',24,MUTED)
text(73,488,'1格',24,MUTED)
text(98,742,'Z：后 → 前（靠近镜头）',25,MUTED)
text(1830,338,'洞壁：Z = −1.01',27)
text(1830,389,'地形：−1 ～ +0.5',27)
text(1830,480,'自然砖前 / 后表面',27)
text(1830,527,'同尺寸投影比 ≈ 1.051',26,BLUE)
text(1830,575,'厚 1.5 格并不意味着',25,MUTED)
text(1830,615,'画面露出 1.5 格顶面。',25,MUTED)
text(1830,702,'造型比例 3.3 头身',26)
text(1830,744,'外观高 3.1 格分别标注',25,MUTED)
text(90,809,'正面 1×1 是世界尺寸；Z=+0.5 的砖正面会比 Z=0 的同尺寸标尺略大。',25,MUTED)

panel((60,885,1165,1640))
text(90,912,'B  每个构件的深度，直接标在图上',34)
text(90,968,'横轴是 Z；这是尺寸比较，不是把所有构件装到同一位置。',26,MUTED)
zx=lambda z: 360+(z+1)*460
for z in (-1,-.5,0,.5):
    x=zx(z)
    dash((x,1060),(x,1400),GRID)
    text(x-27,1020,f'{z:g}',25,MUTED)
arrow((zx(-1.1),1060),(zx(.73),1060),MUTED,2)
rows=[('自然地形',-1,.5,'#B3CC91','世界 Z；深 1.5'),
      ('建筑实心格',-.45,.45,'#A5C0DC','局部 Z；深 0.9'),
      ('建筑墙板',-.07,.07,'#CBD4DC','局部 Z；厚 0.14'),
      ('门 Z 跨度',-.7,.7,'#91B8CA','局部 Z；深 1.4')]
for i,(name,lo,hi,color,note) in enumerate(rows):
    y=1090+i*83
    text(93,y,name+(' · 世界 Z' if i==0 else ' · 局部 Z'),24)
    d.rectangle((zx(lo),y,zx(hi),y+23),fill=color,outline=INK,width=2)
    # Dimension arrows meet the exact front/back faces; labels stay outside the narrow wall span.
    for edge in (lo,hi):d.line((zx(edge),y+24,zx(edge),y+53),fill=MUTED,width=2)
    arrow((zx(lo),y+46),(zx(hi),y+46),BLUE,2)
    arrow((zx(hi),y+46),(zx(lo),y+46),BLUE,2)
    text(93,y+34,('深 ' if i != 2 else '厚 ')+f'{hi-lo:g} 格',29,BLUE)

text(90,1460,'建筑墙板：厚度已知，游戏中的最终 Z 位置待统一。',27,ORANGE)
text(90,1510,'自然地形、建筑格和门的前后沿，目前并未统一。',27)
text(90,1560,'洞壁是独立背景平面，不能拿它代替有厚度的墙板。',26,MUTED)

panel((1195,885,2340,1640))
text(1225,912,'C  门：沿 X 穿过，净空另算',36)
text(1225,968,'现行薄门框：X 厚 0.14 / Y 高 3 / Z 跨度 1.4 格。',26,MUTED)
text(1260,1030,'俯视 XZ',29)
# Top view: X goes right, Z goes down, both at 160 pixels per tile.
tx,ty,u=1340,1115,160
for z in (-.566,.566):
    d.rectangle((tx+.02*.14*u,ty+(z+.7-.11)*u,tx+.98*.14*u,ty+(z+.7+.11)*u),fill='#A5C0DC',outline=BLUE,width=2)
d.rectangle((tx,ty,tx+.14*u,ty+1.4*u),outline=GRID,width=2)
d.line((tx+.5*.14*u,ty+(.7-.472)*u,tx+.5*.14*u,ty+(.7+.472)*u),fill='#369AAA',width=5)
arrow((1230,ty+.7*u),(1630,ty+.7*u),ORANGE)
text(1550,ty+.7*u-40,'X',25,ORANGE)
text(1260,1120,'−Z',23,MUTED)
text(1260,1310,'+Z',23,MUTED)
dim((tx,1085),(tx+.14*u,1085),'厚 0.14',(1380,1047))
dim((1540,ty),(1540,ty+1.4*u),'1.4 格',(1570,1290))
text(1250,1380,'青线：关闭时的 YZ 能量膜',25)
text(1250,1424,'开启仅移除膜，门柱仍在。',25,MUTED)

text(1750,1030,'沿 X 看门洞 · YZ 剖面',28)
gx,gy,gu=1970,1445,120
# The section omits decorative trim; 2.64 is the main frame clearance, not guaranteed usable clearance.
for z in (-.566,.566):
    d.rectangle((gx+(z-.11)*gu,gy-2.85*gu,gx+(z+.11)*gu,gy-.15*gu),fill='#A5C0DC',outline=BLUE,width=2)
d.rectangle((gx-.7*gu,gy-.15*gu,gx+.7*gu,gy),fill='#6A8CAA')
d.rectangle((gx-.7*gu,gy-3*gu,gx+.7*gu,gy-2.79*gu),fill='#6A8CAA')
dim((1848,gy),(1848,gy-3*gu),'外高 3',(1730,1165))
dim((2110,gy-.15*gu),(2110,gy-2.79*gu),'净高',(2130,1180))
text(2130,1220,'≈ 2.64',25,ORANGE)
dash((gx,gy-.15*gu),(gx,gy-2.95*gu),ORANGE)
text(1725,1470,'橙线：站在门槛上的 2.8 格碰撞高',24,ORANGE)
text(1225,1530,'净高约 2.64 < 人形碰撞高 2.8；内饰还会占用空间。',27,ORANGE)
text(1225,1580,'门通行尚未接入；必须先协调净空，不能只看“高 3 格”。',26,MUTED)

panel((60,1670,2340,1840))
text(90,1696,'使用边界',30)
text(290,1700,'A 看真实投影关系；B 只比厚度；C 检查方向与通行净空。',29)
text(290,1755,'当前实现数值 ≠ 最终统一规范。人物原图不改造型；游戏尺寸与玩法参数未改。',27,MUTED)
text(65,1855,'依据：tile-geometry · building-kit · cave-wall-view · camera-rig · 主角 right-v1.png ｜ 本地 Python 绘制',24,MUTED)

# Real projection checks: off-axis depth lines intersect the principal point and recede in size.
assert project(0,CAM_Y,-1)==project(0,CAM_Y,.5)==(CX,CY)
assert math.isclose((project(1,0,.5)[0]-CX)/(project(1,0,-1)[0]-CX),31/29.5)
assert project(-4,0,-1)[0]>project(-4,0,.5)[0]
assert project(4,0,-1)[0]<project(4,0,.5)[0]
assert math.isclose(2.79-.15,2.64) and 2.64 < 2.8
assert (side_front-side_back)/(side_bottom-side_top)==1.5
assert (side_zero-side_back)/(side_bottom-side_top)==1
OUT.parent.mkdir(parents=True,exist_ok=True)
im.save(OUT)
(Path(__file__).parent/'tile-wall-door-checks.json').write_text(json.dumps({
    'image':str(OUT.relative_to(ROOT)), 'size':im.size,
    'projection':'front perspective, camera distance 30, uniform viewport crop',
    'camera_fov_degrees':30, 'projection_pixels_per_tile_at_z0':UNIT,
    'near_far_equal_size_ratio':31/29.5,
    'side_view_pixels_per_tile':200, 'side_view_depth':1.5,
    'natural_world_z':[-1,.5], 'building_local_z':[-.45,.45],
    'wall_local_z':[-.07,.07], 'wall_world_z':'not finalized',
    'door_envelope':[.14,3,1.4], 'door_main_frame_clearance':2.64,
    'character_visual_height':3.1, 'character_head_ratio':3.3,
    'collision_height':2.8, 'art_preserved':'right-v1.png whitespace crop, uniform resize',
},ensure_ascii=False,indent=2)+'\n')
print(OUT)
