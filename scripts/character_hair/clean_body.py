"""Remove fused scalp hair by atlas color and connected surface regions.

Run decode_body_variants.mjs first, then python3 scripts/character_hair/clean_body.py.
Outputs candidates only; original face, animation data and public assets stay intact.
The separate hair asset supplies the rigid cap, so this adds no replacement skin.
"""
from pathlib import Path
import argparse,json,struct,io,math
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/hair-rebuild-probe'
SOURCE=ROOT
PROFILES={
 'grassy':dict(earX=.31,earY=[2.11,2.405],earZ=[-.15,.15],floor=2.04,faceY=2.40,faceZ=.09,red=160,crownY=2.67,temple=[.30,2.27,.25]),
 'sam-monster':dict(earX=.29,earY=[2.15,2.435],earZ=[-.12,.17],floor=1.91,faceY=2.24,faceZ=.075,red=195,crownY=2.48,temple=[.28,2.22,.24]),
 'sam-human':dict(earX=.29,earY=[2.07,2.235],earZ=[-.16,.10],floor=1.91,faceY=2.22,faceZ=.075,red=185,crownY=2.54,temple=[.28,2.20,.22]),
 'tibo-monster':dict(browY=[2.17,2.26],browX=.28,browZ=.24,earX=.28,earY=[2.06,2.17],earZ=[-.14,.13],floor=1.965,faceY=2.18,faceZ=.045,red=145,crownY=2.47,temple=[.28,2.20,.22]),
 'tibo-human':dict(earX=.28,earY=[2.03,2.165],earZ=[-.16,.13],floor=1.91,faceY=2.17,faceZ=.045,red=185,crownY=2.51,temple=[.28,2.15,.22]),
}

def create(key,relative,label,atlas_relative=None,output_name=None,connected=True,clip_boundary=True):
 profile=PROFILES[key];data=((SOURCE if relative.startswith('public/') else ROOT)/relative).read_bytes();jl=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jl]);binary=data[28+jl:];original_binary=binary
 meshIndex=next(i for i,m in enumerate(doc['meshes']) if m['name']=='model');primitive=doc['meshes'][meshIndex]['primitives'][0]
 def read(ai):
  a=doc['accessors'][ai];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']];width=struct.calcsize(fmt)*size
  def values(viewIndex,offset,count,format,size,stride=None):
   view=doc['bufferViews'][viewIndex];start=view.get('byteOffset',0)+offset;step=stride or struct.calcsize(format)*size
   return [struct.unpack_from('<'+format*size,binary,start+i*step) for i in range(count)]
  result=[(0,)*size for _ in range(a['count'])]
  if 'bufferView' in a:
   view=doc['bufferViews'][a['bufferView']];result=values(a['bufferView'],a.get('byteOffset',0),a['count'],fmt,size,view.get('byteStride',width))
  if 'sparse' in a:
   sparse=a['sparse'];idx=sparse['indices'];val=sparse['values'];indexFmt={5121:'B',5123:'H',5125:'I'}[idx['componentType']]
   sparseIndices=values(idx['bufferView'],idx.get('byteOffset',0),sparse['count'],indexFmt,1)
   sparseValues=values(val['bufferView'],val.get('byteOffset',0),sparse['count'],fmt,size)
   for index,value in zip(sparseIndices,sparseValues):result[index[0]]=value
  return result
 positions=read(primitive['attributes']['POSITION']);uvs=read(primitive['attributes']['TEXCOORD_0']);indices=[v[0] for v in read(primitive['indices'])]
 atlasDoc,atlasBin,atlasPrimitive=doc,binary,primitive
 if atlas_relative:
  atlasData=(SOURCE/atlas_relative).read_bytes();atlasLength=struct.unpack_from('<I',atlasData,12)[0];atlasDoc=json.loads(atlasData[20:20+atlasLength]);atlasBin=atlasData[28+atlasLength:];atlasPrimitive=next(m for m in atlasDoc['meshes'] if m['name']=='model')['primitives'][0]
 mat=atlasDoc['materials'][atlasPrimitive['material']];tex=atlasDoc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=atlasDoc['images'][tex['source']];view=atlasDoc['bufferViews'][im['bufferView']];image=Image.open(io.BytesIO(atlasBin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB')
 colors=[image.getpixel((min(image.width-1,max(0,int(u*image.width))),min(image.height-1,max(0,int(v*image.height))))) for u,v in uvs]
 def protected(p,c):
  x,y,z=p
  temple=profile.get('temple')
  in_temple=temple and abs(x)>temple[0] and y>temple[1] and z<temple[2]
  # Tibo's brown facial fur connects his brows to the scalp in the fused mesh.
  brow='browY' in profile and profile['browY'][0]<y<profile['browY'][1] and abs(x)<profile['browX'] and z>profile['browZ']
  return brow or y<=profile['floor'] or (z>profile['faceZ'] and y<profile['faceY'] and not in_temple) or (abs(x)>profile['earX'] and profile['earY'][0]<y<profile['earY'][1] and profile['earZ'][0]<z<profile['earZ'][1] and (c[0]>=profile['red'] or (c[0]>profile['red']*.75 and c[1]<c[0]*.60)))
 protection=[protected(p,c) for p,c in zip(positions,colors)]
 hair=[not protection[i] and (positions[i][1]>profile['crownY'] or (c[0]<profile['red'] and c[1]<profile['red']*.83)) for i,c in enumerate(colors)]
 if connected:
  parents=list(range(len(positions)))
  def find(i):
   while parents[i]!=i:
    parents[i]=parents[parents[i]];i=parents[i]
   return i
  welded={}
  for i,p in enumerate(positions):
   if not hair[i]:continue
   key=tuple(round(c,5) for c in p)
   if key in welded:parents[find(i)]=find(welded[key])
   else:welded[key]=i
  for start in range(0,len(indices),3):
   eligible=[i for i in indices[start:start+3] if hair[i]]
   for i in eligible[1:]:parents[find(i)]=find(eligible[0])
  seeds={find(i) for i,p in enumerate(positions) if hair[i] and (p[1]>profile['crownY'] or p[2]<-.15 or (abs(p[0])>profile['earX'] and p[1]>profile['earY'][1] and p[2]<profile['earZ'][1]))}
  hair=[enabled and find(i) in seeds for i,enabled in enumerate(hair)]
 kept=[];removed=[];protected_faces=0;split_faces=0
 attributes={name:[list(v) for v in read(ai)] for name,ai in primitive['attributes'].items()}
 targets=[{name:[list(v) for v in read(ai)] for name,ai in target.items()} for target in primitive.get('targets',[])]
 edge_vertices={}
 def crossing(a,b):
  edge=tuple(sorted((a,b)))
  if edge in edge_vertices:return edge_vertices[edge]
  def score(i):
   return -max(1,profile['red']-colors[i][0]) if hair[i] else max(1,colors[i][0]-profile['red'])
  sa,sb=score(a),score(b);t=sa/(sa-sb);index=len(attributes['POSITION'])
  influences={}
  for vertex,factor in [(a,1-t),(b,t)]:
   for joint,weight in zip(attributes['JOINTS_0'][vertex],attributes['WEIGHTS_0'][vertex]):
    if weight:influences[joint]=influences.get(joint,0)+weight*factor
  if len(influences)>4:raise ValueError('Cut boundary needs more than four skin joints')
  joints=list(influences)+[0]*(4-len(influences));weights=list(influences.values())+[0]*(4-len(influences))
  for name,values in attributes.items():
   if name=='JOINTS_0':value=joints
   elif name=='WEIGHTS_0':value=weights
   else:
    value=[u+(v-u)*t for u,v in zip(values[a],values[b])]
    if name=='NORMAL':
     magnitude=math.sqrt(sum(c*c for c in value));value=[c/magnitude for c in value]
   values.append(value)
  for target in targets:
   for values in target.values():values.append([u+(v-u)*t for u,v in zip(values[a],values[b])])
  edge_vertices[edge]=index;return index
 for t in range(0,len(indices),3):
  triangle=indices[t:t+3]
  if any(protection[i] for i in triangle):
   protected_faces+=1
  if all(hair[i] for i in triangle):removed.extend(triangle);continue
  if not clip_boundary or not any(hair[i] for i in triangle):kept.extend(triangle);continue
  polygon=[]
  for k,a in enumerate(triangle):
   b=triangle[(k+1)%3]
   if not hair[a]:polygon.append(a)
   if hair[a]!=hair[b]:polygon.append(crossing(a,b))
  for k in range(1,len(polygon)-1):kept.extend([polygon[0],polygon[k],polygon[k+1]])
  split_faces+=1

 # Clipping can leave small detached pieces of the old fused hair/skin transition.
 # Only discard components created at a cut edge; independent eyes/accessories remain.
 isolated_faces=0
 if clip_boundary:
  parents={i:i for i in kept}
  def component(i):
   while parents[i]!=i:
    parents[i]=parents[parents[i]];i=parents[i]
   return i
  welded={}
  for i in parents:
   coordinate=tuple(round(v,5) for v in attributes['POSITION'][i])
   if coordinate in welded:parents[component(i)]=component(welded[coordinate])
   else:welded[coordinate]=i
  for a,b,c in zip(kept[::3],kept[1::3],kept[2::3]):
   parents[component(b)]=component(a);parents[component(c)]=component(a)
  groups={}
  for i in parents:groups.setdefault(component(i),[]).append(i)
  detached={root for root,vertices in groups.items() if len(vertices)<100 and any(i>=len(positions) for i in vertices)}
  cleaned=[]
  for offset in range(0,len(kept),3):
   if component(kept[offset]) in detached:isolated_faces+=1
   else:cleaned.extend(kept[offset:offset+3])
  kept=cleaned

 def append(values,component,kind,target):
  nonlocal binary
  n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[component];binary+=b'\0'*(-len(binary)%4);offset=len(binary);raw=struct.pack('<'+fmt*len(values),*values);binary+=raw
  bv=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(raw),target=target));accessor=dict(bufferView=bv,componentType=component,count=len(values)//n,type=kind)
  if kind=='VEC3':accessor.update(min=[min(values[k::3]) for k in range(3)],max=[max(values[k::3]) for k in range(3)])
  ai=len(doc['accessors']);doc['accessors'].append(accessor);return ai
 used=sorted(set(kept));remap={index:i for i,index in enumerate(used)};kept=[remap[i] for i in kept]
 if edge_vertices or len(used)<len(positions):
  for name,all_values in attributes.items():
   values=[all_values[i] for i in used]
   original=doc['accessors'][primitive['attributes'][name]];component=original['componentType'];flat=[n for v in values for n in v]
   if component!=5126:flat=[round(n) for n in flat]
   primitive['attributes'][name]=append(flat,component,original['type'],34962)
   if original.get('normalized'):doc['accessors'][primitive['attributes'][name]]['normalized']=True
  for target,valuesByName in zip(primitive.get('targets',[]),targets):
   for name,all_values in valuesByName.items():
    values=[all_values[i] for i in used]
    original=doc['accessors'][target[name]];target[name]=append([n for v in values for n in v],original['componentType'],original['type'],34962)
 primitive['indices']=append(kept,5125,'SCALAR',34963)
 doc['buffers'][0]['byteLength']=len(binary);binary+=b'\0'*(-len(binary)%4);jsonBytes=json.dumps(doc,separators=(',',':')).encode();jsonBytes+=b' '*(-len(jsonBytes)%4)
 output=struct.pack('<III',0x46546c67,2,12+8+len(jsonBytes)+8+len(binary))+struct.pack('<II',len(jsonBytes),0x4e4f534a)+jsonBytes+struct.pack('<II',len(binary),0x004e4942)+binary
 path=OUT/(output_name if output_name else label+'-bald.glb');path.write_bytes(output)
 protectedRemoved=sum(any(protection[i] for i in removed[t:t+3]) for t in range(0,len(removed),3));assert protectedRemoved==0;assert binary[:len(original_binary)]==original_binary
 report=dict(source=relative,output=str(path.relative_to(ROOT)),profile=profile,detachedCutTriangles=isolated_faces,sourceTriangles=len(indices)//3,keptTriangles=len(kept)//3,removedHairTriangles=len(removed)//3,protectedTriangles=protected_faces,protectedTrianglesRemoved=protectedRemoved,sourceBufferPreserved=True,animations=len(doc.get('animations',[])),splitBoundaryTriangles=split_faces,boundaryVertices=len(edge_vertices))
 if not atlas_relative:
  active=set(used);boundary=[attributes['POSITION'][i] for i in edge_vertices.values() if i in active]
  (OUT/(label+'-hairline.json')).write_text(json.dumps(boundary))
 (OUT/(label+'-report.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);return report

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-root',type=Path,default=ROOT)
 SOURCE=parser.parse_args().source_root.resolve()
 OUT.mkdir(parents=True,exist_ok=True)
 reports=[];mapping=[]
 sources=[('grassy',f'public/characters/human/models-equipped/grassy-equipped-{tier}.glb','grassy-'+tier) for tier in ['game','light','detailed']]
 for kind in ['sam','tibo']:
  for form in ['monster','human']:
   source=f'public/characters/{kind}/{kind}.glb' if form=='monster' else f'public/characters/{kind}/human/{kind}-human.glb'
   sources.append((kind+'-'+form,source,kind+'-'+form))
 for key,source,label in sources:
  report=create(key,source,label+'-clean');reports.append(report);mapping.append(dict(source=source,candidate=report['output']))
 for entry in json.loads((OUT/'decoded-variants.json').read_text()):
  source=entry['source'];stem,suffix=Path(source).name.split('.',1);atlas=str(Path(source).with_name(stem+'.glb'))
  if stem.startswith('grassy'):key='grassy';label='grassy-game'
  else:
   kind='sam' if stem.startswith('sam') else 'tibo';form='human' if 'human' in stem else 'monster';key=kind+'-'+form;label=key
  report=create(key,entry['decoded'],label+'-clean-'+suffix.removesuffix('.glb'),atlas_relative=atlas,output_name=label+'-clean-bald.'+suffix)
  reports.append(report);mapping.append(dict(source=source,candidate=report['output']))
 (OUT/'clean-summary.json').write_text(json.dumps(reports,indent=2)+'\n')
 (OUT/'replacement-map.json').write_text(json.dumps(mapping,indent=2)+'\n')
