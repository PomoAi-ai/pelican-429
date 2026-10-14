"""Load the completed local colour bake as fresh data; verify its actual packed bytes."""
import bpy,hashlib,json
from pathlib import Path
P=Path(__file__).resolve().parent/'draft-02-corrected'
SOURCE=P/'Eye-Local-Retopology.blend';DEST=P/'Eye-Surface-Verified.blend';PNG=P/'eye-surface-color-clean.png'
assert not DEST.exists()
before=hashlib.sha256(SOURCE.read_bytes()).hexdigest();png_hash=hashlib.sha256(PNG.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
old=bpy.data.images['eye-surface-color'];old.use_fake_user=True
image=bpy.data.images.load(str(PNG),check_existing=False);image.name='eye-surface-color-clean';image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
assert image.packed_file and hashlib.sha256(image.packed_file.data).hexdigest()==png_hash
m=bpy.data.objects['Head'].data.materials[2]
for n in m.node_tree.nodes:
 if n.type=='TEX_IMAGE' and n.image==old:n.image=image
 if n.type=='BSDF_PRINCIPLED':
  for name,value in [('Metallic',0.0),('Roughness',.68)]:
   for l in list(n.inputs[name].links):m.node_tree.links.remove(l)
   n.inputs[name].default_value=value
bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
bpy.ops.wm.open_mainfile(filepath=str(DEST))
h=bpy.data.objects['Head'];material=h.material_slots[2].material
node=material.node_tree.nodes['Image Texture'];assert node.image.name=='eye-surface-color-clean'
assert hashlib.sha256(node.image.packed_file.data).hexdigest()==png_hash
assert bpy.data.images['eye-surface-color'].use_fake_user
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==before
report=dict(source=str(SOURCE),sourceSHA256=before,candidate=str(DEST),candidateSHA256=hashlib.sha256(DEST.read_bytes()).hexdigest(),cleanPNG_SHA256=png_hash,actualSavedPackedSHA256=hashlib.sha256(node.image.packed_file.data).hexdigest(),oldLocalColorImageRetainedWithFakeUser=True,roughness=.68,metallic=0,materialSlot=2,oldFinalFileRejected='copied image retained the previous packed blob; disk bake was correct',exported=False,published=False)
(P/'verified-pack-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('EYE_PACK_VERIFIED',json.dumps(report),flush=True)
