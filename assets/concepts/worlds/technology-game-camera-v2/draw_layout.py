"""Draw the composition guide before image-model rendering. Coordinates are pixels."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent
W, H = 1920, 1080
S = 2
im = Image.new('RGB', (W*S, H*S), '#fafbfc')
d = ImageDraw.Draw(im)
INK = '#465366'
def line(points, fill=INK, width=3):
    d.line([(int(x*S), int(y*S)) for x,y in points], fill=fill, width=width*S, joint='curve')
def poly(points, fill, outline=INK, width=3):
    q=[(int(x*S),int(y*S)) for x,y in points]
    d.polygon(q, fill=fill)
    if outline: line(points+[points[0]], outline, width)
def rect(box, fill='#f7f8fa', outline=INK, width=3):
    d.rectangle(tuple(int(v*S) for v in box), fill=fill, outline=outline, width=width*S)
def ellipse(box, fill='#f7f8fa', outline=INK, width=3):
    d.ellipse(tuple(int(v*S) for v in box), fill=fill, outline=outline, width=width*S)

# Quiet large cloud masses; the clean sky remains the dominant upper-left space.
for x,y,r in [(20,240,95),(100,210,100),(200,240,80),(280,265,70),(410,110,66),(478,130,80),(550,158,62)]:
    ellipse((x-r,y-r,x+r,y+r), '#f0f2f5', '#c1c9d2', 2)
poly([(0,530),(130,475),(220,495),(355,415),(470,500),(610,440),(740,535),(880,470),(1040,540),(1290,480),(1500,550),(1700,460),(1920,520),(1920,840),(0,840)], '#e5e9ee', '#b9c3cf', 2)
line([(0,630),(250,608),(520,645),(780,622),(1030,650),(1340,620),(1650,640),(1920,620)], '#c1cad4', 2)
for y in [694,729,769]: line([(0,y),(1920,y)], '#d0d8df', 2)

# Playable surface and soil cross-section: shallow, irregular layered earth, no black void.
ground=[(0,837),(100,832),(210,816),(300,815),(395,833),(480,850),(620,858),(840,860),(1760,860),(1830,895),(1920,915)]
poly(ground+[(1920,1080),(0,1080)], '#e6e2dc')
line(ground, '#667e70', 7)
line([(0,860),(200,844),(350,850),(490,878),(800,886),(1760,888),(1920,942)], '#aaa79e', 2)
line([(0,978),(140,987),(290,969),(480,1002),(670,976),(825,990)], '#c1bbb1', 2)
for x,y in [(75,930),(242,1030),(400,940),(575,1008),(755,946),(1830,1010)]:
    poly([(x-15,y),(x-5,y-12),(x+15,y-6),(x+22,y+10),(x,y+15)], '#d5d1cb', '#b9b5af', 1)

# Large side-elevation two-story house: 910px wide, two 245px clear rooms.
rect((850,340,1760,860), '#f0f1f3')
rect((850,860,1760,901), '#c5ccd4')
rect((870,365,1740,590), '#fafafa', '#b6bec8', 2)
rect((870,627,1740,842), '#fafafa', '#b6bec8', 2)
for x in [850,1736]: rect((x,340,x+24,860), '#aab5c2')
rect((850,594,1760,623), '#aab5c2')
rect((830,327,1780,351), '#9fabb9')

# Broad complete roof with clearly divided solar arrays, not a cropped gable.
poly([(808,325),(1030,100),(1570,100),(1795,325)], '#d8dfe6')
poly([(858,300),(1050,126),(1280,126),(1280,300)], '#b5c2d0')
poly([(1310,126),(1550,126),(1744,300),(1310,300)], '#b5c2d0')
for y in [166,210,254]:
    left=1050-(y-126)*192/174
    right=1550+(y-126)*194/174
    line([(left,y),(1280,y)], '#e9edf2', 2)
    line([(1310,y),(right,y)], '#e9edf2', 2)
for t in [.25,.5,.75]:
    line([(1050+230*t,126),(858+422*t,300)], '#e9edf2', 2)
    line([(1310+240*t,126),(1310+434*t,300)], '#e9edf2', 2)
line([(1030,96),(1570,96)], INK, 7)
rect((1660,183,1700,230),'#c0c9d2')
line([(1680,185),(1680,132)], INK, 4)

# Domestic furniture in elevation, behind the clear walking lane.
rect((907,508,1148,576), '#d7dee6')
rect((920,485,1148,538), '#e8edf1')
rect((913,492,970,520),'#fafafa')
line([(920,576),(920,594)],width=5); line([(1134,576),(1134,594)],width=5)
rect((1210,496,1445,512),'#cad2db')
line([(1223,512),(1223,594)],width=5); line([(1431,512),(1431,594)],width=5)
rect((1280,440,1370,492),'#dbe2e9')
rect((1505,400,1665,562),'#eef1f5')
line([(1585,400),(1585,562)]); line([(1505,481),(1665,481)])
rect((900,670,999,837),'#dbe2e9')
line([(900,725),(999,725)])
rect((1024,767,1260,837),'#d5dce3')
rect((1020,760,1265,770),'#b4c0ce')
line([(1112,761),(1112,734),(1133,734),(1133,747)],width=3)
rect((1040,664,1235,710),'#e1e6eb')
rect((1340,778,1550,795),'#bdc8d2')
line([(1360,795),(1360,840)],width=4); line([(1530,795),(1530,840)],width=4)
rect((1620,630,1715,841),'#d6dfe7')

# Dock stays in the movement plane with no broad perspective floor.
rect((1760,849,1919,862),'#bec9d4')
for x in [1800,1890]: rect((x,862,x+10,1040),'#c9d0d7')
line([(1778,847),(1778,790),(1919,790)],width=4)

# Neutral 3.3-head character mannequins: total 208px = 19.26% canvas height.
def person(cx, feet, skirt=False):
    top=feet-208
    ellipse((cx-28,top,cx+29,top+63),'#f5f6f8',INK,3)
    poly([(cx-17,top+64),(cx+16,top+64),(cx+22,top+128),(cx-20,top+128)],'#dce3eb')
    line([(cx-15,top+77),(cx-29,top+123),(cx-28,top+145)],width=8)
    line([(cx+17,top+77),(cx+33,top+119),(cx+30,top+145)],width=8)
    for dx in [-11,12]:
        line([(cx+dx,top+126),(cx+dx,top+175),(cx+dx+2,feet-6)],width=12)
        rect((cx+dx-7,feet-10,cx+dx+15,feet),'#d0dae5',INK,2)
    if skirt: poly([(cx-20,top+111),(cx+22,top+111),(cx+35,top+148),(cx-32,top+148)],'#d0dae5')
person(440,842)
person(727,860,True)

im.resize((W,H),Image.Resampling.LANCZOS).save(OUT/'layout-wireframe.png')
assert 208/H < .20 and 208/H > .19
assert 1760-850 > 4*208
print(OUT/'layout-wireframe.png')
