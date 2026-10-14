"""Export the isolated repaired Head into a frozen outfit; never alter hair-only publishing."""
import copy,hashlib,json,struct,sys
from pathlib import Path
import bpy,numpy as np
from io_scene_gltf2.io.imp.gltf2_io_binary import BinaryData
from io_scene_gltf2.io.imp.gltf2_io_gltf import glTFImporter

HERE=Path(__file__).resolve().parent;BASE=HERE.parent
ROOT=next(p for p in HERE.parents if (p/'package.json').is_file())
sys.path.insert(0,str(BASE))
from publish_hair import read_glb
SOURCE=ROOT/'public/characters/human/render-lab/d1-outfit-blender-temple-root-v1.glb'
BLEND=HERE/'draft-02-corrected/Eye-Surface-Verified.blend'
OUT=HERE/'export'
TARGET=OUT/'d1-outfit-blender-eye-surface-v1.glb'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def reader(path):
    item=glTFImporter(str(path),{'import_user_extensions':[]});item.read();return item

def decode(item,index):return np.asarray(BinaryData.decode_accessor(item,index))

def gltf(values):return np.asarray(values)[...,[0,2,1]]*np.array([1,1,-1])


def prepare_head():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    head=bpy.data.objects['Head'];mesh=head.data
    assert np.allclose(np.asarray(head.matrix_world),np.eye(4),atol=1e-7,rtol=0)
    original_materials=[p.material_index for p in mesh.polygons]
    assert set(original_materials)=={0,1,2}
    assert all(len(v.groups)==1 and head.vertex_groups[v.groups[0].group].name=='head' and v.groups[0].weight==1 for v in mesh.vertices)
    source_images=[bpy.data.images[n] for n in ('head-diffuse','texture_metallic-texture_roughness.001','head-normal')]
    clean=bpy.data.images['eye-surface-color-clean'];old_w,old_h=source_images[0].size;new_w,new_h=clean.size
    assert all(tuple(im.size)==(old_w,old_h) for im in source_images)
    assert clean.colorspace_settings.name=='sRGB'
    assert hashlib.sha256(clean.packed_file.data).hexdigest()==sha(HERE/'draft-02-corrected/eye-surface-color-clean.png')
    gutter=8;width=old_w+new_w+4*gutter;height=max(old_h,new_h)+2*gutter
    atlases=[];atlas_checks=[]
    for kind,source in zip(('color','metal-roughness','normal'),source_images):
        original=np.asarray(source.pixels[:],dtype=np.float32).reshape(old_h,old_w,4)
        if kind=='color':patch=np.asarray(clean.pixels[:],dtype=np.float32).reshape(new_h,new_w,4)
        else:
            patch=np.empty((new_h,new_w,4),np.float32)
            patch[:]=[1,.68,0,1] if kind=='metal-roughness' else [.5,.5,1,1]
        canvas=np.zeros((height,width,4),np.float32)
        canvas[:,:old_w+2*gutter]=np.pad(original,((gutter,height-old_h-gutter),(gutter,gutter),(0,0)),mode='edge')
        canvas[:,old_w+2*gutter:]=np.pad(patch,((gutter,height-new_h-gutter),(gutter,gutter),(0,0)),mode='edge')
        image=bpy.data.images.new('Eye merged head '+kind,width,height,alpha=True)
        image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color'
        image.pixels.foreach_set(canvas.ravel());image.filepath_raw=str(OUT/('head-eye-'+kind+'.png'));image.file_format='PNG';image.save();image.pack()
        assert hashlib.sha256(image.packed_file.data).hexdigest()==sha(Path(image.filepath_raw))
        check=bpy.data.images.load(image.filepath_raw,check_existing=False);check.colorspace_settings.name=image.colorspace_settings.name
        saved=np.asarray(check.pixels[:],dtype=np.float32).reshape(height,width,4)
        old_error=float(np.max(np.abs(saved[gutter:gutter+old_h,gutter:gutter+old_w]-original)))
        new_error=float(np.max(np.abs(saved[gutter:gutter+new_h,old_w+3*gutter:old_w+3*gutter+new_w]-patch)))
        assert old_error<=.5/255+1e-6 and new_error<=.5/255+1e-6,(kind,old_error,new_error)
        atlas_checks.append(dict(kind=kind,file=image.filepath_raw,sha256=sha(Path(image.filepath_raw)),colorSpace=image.colorspace_settings.name,oldRegionMaximumPixelDifference=old_error,patchRegionMaximumPixelDifference=new_error))
        bpy.data.images.remove(check);atlases.append(image)
    # Affine chart placement retains one model primitive and hence one whole-head
    # bbox for all existing face-normal shaders. Eye UVs are not transformed.
    old_scale=np.array([old_w/width,old_h/height]);old_shift=np.array([gutter/width,gutter/height])
    new_scale=np.array([new_w/width,new_h/height]);new_shift=np.array([(old_w+3*gutter)/width,gutter/height])
    original_uv=np.asarray([l.uv[:] for l in mesh.uv_layers.active.data]);next_uv=original_uv.copy()
    for poly in mesh.polygons:
        if poly.material_index==1:continue
        ids=list(poly.loop_indices)
        scale,shift=(old_scale,old_shift) if poly.material_index==0 else (new_scale,new_shift)
        next_uv[ids]=original_uv[ids]*scale+shift
        poly.material_index=0
    mesh.uv_layers.active.data.foreach_set('uv',next_uv.ravel())
    material=mesh.materials[0].copy();material.name='Eye merged skin export'
    names={im.name:atlas for im,atlas in zip(source_images,atlases)}
    for node in material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image.name in names:node.image=names[node.image.name]
    mesh.materials[0]=material
    head.material_slots[0].link='DATA';head.material_slots[1].link='DATA'
    assert head.material_slots[1].material.name=='D1 eye'
    rig=bpy.data.objects['D1ModularBaseRig'];rig.data.pose_position='REST'
    bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
    for obj in (rig,head):obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=head
    native=OUT/'native-head.glb'
    bpy.ops.export_scene.gltf(filepath=str(native),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_rest_position_armature=True)
    # Save an explicit geometric/UV contract for independent output inspection.
    positions=gltf(np.asarray([v.co[:] for v in mesh.vertices])).astype(np.float32)
    triangles=np.asarray([p.vertices[:] for p in mesh.polygons]);mats=np.asarray([p.material_index for p in mesh.polygons])
    uv_gltf=np.asarray([l.uv[:] for l in mesh.uv_layers.active.data],dtype=np.float32);uv_gltf[:,1]=1-uv_gltf[:,1]
    expected=dict(positions=positions,triangles=triangles,materials=mats,uv=uv_gltf.astype(np.float32).reshape(-1,3,2),sourceUV=original_uv.astype(np.float32).reshape(-1,3,2),sourceMaterials=np.asarray(original_materials),oldUVScale=old_scale,oldUVShift=old_shift,patchUVScale=new_scale,patchUVShift=new_shift)
    np.savez(OUT/'head-export-contract.npz',**expected)
    return native,atlas_checks,dict(size=[width,height],gutter=gutter,oldScale=old_scale.tolist(),oldShift=old_shift.tolist(),patchScale=new_scale.tolist(),patchShift=new_shift.tolist()),expected


def publish_head(native_path,expected):
    doc,binary=read_glb(SOURCE);original=copy.deepcopy(doc);original_binary=bytes(binary)
    native,native_binary=read_glb(native_path)
    head=next(n for n in doc['nodes'] if n.get('name')=='Head');native_head=next(n for n in native['nodes'] if n.get('name')=='Head')
    mesh=copy.deepcopy(native['meshes'][native_head['mesh']]);assert len(mesh['primitives'])==2
    assert len(native['meshes'])==1 and not native.get('animations')
    for key in ('matrix','translation','rotation','scale'):assert native_head.get(key)==head.get(key)
    source_reader=reader(SOURCE);native_reader=reader(native_path)
    source_skin=doc['skins'][head['skin']];native_skin=native['skins'][native_head['skin']]
    source_head_index=next(i for i,n in enumerate(source_skin['joints']) if doc['nodes'][n]['name']=='head')
    native_head_index=next(i for i,n in enumerate(native_skin['joints']) if native['nodes'][n]['name']=='head')
    assert np.allclose(decode(source_reader,source_skin['inverseBindMatrices'])[source_head_index],decode(native_reader,native_skin['inverseBindMatrices'])[native_head_index],atol=1e-6,rtol=0)
    views={};accessors={}
    def copy_view(index):
        if index in views:return views[index]
        value=copy.deepcopy(native['bufferViews'][index]);assert value['buffer']==0 and 'extensions' not in value
        start=value.get('byteOffset',0);binary.extend(b'\x00'*((-len(binary))%4));value['byteOffset']=len(binary)
        binary.extend(native_binary[start:start+value['byteLength']]);value['buffer']=0
        views[index]=len(doc['bufferViews']);doc['bufferViews'].append(value);return views[index]
    def copy_accessor(index):
        if index in accessors:return accessors[index]
        value=copy.deepcopy(native['accessors'][index]);assert 'sparse' not in value
        value['bufferView']=copy_view(value['bufferView']);accessors[index]=len(doc['accessors']);doc['accessors'].append(value);return accessors[index]
    def add_png(path):
        binary.extend(b'\x00'*((-len(binary))%4));view=len(doc['bufferViews']);payload=path.read_bytes()
        doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(payload)));binary.extend(payload)
        image=len(doc['images']);doc['images'].append(dict(name=path.stem,mimeType='image/png',bufferView=view))
        sampler=len(doc.setdefault('samplers',[]));doc['samplers'].append(dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071))
        texture=len(doc['textures']);doc['textures'].append(dict(sampler=sampler,source=image));return texture
    old_primitives=doc['meshes'][head['mesh']]['primitives']
    source_materials={doc['materials'][p['material']]['name']:p['material'] for p in old_primitives}
    skin_material=copy.deepcopy(doc['materials'][source_materials['model']])
    skin_material['pbrMetallicRoughness']['baseColorTexture']={'index':add_png(OUT/'head-eye-color.png')}
    skin_material['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':add_png(OUT/'head-eye-metal-roughness.png')}
    skin_material['normalTexture']={'index':add_png(OUT/'head-eye-normal.png')}
    new_skin_material=len(doc['materials']);doc['materials'].append(skin_material)
    primitive_reports=[]
    for primitive in mesh['primitives']:
        name=native['materials'][primitive['material']]['name'];mat=1 if name=='D1 eye' else 0
        assert name in ('D1 eye','Eye merged skin export')
        attrs={k:decode(native_reader,v) for k,v in primitive['attributes'].items()};idx=decode(native_reader,primitive['indices']).reshape(-1,3)
        assert len(idx)==int(np.sum(expected['materials']==mat))
        assert np.all(attrs['JOINTS_0'][:,0]==native_head_index) and np.all(attrs['WEIGHTS_0']==[1,0,0,0])
        actual_positions=attrs['POSITION'][idx];actual_uv=attrs['TEXCOORD_0'][idx]
        source_positions=expected['positions'][expected['triangles'][expected['materials']==mat]];source_uv=expected['uv'][expected['materials']==mat]
        # Blender may reorder triangles; compare complete ordered corner tuples as a multiset.
        def canonical(p,u):
            values=np.concatenate([p,u],axis=2)
            rows=[]
            for tri in values:
                choices=[tuple(np.roll(tri,-k,axis=0).ravel()) for k in range(3)]
                rows.append(min(choices))
            return sorted(rows)
        assert canonical(actual_positions,actual_uv)==canonical(source_positions,source_uv),('Native Head altered position/UV triangles',name)
        primitive['indices']=copy_accessor(primitive['indices']);primitive['attributes']={k:copy_accessor(v) for k,v in primitive['attributes'].items()}
        joint_accessor=doc['accessors'][primitive['attributes']['JOINTS_0']];assert joint_accessor['type']=='VEC4' and joint_accessor['componentType'] in (5121,5123)
        view=doc['bufferViews'][joint_accessor['bufferView']];fmt='<4B' if joint_accessor['componentType']==5121 else '<4H';stride=view.get('byteStride',struct.calcsize(fmt));offset=view.get('byteOffset',0)+joint_accessor.get('byteOffset',0)
        for i in range(joint_accessor['count']):struct.pack_into(fmt,binary,offset+i*stride,source_head_index,0,0,0)
        joint_accessor.pop('min',None);joint_accessor.pop('max',None)
        primitive['material']=source_materials['D1 eye'] if mat==1 else new_skin_material
        primitive_reports.append(dict(material='D1 eye' if mat==1 else 'model',vertices=len(attrs['POSITION']),triangles=len(idx),sourcePositionUVTrianglesExact=True))
    doc['meshes'][head['mesh']]=mesh
    binary.extend(b'\x00'*((-len(binary))%4));doc['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4)
    data=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\x00')+binary
    TARGET.write_bytes(data)
    assert binary[:len(original_binary)]==original_binary
    assert all(doc[k]==original[k] for k in ('nodes','skins','animations','scenes','scene'))
    assert all(m==doc['meshes'][i] for i,m in enumerate(original['meshes']) if i!=head['mesh'])
    for key in ('materials','textures','images','samplers','accessors','bufferViews'):assert doc[key][:len(original[key])]==original[key]
    assert doc['buffers'][1:]==original['buffers'][1:]
    hair=next(n for n in doc['nodes'] if n.get('name')=='Hair')
    assert len(hair['extras']['hairGuides'])==72
    assert {a['name'] for a in doc['animations']}=={'idle','walk','run','jump'}
    return dict(bytes=len(data),oldBinaryPrefixBytes=len(original_binary),oldBinaryPrefixSHA256=hashlib.sha256(original_binary).hexdigest(),allOldBufferBytesPreserved=True,nodesSkinsFourActionsAndNonHeadMeshesExactlyPreserved=True,allOldMaterialTextureImageSamplerAccessorAndViewEntriesPreserved=True,sourceHeadJointIndex=source_head_index,headBindMatrixPreserved=True,oneModelPrimitive=True,eyeUsesOriginalMaterial=source_materials['D1 eye'],primitives=primitive_reports,hairGuides=72)


def main():
    if OUT.exists():raise ValueError('Offline export already exists; preserve it')
    public={str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'public/characters/human/render-lab').glob('*.glb'))}
    assert len(public)==29,('Unexpected baseline public inventory',len(public))
    before_source=sha(SOURCE);before_blend=sha(BLEND);OUT.mkdir()
    (OUT/'public-before.json').write_text(json.dumps(public,indent=2)+'\n')
    native,atlases,layout,expected=prepare_head();publication=publish_head(native,expected)
    assert sha(BLEND)==before_blend and sha(SOURCE)==before_source
    assert all(sha(ROOT/p)==h for p,h in public.items())
    report=dict(source=str(SOURCE),sourceSHA256=before_source,sourceBlend=str(BLEND),sourceBlendSHA256=before_blend,output=str(TARGET),outputSHA256=sha(TARGET),atlases=atlases,atlasLayout=layout,publication=publication,original29PublicGLBsUnchanged=True,originalEyeAtlasMaterialAndUVPreserved=True,headSkinUVChangedOnlyByDocumentedAffineCharts=True,visualApproval='offline source accepted by parent; exported runtime still pending',animationRuntimeApproval=False,published=False)
    (OUT/'export-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('EYE_SURFACE_EXPORT_OK',json.dumps(report),flush=True)

if __name__=='__main__':main()
