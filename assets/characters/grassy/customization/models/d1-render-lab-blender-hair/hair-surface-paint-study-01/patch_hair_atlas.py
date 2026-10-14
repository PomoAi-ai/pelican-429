"""Append the continuous-colour study PNG to an existing GLB; preserve all old data.

Run with uv run --no-project --with pillow python3 patch_hair_atlas.py
  --input SOURCE.glb --output STUDY.glb [--expect-input-sha SHA256]
The accepted inputs retain the temple-root Hair node and uncompressed native
Hair attributes. The script deliberately fails on a different atlas contract.
"""
import argparse
import copy
import hashlib
import io
import json
import struct
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

HERE=Path(__file__).resolve().parent
ATLAS=HERE/'draft-02/hair-continuous-flow-atlas.png'
RECIPE=HERE/'draft-02/paint-report.json'
JSON_CHUNK=0x4E4F534A
BIN_CHUNK=0x004E4942


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    raw=path.read_bytes()
    magic,version,total=struct.unpack_from('<4sII',raw)
    assert magic==b'glTF' and version==2 and total==len(raw),(str(path),'GLB header')
    chunks=[];offset=12
    while offset<len(raw):
        size,kind=struct.unpack_from('<II',raw,offset);offset+=8
        assert size%4==0 and offset+size<=len(raw),'Malformed GLB chunk'
        chunks.append((kind,raw[offset:offset+size]));offset+=size
    assert [c[0] for c in chunks]==[JSON_CHUNK,BIN_CHUNK],'Expected one JSON and one BIN chunk'
    doc=json.loads(chunks[0][1]);binary=chunks[1][1]
    assert doc['buffers'][0].get('uri') is None
    assert 0<=len(binary)-doc['buffers'][0]['byteLength']<=3
    return doc,binary,raw


def write_glb(path,doc,binary):
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    encoded+=b' '*((-len(encoded))%4)
    padded=binary+b'\0'*((-len(binary))%4)
    raw=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(padded))
    raw+=struct.pack('<II',len(encoded),JSON_CHUNK)+encoded
    raw+=struct.pack('<II',len(padded),BIN_CHUNK)+padded
    with path.open('xb') as f:f.write(raw)


def accessor(doc,binary,index,width):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    assert a['componentType']==5126 and a['type']=={1:'SCALAR',2:'VEC2'}[width]
    assert not a.get('normalized',False) and 'sparse' not in a
    assert v['buffer']==0 and 'EXT_meshopt_compression' not in v.get('extensions',{})
    start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',4*width)
    return [struct.unpack_from('<'+'f'*width,binary,start+i*stride) for i in range(a['count'])]


def material_texture_uses(materials,index):
    uses=[]
    def visit(value,path,mi):
        if isinstance(value,dict):
            for key,item in value.items():
                if key.endswith('Texture') and isinstance(item,dict) and item.get('index')==index:
                    uses.append((mi,path+[key]))
                visit(item,path+[key],mi)
        elif isinstance(value,list):
            for i,item in enumerate(value):visit(item,path+[i],mi)
    for i,m in enumerate(materials):visit(m,[],i)
    return uses


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--expect-input-sha')
    args=parser.parse_args()
    source=args.input.resolve();output=args.output.resolve()
    assert source!=output and not output.exists(),'Output must be a new independent file'
    original,binary,raw=read_glb(source)
    if args.expect_input_sha:assert digest(raw)==args.expect_input_sha,'Unexpected input SHA256'
    matches=[(i,n) for i,n in enumerate(original['nodes']) if n.get('name')=='Hair']
    assert len(matches)==1,'Expected exactly one Hair node'
    node_index,node=matches[0];mesh_index=node['mesh']
    primitives=original['meshes'][mesh_index]['primitives']
    assert len(primitives)==1,'Hair must remain one primitive'
    primitive=primitives[0];material_index=primitive['material']
    for mi,m in enumerate(original['meshes']):
        assert mi==mesh_index or all(p.get('material')!=material_index for p in m['primitives']),'Hair material is shared by a non-Hair mesh'
    material=original['materials'][material_index]
    texture_index=material['pbrMetallicRoughness']['baseColorTexture']['index']
    assert material_texture_uses(original['materials'],texture_index)==[(material_index,['pbrMetallicRoughness','baseColorTexture'])],'Texture must serve only Hair base colour'
    texture=original['textures'][texture_index]
    assert 'source' in texture and not texture.get('extensions'),'Hair atlas must use its existing direct PNG source'
    old_image_index=texture['source'];old_image=original['images'][old_image_index]
    assert old_image['mimeType']=='image/png' and 'uri' not in old_image
    old_view=original['bufferViews'][old_image['bufferView']]
    assert old_view['buffer']==0
    old_png=binary[old_view.get('byteOffset',0):old_view.get('byteOffset',0)+old_view['byteLength']]
    png=ATLAS.read_bytes()
    old_pixels=Image.open(io.BytesIO(old_png)).convert('RGBA')
    new_pixels=Image.open(io.BytesIO(png)).convert('RGBA')
    assert old_pixels.size==new_pixels.size==(2048,2048),'Unexpected Hair atlas size'
    width,height=new_pixels.size
    recipe=json.loads(RECIPE.read_text());components=recipe['components']
    uvs=accessor(original,binary,primitive['attributes']['TEXCOORD_0'],2)
    ids=[int(row[0]) for row in accessor(original,binary,primitive['attributes']['_D1_STRAND_ID'],1)]
    assert len(uvs)==len(ids)
    guides=node['extras']['hairGuides'];guide_names={g['id']:g['name'] for g in guides}
    referenced=Counter((int(u*width)//292,int((1-v)*height)//292) for u,v in uvs)
    allowed=Image.new('L',(width,height),0);draw=ImageDraw.Draw(allowed)
    tile_contract=[]
    for component in components:
        name=component['name'];tile=tuple(component['tile'])
        selected_ids={i for i,n in guide_names.items() if n==name or n.startswith(name+' / ')}
        assert selected_ids,(name,'Missing Hair guide')
        all_tile_ids={strand for strand,(u,v) in zip(ids,uvs) if (int(u*width)//292,int((1-v)*height)//292)==tile}
        assert all_tile_ids==selected_ids,(name,'Tile is unused or leaks into a different component',all_tile_ids,selected_ids)
        chosen=[uv for strand,uv in zip(ids,uvs) if strand in selected_ids]
        assert chosen and all((int(u*width)//292,int((1-v)*height)//292)==tile for u,v in chosen),(name,'Guide references another tile')
        x0=tile[0]*292;y0=height-(tile[1]+1)*292
        draw.rectangle((x0,y0,x0+291,y0+291),fill=255)
        tile_contract.append(dict(name=name,tile=list(tile),guideIds=sorted(selected_ids),referencedVertices=len(chosen)))
    difference=ImageChops.difference(old_pixels,new_pixels)
    changed=difference.getchannel('R')
    for channel in ('G','B','A'):changed=ImageChops.lighter(changed,difference.getchannel(channel))
    changed=changed.point(lambda v:255 if v else 0)
    assert ImageChops.multiply(changed,ImageChops.invert(allowed)).getbbox() is None,'Non-target or unreferenced atlas tile changed'
    assert ImageChops.difference(old_pixels.getchannel('A'),new_pixels.getchannel('A')).getbbox() is None,'Atlas alpha changed'
    doc=copy.deepcopy(original)
    view_index=len(doc['bufferViews']);image_index=len(doc['images']);png_offset=len(binary)
    doc['bufferViews'].append(dict(buffer=0,byteOffset=png_offset,byteLength=len(png)))
    doc['images'].append(dict(bufferView=view_index,mimeType='image/png',name='hair-continuous-flow-study'))
    doc['textures'][texture_index]['source']=image_index
    expanded=binary+png
    doc['buffers'][0]['byteLength']=len(expanded)
    output.parent.mkdir(parents=True,exist_ok=True)
    write_glb(output,doc,expanded)
    actual,actual_binary,actual_raw=read_glb(output)
    assert actual_binary[:len(binary)]==binary,'Old BIN prefix changed'
    assert actual_binary[png_offset:png_offset+len(png)]==png,'Appended image differs from the supplied PNG'
    restored=copy.deepcopy(actual)
    assert restored['bufferViews'].pop()==doc['bufferViews'][-1]
    assert restored['images'].pop()==doc['images'][-1]
    restored['textures'][texture_index]['source']=old_image_index
    restored['buffers'][0]['byteLength']=original['buffers'][0]['byteLength']
    assert restored==original,'Unexpected JSON mutation outside the explicit append/redirect contract'
    assert source.read_bytes()==raw,'Input file changed'
    assert ATLAS.read_bytes()==png,'Source atlas changed'
    report=dict(input=str(source),inputSHA256=digest(raw),output=str(output),outputSHA256=digest(actual_raw),
        experimentLabel='连续发色试验；不代表原画匹配通过',passed=True,published=False,
        allowedJSONChanges=[f'textures[{texture_index}].source','buffers[0].byteLength',f'bufferViews[{view_index}] appended',f'images[{image_index}] appended'],
        allOtherJSONExactlyPreserved=True,allMaterialsExactlyPreserved=actual['materials']==original['materials'],
        allMeshesNodesAccessorsSkinsAnimationsExactlyPreserved=all(actual.get(k)==original.get(k) for k in ('meshes','nodes','accessors','skins','animations','scenes','scene')),
        oldBINPrefixBytes=len(binary),oldBINPrefixSHA256=digest(binary),oldBINPrefixByteIdentical=True,
        allOldBufferViewsAndImagesPreserved=True,allExistingImageBytesPreserved=True,
        hairNodeIndex=node_index,hairMaterialIndex=material_index,hairTextureIndex=texture_index,
        oldHairImageIndex=old_image_index,newHairImageIndex=image_index,newImageBufferView=view_index,
        newPNG_SHA256=digest(png),newPNG_Bytes=len(png),newPNGByteIdentical=True,
        atlasSize=[width,height],changedPixels=changed.histogram()[255],outsideTargetTileChangedPixels=0,
        referencedTileCount=len(referenced),targetTiles=tile_contract,unreferencedTilesUnchanged=True,
        hairGuideCount=len(guides),hairGuidesID_T_FlowAndGeometryByteIdentical=True,
        animationNames=[a['name'] for a in actual['animations']],
        limits='Container/image patch only. It preserves input eye geometry and image bytes; it does not independently approve the input eye export or runtime appearance.')
    output.with_suffix('.contract.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
