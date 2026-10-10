"""State sheets that keep the same support, camera and surviving branch geometry."""
import math


def render_drooping_states(Sheet, items):
    for item in items:
        states=item['states'];height=210+math.ceil(len(states)/2)*850+90
        sheet=Sheet(item['title'],'同页宿主、镜头、比例不变；最低Y、最高Y和外观尺寸由图中实际几何计算。单位：格。',height)
        all_points=[v for _,faces,_ in states for vertices,_ in faces for v in vertices]
        xlo,xhi=min(v[0] for v in all_points),max(v[0] for v in all_points)
        ylo,yhi=min(v[1] for v in all_points),max(v[1] for v in all_points)
        zlo,zhi=min(v[2] for v in all_points),max(v[2] for v in all_points)
        center=((xlo+xhi)/2,(ylo+yhi)/2,(zlo+zhi)/2)
        scale=min(370/(yhi-ylo),400/max(1,xhi-xlo))
        for i,(label,faces,note) in enumerate(states):
            x=35+1190*(i%2);y=185+850*(i//2)
            sheet.card(x,y,1150,815,label)
            p=sheet.camera(x+535,y+420,scale,center)
            sheet.scene(item['host']+faces,p)
            sheet.wire((xlo,ylo,zlo,xhi-xlo,yhi-ylo,zhi-zlo),p)
            points=[v for vertices,_ in faces for v in vertices]
            if points:
                low=[min(v[k] for v in points) for k in range(3)]
                high=[max(v[k] for v in points) for k in range(3)]
                dims=[high[k]-low[k] for k in range(3)]
                sheet.text(x+30,y+85,'当前宽×高×深：'+' × '.join(f'{n:.3f}'.rstrip('0').rstrip('.') for n in dims),26)
                sheet.text(x+30,y+127,f'最低Y={low[1]:.3f}；最高Y={high[1]:.3f}；Z=[{low[2]:.3f},{high[2]:.3f}]',24)
                print(item['kind'],label,'bounds',[(round(low[k],4),round(high[k],4)) for k in range(3)])
            else:
                sheet.text(x+30,y+85,'无植物实体；支撑砖保留。',26)
            sheet.text(x+30,y+722,note,24)
            sheet.text(x+30,y+770,'灰框为成熟范围；盆体计入当前尺寸，承托台不计入。' if item['kind']=='bonsai' else '灰框为成熟范围；宿主砖不计入植株尺寸。',22)
        if len(states)%2:
            x=1225;y=185+850*(len(states)//2)
            sheet.card(x,y,1140,815,'盆体与净空保持固定')
            for j,line in enumerate(('盆底：Y=0；承托面完整覆盖0.7×0.7。','土面：Y=0.45；根始终从盆内发出。','盆沿：高0.5，外宽与外深均0.76。','预留：宽1、深1；上方1.2、下方0.8。','修剪保留弯枝；拔除只去掉活株，空盆仍在。')):
                sheet.text(x+35,y+150+j*110,line,25)
        sheet.text(45,height-60,'叶片有真实叶柄；修剪保留原上段。盆体、支点与树根不会因状态变化而缩放或平移。',25)
        sheet.save('natural-drooping-'+item['kind']+'-states.png')
