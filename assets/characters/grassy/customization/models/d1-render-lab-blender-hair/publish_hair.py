"""Insert the native hair into the frozen lab outfit without resampling its body, eyes or actions."""
import copy
import json
import struct
from pathlib import Path


def read_glb(path):
    data=Path(path).read_bytes()
    magic,version,size=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and size==len(data), f'Invalid GLB: {path}'
    length,kind=struct.unpack_from('<I4s',data,12)
    assert kind==b'JSON', f'GLB JSON chunk missing: {path}'
    doc=json.loads(data[20:20+length])
    offset=20+length
    binary_length,kind=struct.unpack_from('<I4s',data,offset)
    assert kind==b'BIN\x00', f'GLB binary chunk missing: {path}'
    return doc,bytearray(data[offset+8:offset+8+binary_length])


def publish(source_path,native_path,output_path):
    doc,binary=read_glb(source_path)
    native,native_binary=read_glb(native_path)
    source_hair=next(n for n in doc['nodes'] if n.get('name')=='Hair')
    native_hair=next(n for n in native['nodes'] if n.get('name')=='Hair')
    native_mesh=copy.deepcopy(native['meshes'][native_hair['mesh']])
    assert len(native_mesh['primitives'])==1, 'Native Hair must be one primitive'
    primitive=native_mesh['primitives'][0]
    views={}
    def copy_view(index):
        if index in views: return views[index]
        view=copy.deepcopy(native['bufferViews'][index])
        assert view['buffer']==0, 'Hair must be embedded in one GLB buffer'
        start=view.get('byteOffset',0)
        binary.extend(b'\x00'*((-len(binary))%4))
        view['byteOffset']=len(binary)
        binary.extend(native_binary[start:start+view['byteLength']])
        views[index]=len(doc['bufferViews'])
        doc['bufferViews'].append(view)
        return views[index]
    def copy_accessor(index):
        value=copy.deepcopy(native['accessors'][index])
        assert 'bufferView' in value and 'sparse' not in value, 'Unsupported sparse hair accessor'
        value['bufferView']=copy_view(value['bufferView'])
        doc['accessors'].append(value)
        return len(doc['accessors'])-1
    primitive['indices']=copy_accessor(primitive['indices'])
    primitive['attributes']={k:copy_accessor(v) for k,v in primitive['attributes'].items()}
    # Native and frozen armatures can order joints differently, even though the head bind space agrees.
    joints=doc['skins'][source_hair['skin']]['joints']
    head_index=next(i for i,n in enumerate(joints) if doc['nodes'][n]['name']=='head')
    accessor=doc['accessors'][primitive['attributes']['JOINTS_0']]
    assert accessor['type']=='VEC4' and accessor['componentType'] in (5121,5123), 'Unsupported hair joints'
    view=doc['bufferViews'][accessor['bufferView']]
    fmt='<4B' if accessor['componentType']==5121 else '<4H'
    stride=view.get('byteStride',struct.calcsize(fmt))
    offset=view['byteOffset']+accessor.get('byteOffset',0)
    for vertex in range(accessor['count']): struct.pack_into(fmt,binary,offset+vertex*stride,head_index,0,0,0)
    accessor.pop('min',None); accessor.pop('max',None)
    mat=copy.deepcopy(native['materials'][primitive['material']])
    for extension in mat.get('extensions', {}):
        if extension not in doc.setdefault('extensionsUsed', []):
            doc['extensionsUsed'].append(extension)
    texture_info=mat['pbrMetallicRoughness']['baseColorTexture']
    texture=copy.deepcopy(native['textures'][texture_info['index']])
    image=copy.deepcopy(native['images'][texture['source']])
    image['bufferView']=copy_view(image['bufferView'])
    texture['source']=len(doc['images']); doc['images'].append(image)
    if 'sampler' in texture:
        doc['samplers'].append(copy.deepcopy(native['samplers'][texture['sampler']]))
        texture['sampler']=len(doc['samplers'])-1
    texture_info['index']=len(doc['textures']); doc['textures'].append(texture)
    old_mat=doc['meshes'][source_hair['mesh']]['primitives'][0]['material']
    doc['materials'][old_mat]=mat; primitive['material']=old_mat
    doc['meshes'][source_hair['mesh']]=native_mesh
    source_hair['extras']=copy.deepcopy(native_hair['extras'])
    binary.extend(b'\x00'*((-len(binary))%4))
    doc['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    encoded+=b' '*((-len(encoded))%4)
    data=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))
    data+=struct.pack('<I4s',len(encoded),b'JSON')+encoded
    data+=struct.pack('<I4s',len(binary),b'BIN\x00')+binary
    Path(output_path).write_bytes(data)
    assert {x['name'] for x in doc['animations']}=={'idle','walk','run','jump'}
    original,original_binary=read_glb(source_path)
    assert doc['animations']==original['animations'] and doc['skins']==original['skins']
    assert binary[:len(original_binary)]==original_binary, 'Frozen body/eye/action data changed'
    return {'bytes':len(data),'curves':len(source_hair['extras']['hairGuides']),'sourceBodyEyesActionsUnchanged':True}
