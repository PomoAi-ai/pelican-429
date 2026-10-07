// Prune superseded accessors and restore lossless meshopt for web texture tiers.
// Textures, node transforms, skinning and animation samples are copied verbatim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from '../../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const folder='output/hair-rebuild-probe';
const entries=JSON.parse(fs.readFileSync(`${folder}/replacement-map.json`));
const pad=bytes=>Buffer.concat([bytes,Buffer.alloc(-bytes.length&3)]);
for(const entry of entries){
 const bytes=fs.readFileSync(entry.candidate),end=20+bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,end)),bin=bytes.subarray(end+8);
 const accessors=[],accessorMap=new Map(),views=[],viewMap=new Map();
 const selectView=index=>{if(!viewMap.has(index)){viewMap.set(index,views.length);views.push(doc.bufferViews[index]);}return viewMap.get(index);};
 const selectAccessor=index=>{
  if(!accessorMap.has(index)){
   const value=structuredClone(doc.accessors[index]);accessorMap.set(index,accessors.length);accessors.push(value);
   if(value.bufferView!==undefined)value.bufferView=selectView(value.bufferView);
   if(value.sparse){value.sparse.indices.bufferView=selectView(value.sparse.indices.bufferView);value.sparse.values.bufferView=selectView(value.sparse.values.bufferView);}
  }
  return accessorMap.get(index);
 };
 for(const mesh of doc.meshes)for(const p of mesh.primitives){
  for(const [key,value]of Object.entries(p.attributes))p.attributes[key]=selectAccessor(value);
  if(p.indices!==undefined)p.indices=selectAccessor(p.indices);
  for(const target of p.targets??[])for(const [key,value]of Object.entries(target))target[key]=selectAccessor(value);
 }
 for(const animation of doc.animations??[])for(const sampler of animation.samplers){sampler.input=selectAccessor(sampler.input);sampler.output=selectAccessor(sampler.output);}
 for(const skin of doc.skins??[])if(skin.inverseBindMatrices!==undefined)skin.inverseBindMatrices=selectAccessor(skin.inverseBindMatrices);
 for(const image of doc.images??[])if(image.bufferView!==undefined)image.bufferView=selectView(image.bufferView);
 doc.accessors=accessors;doc.bufferViews=views;
 const layouts=new Map(),widths={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 for(const a of accessors){
  const stride=widths[a.componentType]*sizes[a.type];assert.ok(stride);
  if(a.bufferView!==undefined)layouts.set(a.bufferView,{byteStride:views[a.bufferView].byteStride??stride,mode:a.type==='SCALAR'&&[5123,5125].includes(a.componentType)?'INDICES':'ATTRIBUTES'});
  if(a.sparse){layouts.set(a.sparse.indices.bufferView,{byteStride:widths[a.sparse.indices.componentType],mode:'INDICES'});layouts.set(a.sparse.values.bufferView,{byteStride:stride,mode:'ATTRIBUTES'});}
 }
 const compress=/\.(?:web|web-1k|ktx2(?:-256)?(?:-compact)?)\.glb$/.test(entry.source);
 let offset=0,decodedOffset=0;const parts=[];
 for(const [i,view]of views.entries()){
  assert.equal(view.buffer,0);assert.equal(view.extensions?.EXT_meshopt_compression,undefined,'Run clean_body.py before packing');
  const raw=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),layout=layouts.get(i);let stored=raw,compression;
  if(compress&&layout&&raw.length%layout.byteStride===0&&(layout.mode==='INDICES'?[2,4].includes(layout.byteStride):layout.byteStride%4===0&&layout.byteStride<=256)){
   const encoded=Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw,raw.length/layout.byteStride,layout.byteStride,layout.mode));
   if(encoded.length+192<raw.length){
    compression={buffer:0,byteOffset:offset,byteLength:encoded.length,count:raw.length/layout.byteStride,...layout};stored=encoded;
    const decoded=Buffer.alloc(raw.length);MeshoptDecoder.decodeGltfBuffer(decoded,compression.count,compression.byteStride,encoded,compression.mode);assert.ok(decoded.equals(raw),`${entry.source}: meshopt changed buffer ${i}`);
   }
  }
  if(compression){doc.bufferViews[i]={...view,buffer:1,byteOffset:decodedOffset,extensions:{...view.extensions,EXT_meshopt_compression:compression}};decodedOffset+=Math.ceil(raw.length/4)*4;}
  else doc.bufferViews[i]={...view,byteOffset:offset};
  const part=pad(stored);parts.push(part);offset+=part.length;
 }
 doc.buffers=[{byteLength:offset}];
 if(decodedOffset){doc.buffers.push({byteLength:decodedOffset,extensions:{EXT_meshopt_compression:{fallback:true}}});for(const key of ['extensionsUsed','extensionsRequired'])doc[key]=[...new Set([...(doc[key]??[]),'EXT_meshopt_compression'])];}
 const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.alloc(-json.length&3,32),newBin=Buffer.concat(parts),head=Buffer.alloc(20),bh=Buffer.alloc(8);
 head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+jp.length+newBin.length,8);head.writeUInt32LE(json.length+jp.length,12);head.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(newBin.length);bh.writeUInt32LE(0x004e4942,4);
 const output=Buffer.concat([head,json,jp,bh,newBin]);fs.writeFileSync(entry.candidate,output);console.log(`${entry.source}: ${bytes.length} -> ${output.length}`);
}
