import bpy,numpy as np,json
from collections import deque
from pathlib import Path
out=Path(__file__).resolve().parent
data=json.loads((out/'reference-landmarks.json').read_text())
im=bpy.data.images.load(data['reference']);w,h=im.size
rgba=np.array(im.pixels[:]).reshape(h,w,4)[::-1]
result={'schema':'d1-reference-bbox.v1','sourceImageSize':[w,h],'mask':'within manually selected head ROI, chroma > .07 excludes white/gray background and labels; neck manually excluded','views':{}}
for view,spec in data['views'].items():
 l,t,r,b=spec['crop'];rgb=rgba[t:b,l:r,:3];mask=(rgb.max(2)-rgb.min(2)>.07)&(rgb.max(2)>.10)
 yy,xx=np.mgrid[t:b,l:r]
 if 'neckExcludePolygon' in spec:
  pts=spec['neckExcludePolygon'];inside=np.zeros(mask.shape,dtype=bool)
  for i,(x1,y1) in enumerate(pts):
   x2,y2=pts[(i+1)%len(pts)]
   if y1!=y2:inside^=((y1>yy)!=(y2>yy))&(xx<(x2-x1)*(yy-y1)/(y2-y1)+x1)
  mask&=~inside
 # Keep the largest connected head region, excluding disconnected clothing trim.
 labels=np.zeros(mask.shape,dtype=np.int32);components=[];num=0
 for ry,rx in zip(*np.nonzero(mask)):
  if labels[ry,rx]:continue
  num+=1;q=deque([(ry,rx)]);labels[ry,rx]=num;count=0
  while q:
   y,x=q.popleft();count+=1
   for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
    ny,nx=y+dy,x+dx
    if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and not labels[ny,nx]:labels[ny,nx]=num;q.append((ny,nx))
  components.append((count,num))
 mask=labels==max(components)[1]
 # White sclera/highlights are enclosed appearance regions, not silhouette holes.
 exterior=np.zeros(mask.shape,dtype=bool);q=deque()
 for y,x in [(0,x) for x in range(mask.shape[1])]+[(mask.shape[0]-1,x) for x in range(mask.shape[1])]+[(y,0) for y in range(mask.shape[0])]+[(y,mask.shape[1]-1) for y in range(mask.shape[0])]:
  if not mask[y,x] and not exterior[y,x]:exterior[y,x]=True;q.append((y,x))
 while q:
  y,x=q.popleft()
  for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
   ny,nx=y+dy,x+dx
   if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and not mask[ny,nx] and not exterior[ny,nx]:exterior[ny,nx]=True;q.append((ny,nx))
 mask=~exterior
 ys,xs=np.nonzero(mask);bbox=[int(xs.min()+l),int(ys.min()+t),int(xs.max()+l+1),int(ys.max()+t+1)]
 width=bbox[2]-bbox[0];height=bbox[3]-bbox[1]
 result['views'][view]={'bbox':bbox,'width':width,'height':height,'widthHeightRatio':width/height,'centroid':[float(xs.mean()+l),float(ys.mean()+t)],'foregroundPixels':int(mask.sum()),'touchesCropBorder':bool(mask[0].any() or mask[-1].any() or mask[:,0].any() or mask[:,-1].any())}
 np.save(out/f'reference-{view}-mask.npy',mask)
(out/'reference-bbox.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
