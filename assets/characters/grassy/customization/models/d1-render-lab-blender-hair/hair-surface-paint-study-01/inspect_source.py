import hashlib,json
from pathlib import Path
import bpy,numpy as np
HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'temple-root-continuity-study-01/draft-01/Temple-Root-Continuity.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
rows=[]
for o in scene.objects:
    if o.type!='MESH':continue
    rows.append(dict(name=o.name,vertices=len(o.data.vertices),region=o.get('region'),
        attributes={k:o[k] for k in o.keys() if k not in ('guideBlender','flowGuide','geometryNodes','_RNA_UI') and isinstance(o[k],(str,int,float,bool))},
        uv=[dict(name=u.name,min=np.asarray([d.uv[:] for d in u.data]).min(0).tolist(),max=np.asarray([d.uv[:] for d in u.data]).max(0).tolist()) for u in o.data.uv_layers],
        materials=[dict(link=s.link,name=s.material.name) for s in o.material_slots if s.material]))
materials={}
for m in bpy.data.materials:
    if not m.node_tree:continue
    materials[m.name]=[dict(name=n.name,type=n.type,image=n.image.name if n.type=='TEX_IMAGE' and n.image else None,
        values={s.name:list(s.default_value) if hasattr(s.default_value,'__iter__') else s.default_value for s in n.inputs if hasattr(s,'default_value') and isinstance(s.default_value,(float,int))}) for n in m.node_tree.nodes]
hair=bpy.data.objects['Single broad swept fringe'].material_slots[0].material;atlas=next(n.image for n in hair.node_tree.nodes if n.type=='TEX_IMAGE')
(HERE/'source-hair-atlas.png').write_bytes(bytes(atlas.packed_file.data))
report=dict(source=str(SOURCE),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),objects=rows,materials=materials,
    camera=dict(location=list(scene.camera.location),rotation=list(scene.camera.rotation_euler),scale=scene.camera.data.ortho_scale),
    render=dict(engine=scene.render.engine,resolution=[scene.render.resolution_x,scene.render.resolution_y],viewTransform=scene.view_settings.view_transform,look=scene.view_settings.look,exposure=scene.view_settings.exposure,gamma=scene.view_settings.gamma),
    atlas=dict(name=atlas.name,size=list(atlas.size)))
(HERE/'source-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
