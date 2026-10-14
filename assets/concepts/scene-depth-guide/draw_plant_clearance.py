"""Tree and shrub placement behind the body zone, inside the 2-deep tile."""
from draw_natural_states import make_model, cube, FACES


def render_plant_clearance(Sheet):
    def box(x,y,z,w,h,d,color):
        points=cube(x,y,z,w,h,d)
        return [([points[i] for i in face],color) for face in FACES]
    # Geometry keeps the camera at −Z internally (internal z = −Z); labels use +Z toward the camera.
    sheet=Sheet('树木与灌木｜整株后置到人物身体区之后','格子深2 Z=[−1,+1]；前沿[+1,+1.5]、后沿[−1.5,−1]在格子之外。树与灌木整株在格内Z=[−1,−0.3]；蓝色为人物身体区及前方，禁止树体进入。',2050)
    for i,(kind,w,h,d,zc,title) in enumerate((('tree',3.6,5.15,.7,.65,'A 树木 · 冠深0.7 / 高5.15'),('shrub',2,1.5,.6,.6,'B 灌木 · 冠深0.6 / 高1.5'))):
        x=35+1190*i
        sheet.card(x,180,1150,1100,title)
        host=[]
        for xx in (-1.5,-.5,.5):
            host+=box(xx,-.25,-1,1,.25,2,'#C9B28F')
            host+=box(xx,.002,-1,1,.008,1.3,'#98C4DF')
        host+=box(-1.5,0,1,3,2.6,.2,'#E3D7C4')
        plant=[([(a,b,c+zc) for a,b,c in vs],color) for vs,color in make_model(kind,{'id':'mature','w':w,'h':h,'d':d})]
        assert all(.3-1e-9<=z<=1+1e-9 for vs,_ in plant for _,_,z in vs)
        p=sheet.camera(x+525,700 if kind=='tree' else 620,125 if kind=='tree' else 150,(0,2,.3))
        sheet.scene(host+plant,p)
        sheet.wire((-w/2,0,zc-d/2,w,h,d),p,'#5B9565')
        sheet.wire((-1.5,0,-1,3,3.1,1.3),p,'#76A9CA')
        sheet.dim((1.8,0,-1),(1.8,0,.3),'留空1.3',p,dx=20,dy=30)
        sheet.text(x+35,1090,f'根中心Z=−{zc:g}，落在深2宿主格顶面靠后处；各阶段同一落点。',26)
        sheet.text(x+35,1145,'冠Z=[−1,−0.3]；干Z=[−0.9,−0.4]；平台碰撞另在Z=0。' if kind=='tree' else '灌木Z=[−0.9,−0.3]；装饰灌木不可站立，采果不移动冠层。',25)
        sheet.text(x+35,1200,'蓝框：身体区与前方（Z≥−0.3）；米色板：后沿背景墙[−1.2,−1]。',25,'#376E9B')
    sheet.card(35,1310,2330,600,'C XZ俯视放大 · 总深3：后沿（含墙）→ 格子深2 → 前沿（下方朝镜头）')
    for i,(w,d,zc,title) in enumerate(((3.6,.7,.65,'树木'),(2,.6,.6,'灌木'))):
        ox=200+i*1130;oy=1400;unit=150
        def q(a,z):return ox+(a+2)*unit,oy+(1.5+z)*unit
        sheet.d.rectangle((*q(-2,-1.5),*q(2,-1)),fill='#ECE8DF',outline='#897A64',width=1)
        sheet.d.rectangle((*q(-2,-1.2),*q(2,-1)),fill='#D9C9B0',outline='#897A64',width=1)
        sheet.d.rectangle((*q(-2,-1),*q(2,1)),fill='#E9DDC9',outline='#897A64',width=2)
        sheet.d.rectangle((*q(-2,1),*q(2,1.5)),fill='#E6EEF2',outline='#897A64',width=1)
        sheet.d.rectangle((*q(-2,-.3),*q(2,.3)),outline='#376E9B',width=3)
        sheet.d.ellipse((*q(-w/2,-zc-d/2),*q(w/2,-zc+d/2)),fill='#AEC49A',outline='#538E68',width=3)
        if i==0:sheet.d.rectangle((*q(-.25,-.9),*q(.25,-.4)),fill='#987552')
        px,py=q(0,-zc);sheet.d.ellipse((px-6,py-6,px+6,py+6),fill='#263F48')
        for xx in (-1.5,-.5,.5,1.5):sheet.dash(q(xx,-1.5),q(xx,1.5),'#897A64')
        for z,label in ((-1.5,'−1.5'),(-1.2,'−1.2'),(-1,'−1'),(-.3,'−0.3'),(.3,'+0.3'),(1,'+1'),(1.5,'+1.5')):
            sheet.text(q(2,z)[0]+10,q(2,z)[1]-12,label,20,'#376E9B')
        sheet.text(ox+820,1470,title,30,'#538E68')
        sheet.text(ox+820,1530,'宿主格深2承托',24,'#AE7342')
        sheet.text(ox+820,1580,'无根土台',24,'#AE7342')
        sheet.text(ox+820,1650,'蓝框：身体区',24,'#376E9B')
        sheet.text(ox+820,1720,'树后可连续铺墙',24)
    sheet.text(45,1955,'草不套用这条退让：宿主顶面仍全格铺草，只避让根口。格子底面植物另按底面附着定义。',25)
    sheet.text(45,2005,'身体区[−0.3,+0.3]待按角色实测复核；树体后置后，角色在任何高度都画在树前，树不遮挡角色。',25,'#376E9B')
    sheet.save('natural-plant-rear-clearance.png')
