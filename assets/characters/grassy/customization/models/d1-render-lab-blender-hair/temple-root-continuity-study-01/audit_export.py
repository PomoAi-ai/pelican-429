"""Read final GLB bytes independently and compare frozen data plus temple motion tuples."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = next(path for path in HERE.parents if (path/'package.json').is_file())
FROZEN = ROOT/'public/characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb'
OUTPUT = HERE/'export/d1-outfit-assembly.glb'
NATIVE = HERE/'export/native-hair.glb'
SECTIONS = HERE/'draft-01/candidate-sections.json'
RUNTIME = HERE/'draft-01/candidate-runtime.npz'
SOURCE_RUNTIME = HERE/'source-runtime.npz'
PBR = HERE/'draft-01/PBR-Game-Export.blend'
spec = importlib.util.spec_from_file_location('temple_export_read_glb', BASE/'publish_hair.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def accessor(doc, binary, index):
    data = doc['accessors'][index]
    assert 'sparse' not in data
    view = doc['bufferViews'][data['bufferView']]
    assert view['buffer'] == 0 and 'EXT_meshopt_compression' not in view.get('extensions', {})
    dtype = np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[data['componentType']])
    width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[data['type']]
    offset = view.get('byteOffset',0)+data.get('byteOffset',0)
    stride = view.get('byteStride',width*dtype.itemsize)
    result = np.ndarray((data['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,dtype.itemsize)).copy()
    assert not data.get('normalized',False), 'New Hair accessor normalization is outside this export contract'
    return result


def hair_data(doc, binary):
    node = next(node for node in doc['nodes'] if node.get('name') == 'Hair')
    mesh = doc['meshes'][node['mesh']]
    assert len(mesh['primitives']) == 1
    primitive = mesh['primitives'][0]
    return node, primitive, {name: accessor(doc,binary,index) for name,index in primitive['attributes'].items()}


def canonical_triangles(triangles):
    rotated = np.asarray([np.roll(t,-int(t.argmin())) for t in triangles])
    return rotated[np.lexsort(rotated[:, ::-1].T)]


def main():
    inputs = [OUTPUT,NATIVE,FROZEN,SECTIONS,RUNTIME,SOURCE_RUNTIME,PBR,HERE/'export/export-report.json']
    before = {str(path): sha(path) for path in inputs}
    assert before[str(OUTPUT)] == 'ea7242b7607b23d6a823c238811fe3b3064fb968d39c404741fd3fc5dc7afde6'
    doc,binary = reader.read_glb(OUTPUT)
    frozen,original_binary = reader.read_glb(FROZEN)
    native,native_binary = reader.read_glb(NATIVE)
    node,primitive,attributes = hair_data(doc,binary)
    native_node,native_primitive,native_attributes = hair_data(native,native_binary)
    frozen_node = next(n for n in frozen['nodes'] if n.get('name') == 'Hair')
    assert node['mesh'] == frozen_node['mesh']
    assert doc['animations'] == frozen['animations'] and doc['skins'] == frozen['skins']
    assert {a['name'] for a in doc['animations']} == {'idle','walk','run','jump'}
    assert binary[:len(original_binary)] == original_binary
    assert len(doc['meshes']) == len(frozen['meshes']) and len(doc['nodes']) == len(frozen['nodes'])
    assert doc['scenes'] == frozen['scenes'] and doc.get('scene') == frozen.get('scene')
    nonhair_materials = set()
    for i,old_mesh in enumerate(frozen['meshes']):
        if i == node['mesh']:
            continue
        assert doc['meshes'][i] == old_mesh
        nonhair_materials.update(p['material'] for p in old_mesh['primitives'] if 'material' in p)
    assert all(doc['materials'][i] == frozen['materials'][i] for i in nonhair_materials)
    for old,new in zip(frozen['nodes'],doc['nodes'],strict=True):
        assert ({k:v for k,v in old.items() if k != 'extras'} == {k:v for k,v in new.items() if k != 'extras'}) if old is frozen_node else old == new
    for key in ('accessors','bufferViews','images','textures','samplers'):
        assert doc.get(key,[])[:len(frozen.get(key,[]))] == frozen.get(key,[])
    assert node['extras'] == native_node['extras']
    assert set(attributes) == set(native_attributes)
    for name in attributes:
        assert np.isfinite(attributes[name]).all()
        if name != 'JOINTS_0':
            assert np.array_equal(attributes[name],native_attributes[name]), f'Published {name} changed'
    assert np.array_equal(accessor(doc,binary,primitive['indices']),accessor(native,native_binary,native_primitive['indices']))
    required = {'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0','_D1_STRAND_ID','_D1_STRAND_T','_D1_HAIR_FLOW'}
    assert required.issubset(attributes)
    count = len(attributes['POSITION'])
    assert all(len(value) == count for value in attributes.values())
    guides = node['extras']['hairGuides']
    guide_ids = [guide['id'] for guide in guides]
    ids,t,flow = attributes['_D1_STRAND_ID'][:,0],attributes['_D1_STRAND_T'][:,0],attributes['_D1_HAIR_FLOW']
    assert len(guide_ids) == len(set(guide_ids)) and all(isinstance(i,int) for i in guide_ids)
    assert set(ids) == {-1,*guide_ids} and np.all((t >= 0)&(t <= 1)) and np.all(t[ids == -1] == 0)
    assert np.allclose(np.linalg.norm(flow,axis=1),1.,atol=1e-6,rtol=0)
    joints = doc['skins'][node['skin']]['joints']
    head_index = next(i for i,index in enumerate(joints) if doc['nodes'][index]['name'] == 'head')
    assert np.all(attributes['JOINTS_0'] == [head_index,0,0,0])
    assert np.all(attributes['WEIGHTS_0'] == [1,0,0,0])
    for guide in guides:
        assert guide['region'] in ('fringe','bob','side','braid','crown')
        assert np.isfinite(guide['stiffness']) and 0 <= guide['stiffness'] <= 1
        assert np.isfinite([guide['root'],guide['tip']]).all() and guide['root'] != guide['tip']
    triangles = accessor(doc,binary,primitive['indices'])[:,0].reshape(-1,3)
    assert np.all(ids[triangles] == ids[triangles[:,0]][:,None])
    sections = json.loads(SECTIONS.read_text())
    data,old_data = np.load(RUNTIME),np.load(SOURCE_RUNTIME)
    components = []
    for i,description in enumerate(sections['components']):
        expected_guide = description['oldRuntimeGuide']
        actual_guide = next(g for g in guides if g['name'] == expected_guide['name'])
        assert actual_guide['region'] == expected_guide['region'] and actual_guide['stiffness'] == expected_guide['stiffness']
        assert np.array_equal(actual_guide['root'],expected_guide['root']) and np.array_equal(actual_guide['tip'],expected_guide['tip'])
        expected_position = (data[f'{i}_points'][:,[0,2,1]]*[1,1,-1]).astype(np.float32)
        expected_t = data[f'{i}_runtimeT'].astype(np.float32)
        expected_flow = data[f'{i}_runtimeFlow'].astype(np.float32)
        chosen = np.flatnonzero(ids == actual_guide['id'])
        expected = np.column_stack([expected_position,expected_t,expected_flow]).astype(np.float32)
        actual = np.column_stack([attributes['POSITION'][chosen],t[chosen],flow[chosen]])
        assert np.array_equal(np.unique(actual,axis=0),np.unique(expected,axis=0)), f"{description['name']}: position/T/flow tuple changed"
        position_index = {tuple(point):index for index,point in enumerate(expected_position)}
        assert len(position_index) == len(expected_position)
        source_vertex = np.asarray([position_index[tuple(point)] for point in attributes['POSITION'][chosen]])
        assert np.array_equal(t[chosen],expected_t[source_vertex])
        assert np.array_equal(t[chosen] <= .3,expected_t[source_vertex] <= .3)
        assert np.array_equal(expected_t,old_data[f'{i}_runtimeT'].astype(np.float32))
        assert np.array_equal(t[chosen] <= .3,old_data[f'{i}_runtimeT'].astype(np.float32)[source_vertex] <= .3)
        component_triangles = triangles[ids[triangles[:,0]] == actual_guide['id']]
        remapped = np.asarray([[position_index[tuple(attributes['POSITION'][vertex])] for vertex in triangle] for triangle in component_triangles])
        assert np.array_equal(canonical_triangles(remapped),canonical_triangles(data[f'{i}_triangles'])), f"{description['name']}: triangle topology or winding changed"
        components.append(dict(name=description['name'],actualGuide=actual_guide,sourceVertices=len(expected_position),
            exportedVerticesIncludingUVSeams=len(chosen),triangles=len(component_triangles),
            uniqueSourceFixedVertices=int(np.count_nonzero(expected_t <= .3)),exportedFixedVerticesIncludingUVSeams=int(np.count_nonzero(t[chosen] <= .3)),
            sourceTExactlyFloat32Preserved=True,fixedMaskExactlyPreserved=True,fixedMaskAlsoMatchesPreRepair=True,
            positionAndTAndFlowTuplesExactlyPreserved=True,rootTipExactlyPreserved=True,triangleTopologyAndWindingExactlyPreserved=True,
            maximumTAbsoluteDifference=float(np.max(np.abs(t[chosen]-expected_t[source_vertex]))),
            maximumFlowAbsoluteDifference=float(np.max(np.abs(flow[chosen]-expected_flow[source_vertex])))))
    export_report = json.loads((HERE/'export/export-report.json').read_text())
    assert before[str(PBR)] == export_report['sourceBlendSha256'] and before[str(OUTPUT)] == export_report['outputSha256']
    assert all(sha(Path(path)) == value for path,value in before.items())
    result = dict(output=str(OUTPUT),outputSHA256=before[str(OUTPUT)],frozenSHA256=before[str(FROZEN)],
        inputsUnchanged=True,inputSHA256=before,passed=True,
        frozenContract=dict(originalBinaryPrefixBytes=len(original_binary),originalBinaryPrefixExactlyPreserved=True,
            nonHairMeshCount=len(doc['meshes'])-1,nonHairMeshesAndNodesExactlyPreserved=True,
            nonHairMaterialsExactlyPreserved=True,skinsExactlyPreserved=True,bodyEyesAndActionBuffersExactlyPreserved=True,
            animationsExactlyPreserved=True,animations=[dict(name=a['name'],channels=len(a['channels']),samplers=len(a['samplers'])) for a in doc['animations']]),
        hairContract=dict(singlePrimitive=True,vertices=count,guideCount=len(guides),completeIdSet=True,
            allGuideMetadataValid=True,allAttributesFiniteAndSameVertexCount=True,unitFlow=True,
            allPublishedAttributesMatchNativeExceptRemappedJoints=True,headJointIndex=head_index,fullyHeadWeighted=True,
            nativeGuidesExactlyPreserved=True,top=float(attributes['POSITION'][:,1].max())),
        temples=components,limits=['Read-only file contract audit; does not repeat motion replay or visual/animation acceptance.'])
    (HERE/'export-audit.json').write_text(json.dumps(result,indent=2)+'\n')
    print('EXPORT_AUDIT_PASS',json.dumps(dict(outputSHA256=result['outputSHA256'],frozen=result['frozenContract'],hair=result['hairContract'],temples=components)),flush=True)


if __name__ == '__main__':
    main()
