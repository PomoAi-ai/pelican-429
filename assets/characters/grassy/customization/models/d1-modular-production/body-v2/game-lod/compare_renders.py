"""Compare fixed-camera LOD renders against source; retain honest raster error limits."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
P=Path(__file__).resolve().parent
report={}
for clip,view in [('idle','front'),('idle','right'),('walk','right'),('run','right'),('jump','right')]:
 key=f'{clip}-{view}';images=[Image.open(P/'preview'/f'{label}-{key}.png').convert('RGBA') for label in ('source','game','light')]
 mask=np.array(images[0])[:,:,3]>127
 result={}
 for label,im in zip(('game','light'),images[1:]):
  candidate=np.array(im)[:,:,3]>127
  a=np.column_stack(np.where(mask));b=np.column_stack(np.where(candidate));bb=lambda p:[*p.min(0).tolist(),*p.max(0).tolist()]
  result[label]={'silhouetteIoU':float((mask&candidate).sum()/(mask|candidate).sum()),'changedSilhouettePixels':int((mask^candidate).sum()),'sourceBBoxYX':bb(a),'lodBBoxYX':bb(b)}
  assert result[label]['silhouetteIoU']>.985,(key,label,result[label])
 report[key]=result
 canvas=Image.new('RGB',(1536,674),(235,239,240));draw=ImageDraw.Draw(canvas)
 for i,(label,im) in enumerate(zip(('SOURCE 98,304 tris','GAME 58,562 tris','LIGHT 46,056 tris'),images)):
  canvas.paste(im,(i*512,34),im);draw.text((i*512+15,12),label,fill=(25,35,45))
 canvas.save(P/'preview'/f'compare-{key}.png')
(P/'render-comparison.json').write_text(json.dumps({'renderSize':[512,640],'metric':'Alpha silhouette, identical orthographic camera and animation keyframe; does not prove shading equivalence','views':report},indent=2))
print(json.dumps(report,indent=2))
