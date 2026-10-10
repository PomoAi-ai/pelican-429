import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[8];P=ROOT/'assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular'
sys.path.insert(0,str(ROOT/'scripts/character_customization'));import d1_head_from_source as h
bpy.ops.wm.open_mainfile(filepath=str(P/'head.blend'))
face=bpy.data.objects['D1_Head_SourceFace']
for name in ('D1_Head_ClosedScalp','D1_Head_NeckClosure'):bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
skin=h.studio.principled('D1 continuous scalp skin','#ffddd0',.74);mi=len(face.data.materials);face.data.materials.append(skin)
# Retain original ear geometry and UVs; a closed root intersects inside the new temple.
for sign in (-1,1):
 ear=face.copy();ear.data=face.data.copy();ear.name=f'D1_Head_Ear_{sign}';bpy.context.collection.objects.link(ear)
 bm=bmesh.new();bm.from_mesh(ear.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(sign*.30,0,0),plane_no=(sign,0,0),clear_inner=True)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().y<-.13 or f.calc_center_median().z>2.59 or f.calc_center_median().z<2.30],context='FACES')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 for f in bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)['faces']:f.material_index=mi;f.smooth=True
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ear.data);bm.free();ear.data.update()
bm=bmesh.new();bm.from_mesh(face.data)
for center,normal in [((0,0,2.565),(0,0,1)),((0,-.13,0),(0,1,0))]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=center,plane_no=normal)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().z>2.565 or (f.calc_center_median().y>-.13 and f.calc_center_median().z>2.30)],context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
r=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
print('CAPS',[(len(f.verts),tuple(f.calc_center_median())) for f in r['faces']])
main=max(r['faces'],key=lambda f:len(f.verts));ring=list(main.verts)
for f in r['faces']:f.material_index=mi;f.smooth=True
bm.faces.remove(main)
initial=[v.co.copy() for v in ring];normals=[v.normal.copy() for v in ring]
angles=[math.atan2(p.z-2.40,p.x) for p in initial]
import numpy as np
angles=np.unwrap(angles)
# Order-preserving angle fit removes short reversals at the temple transition.
blocks=[]
for i,value in enumerate(-angles):
 blocks.append([i,i+1,float(value)])
 while len(blocks)>1 and blocks[-2][2]>blocks[-1][2]:
  a,b=blocks[-2:];n=a[1]-a[0];m=b[1]-b[0];blocks[-2:]=[[a[0],b[1],(a[2]*n+b[2]*m)/(n+m)]]
for a,b,value in blocks:
 for i in range(a,b):angles[i]=-value-(i-(a+b-1)/2)*1e-4
print('ANGLES',len(angles))
targets=[Vector((.373*math.cos(phi),.045,2.62+.38*math.sin(phi))) for phi in angles]
tangents=[]
for i,p in enumerate(initial):
 tangent=Vector((p.x,0,p.z-2.40)).normalized()
 tangents.append(tangent*(targets[i]-p).length*.8)
def connect(new):
 global ring
 for i in range(len(ring)):
  f=bm.faces.new((ring[i],ring[(i+1)%len(ring)],new[(i+1)%len(ring)],new[i]));f.material_index=mi;f.smooth=True
 ring=new
for step in range(1,25):
 t=step/24;new=[]
 for p,q,m in zip(initial,targets,tangents):
  n=Vector((0,(q-p).length*1.2,0))
  point=(2*t**3-3*t*t+1)*p+(t**3-2*t*t+t)*m+(-2*t**3+3*t*t)*q+(t**3-t*t)*n
  new.append(bm.verts.new(point))
 connect(new)
for step in range(1,16):
 t=step/16*math.pi/2
 connect([bm.verts.new((.373*math.cos(phi)*math.cos(t),.045+.25*math.sin(t),2.62+.38*math.sin(phi)*math.cos(t))) for phi in angles])
end=bm.verts.new((0,.295,2.62))
for i in range(len(ring)):
 f=bm.faces.new((ring[i],ring[(i+1)%len(ring)],end));f.material_index=mi;f.smooth=True
# Smooth only reconstruction and its narrow join, fixing all visible facial features.
protected={v:v.co.copy() for v in bm.verts if v.co.y<-.17 and v.co.z<2.545}
movable=[v for v in bm.verts if v not in protected]
for _ in range(35):
 for amount in (.48,-.50):
  targets={v:sum((e.other_vert(v).co for e in v.link_edges),Vector())/len(v.link_edges) for v in movable}
  for v,target in targets.items():v.co+=(target-v.co)*amount
assert all((v.co-p).length<1e-8 for v,p in protected.items())
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));print('BOUNDARY',sum(e.is_boundary for e in bm.edges));bm.to_mesh(face.data);bm.free();face.data.update()
s=bpy.context.scene;s.cycles.device='CPU';s.render.threads_mode='FIXED';s.render.threads=4
h.studio.FRAMES['head']=(2.55,1.26,900,900);h.studio.VIEWS['three-quarter']=Vector((-.707,-.707,0))
for view in ('front','right','three-quarter'):h.studio.render(view,'head',P/'head-source-study'/f'final-local-{view}.png',16)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'head-source-study/final-local-candidate.blend'))
